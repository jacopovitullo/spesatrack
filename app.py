"""
app.py — Entry point SpesaTrack.
Avvia Flask + bot Telegram in thread separato.
"""

import threading
import asyncio
import logging
import sys
from datetime import timedelta

from flask import Flask, render_template, session, redirect, url_for, request, jsonify
from flask_cors import CORS

from config import (
    FLASK_SECRET_KEY, FLASK_PORT, FLASK_DEBUG,
    TELEGRAM_TOKEN,
)
from api.spese import spese_bp
from api.categorie import categorie_bp
from api.config_api import config_bp
from api.export import export_bp
from api.entrate import entrate_bp
from api.abbonamenti import abbonamenti_bp
from auth.auth_bp import auth_bp
from auth.admin_bp import admin_bp

# ─── Flask app ────────────────────────────────────────────────────

app = Flask(__name__)
app.secret_key = FLASK_SECRET_KEY
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=7)
CORS(app)

# Registra blueprint con prefisso /api
app.register_blueprint(spese_bp, url_prefix='/api')
app.register_blueprint(categorie_bp, url_prefix='/api')
app.register_blueprint(config_bp, url_prefix='/api')
app.register_blueprint(export_bp, url_prefix='/api')
app.register_blueprint(entrate_bp, url_prefix='/api')
app.register_blueprint(abbonamenti_bp, url_prefix='/api')

# Registra blueprint auth (login, logout, register, me, profile)
app.register_blueprint(auth_bp)
# Registra blueprint admin (/admin, /admin/api/*)
app.register_blueprint(admin_bp)

# ─── Protezione route ─────────────────────────────────────────────

# Path che non richiedono autenticazione
_EXEMPT = ['/login', '/logout', '/register', '/static']


@app.before_request
def enforce_login():
    path = request.path
    if any(path == p or path.startswith(p + '/') or path.startswith(p + '?')
           for p in _EXEMPT):
        return
    if not session.get('user_id'):
        if path.startswith('/api/') or path.startswith('/admin/api/'):
            return jsonify({"error": "Non autenticato"}), 401
        return redirect(url_for('auth.login_page'))


@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def index(path):
    """Serve la SPA per tutte le route non-API."""
    if session.get('role') == 'admin':
        return redirect(url_for('admin.admin_page'))
    return render_template('index.html',
                           user_email=session.get('email', ''),
                           user_name=session.get('display_name', ''),
                           user_role=session.get('role', 'user'))


# ─── Bot Telegram ─────────────────────────────────────────────────

def avvia_bot_per_utente(user: dict):
    """Avvia il bot Telegram per un singolo utente (thread dedicato)."""
    token = user.get('telegram_token', '')
    email = user.get('email', user.get('id', '?'))

    async def _run():
        from supabase import create_client
        from bot.handlers import build_application
        client = create_client(user['supabase_url'], user['supabase_key'])
        telegram_app = build_application(token, client)
        try:
            await telegram_app.initialize()
            await telegram_app.start()
            await telegram_app.updater.start_polling(drop_pending_updates=True)
            me = await telegram_app.bot.get_me()
            print(f"   Bot @{me.username} ({email}) ✅", flush=True)
            while True:
                await asyncio.sleep(3600)
        except Exception as e:
            print(f"   Bot ({email}): ❌ errore — {e}", flush=True)
        finally:
            try:
                await telegram_app.updater.stop()
                await telegram_app.stop()
                await telegram_app.shutdown()
            except Exception:
                pass

    try:
        asyncio.run(_run())
    except Exception as e:
        print(f"   Bot avvio ({email}): ❌ — {e}", flush=True)


def avvia_scheduler():
    """Avvia lo scheduler notifiche in un thread dedicato."""
    async def _run():
        from apscheduler.schedulers.asyncio import AsyncIOScheduler
        scheduler = AsyncIOScheduler()
        scheduler.add_job(_notifica_giornaliera_tutti, 'cron', hour=21, minute=0)
        scheduler.add_job(_notifica_settimanale_tutti, 'cron', day_of_week='mon', hour=9, minute=0)
        scheduler.add_job(_addebita_abbonamenti_tutti, 'cron', hour=8, minute=0)
        scheduler.start()
        print("   Scheduler notifiche: ✅ attivo", flush=True)
        while True:
            await asyncio.sleep(3600)

    try:
        asyncio.run(_run())
    except Exception as e:
        print(f"   Scheduler: ❌ errore — {e}", flush=True)


def avvia_tutti_i_bot():
    """Carica tutti gli utenti attivi con telegram_token e avvia un bot per ciascuno."""
    from auth.admin_client import get_admin_client
    try:
        users = get_admin_client().table('st_users').select(
            'id, email, supabase_url, supabase_key, telegram_token'
        ).eq('is_active', True).execute()

        bot_count = 0
        for user in (users.data or []):
            if not user.get('telegram_token') or len(user['telegram_token']) < 10:
                continue
            t = threading.Thread(target=avvia_bot_per_utente, args=(user,), daemon=True)
            t.start()
            bot_count += 1

        if bot_count == 0:
            print("   Bot Telegram: ⚠️  Nessun utente con token configurato", flush=True)
    except Exception as e:
        print(f"   Bot Telegram: ❌ errore caricamento utenti — {e}", flush=True)


async def _addebita_abbonamenti_tutti():
    """Ogni mattina: addebita abbonamenti per tutti gli utenti attivi."""
    from auth.admin_client import get_admin_client
    try:
        users = get_admin_client().table('st_users').select(
            'id, supabase_url, supabase_key'
        ).eq('is_active', True).execute()
        for user in (users.data or []):
            try:
                await _addebita_abbonamenti_per_utente(user['supabase_url'], user['supabase_key'])
            except Exception as e:
                logging.warning(f"Addebito abbonamenti utente {user['id']}: {e}")
    except Exception as e:
        logging.warning(f"Errore addebito abbonamenti (loop utenti): {e}")


async def _addebita_abbonamenti_per_utente(supabase_url: str, supabase_key: str):
    """Crea spese per abbonamenti attivi con giorno_addebito == oggi."""
    from datetime import date
    from supabase import create_client
    db = create_client(supabase_url, supabase_key)
    oggi = date.today()

    res = db.table("abbonamenti").select("*").eq("attivo", True).execute()
    abbonamenti = res.data or []

    for abb in abbonamenti:
        frequenza = abb.get("frequenza", "mensile")
        giorno = abb.get("giorno_addebito", 1)

        da_addebitare = False
        if frequenza == "mensile" and oggi.day == giorno:
            da_addebitare = True
        elif frequenza == "annuale":
            data_inizio = abb.get("data_inizio", oggi.isoformat())
            try:
                d = date.fromisoformat(data_inizio)
                if oggi.month == d.month and oggi.day == d.day:
                    da_addebitare = True
            except Exception:
                pass
        elif frequenza == "settimanale" and oggi.weekday() == (giorno % 7):
            da_addebitare = True

        if not da_addebitare:
            continue

        oggi_iso = oggi.isoformat()
        check = (
            db.table("spese")
            .select("id")
            .eq("fonte", "abbonamento")
            .ilike("descrizione", abb["descrizione"])
            .eq("data", oggi_iso)
            .execute()
        )
        if check.data:
            continue

        nuova_spesa = {
            "descrizione": abb["descrizione"],
            "importo": abb["importo"],
            "categoria_id": abb.get("categoria_id"),
            "data": oggi_iso,
            "fonte": "abbonamento",
            "note": abb.get("note", ""),
        }
        nuova_spesa = {k: v for k, v in nuova_spesa.items() if v is not None}
        db.table("spese").insert(nuova_spesa).execute()

        if abb.get("tipo") == "rata":
            n_pagate = (abb.get("n_rate_pagate") or 0) + 1
            update_data = {"n_rate_pagate": n_pagate}
            n_totali = abb.get("n_rate_totali")
            if n_totali and n_pagate >= n_totali:
                update_data["attivo"] = False
                update_data["data_fine"] = oggi_iso
            db.table("abbonamenti").update(update_data).eq("id", abb["id"]).execute()


async def _notifica_giornaliera_tutti():
    """Invia riepilogo giornaliero a tutti gli utenti configurati."""
    from auth.admin_client import get_admin_client
    try:
        users = get_admin_client().table('st_users').select(
            'id, supabase_url, supabase_key, telegram_token, telegram_chat_id'
        ).eq('is_active', True).execute()
        for user in (users.data or []):
            if not user.get('telegram_token') or not user.get('telegram_chat_id'):
                continue
            try:
                await _notifica_giornaliera_per_utente(
                    user['supabase_url'], user['supabase_key'],
                    user['telegram_token'], user['telegram_chat_id']
                )
            except Exception as e:
                logging.warning(f"Notifica giornaliera utente {user['id']}: {e}")
    except Exception as e:
        logging.warning(f"Errore notifica giornaliera (loop utenti): {e}")


async def _notifica_giornaliera_per_utente(supabase_url, supabase_key, tg_token, tg_chat_id):
    from datetime import date
    from supabase import create_client
    from bot.formatter import formato_importo
    from telegram import Bot

    db = create_client(supabase_url, supabase_key)
    cfg = db.table("bot_config").select("*").eq("id", 1).execute()
    if not cfg.data:
        return
    conf = cfg.data[0]
    if not conf.get("notifica_giornaliera"):
        return

    oggi = date.today().isoformat()
    res = db.table("spese").select("importo").eq("data", oggi).execute()
    spese = res.data or []
    totale = sum(s["importo"] for s in spese)
    testo = f"🌙 *Riepilogo di oggi*\nSpese: {len(spese)} · Totale: {formato_importo(totale)}"

    bot = Bot(token=tg_token)
    await bot.send_message(chat_id=tg_chat_id, text=testo, parse_mode="Markdown")

    # Alert budget
    if conf.get("alert_budget"):
        from calendar import monthrange
        mese, anno = oggi[:7].split("-")
        _, giorni = monthrange(int(anno), int(mese))
        primo = f"{anno}-{mese}-01"
        ultimo = f"{anno}-{mese}-{giorni:02d}"
        res_mese = db.table("spese").select("importo").gte("data", primo).lte("data", ultimo).execute()
        totale_mese = sum(float(s["importo"]) for s in (res_mese.data or []))
        cfg_app = db.table("app_config").select("budget_mensile_globale").limit(1).execute()
        budget = float((cfg_app.data[0].get("budget_mensile_globale") or 0) if cfg_app.data else 0)
        if budget > 0 and totale_mese >= budget:
            perc = round(totale_mese / budget * 100)
            msg = (f"⚠️ *Budget mensile superato!*\n"
                   f"Speso: {formato_importo(totale_mese)} su {formato_importo(budget)} ({perc}%)")
            await bot.send_message(chat_id=tg_chat_id, text=msg, parse_mode="Markdown")


async def _notifica_settimanale_tutti():
    """Invia riepilogo settimanale a tutti gli utenti configurati."""
    from auth.admin_client import get_admin_client
    try:
        users = get_admin_client().table('st_users').select(
            'id, supabase_url, supabase_key, telegram_token, telegram_chat_id'
        ).eq('is_active', True).execute()
        for user in (users.data or []):
            if not user.get('telegram_token') or not user.get('telegram_chat_id'):
                continue
            try:
                await _notifica_settimanale_per_utente(
                    user['supabase_url'], user['supabase_key'],
                    user['telegram_token'], user['telegram_chat_id']
                )
            except Exception as e:
                logging.warning(f"Notifica settimanale utente {user['id']}: {e}")
    except Exception as e:
        logging.warning(f"Errore notifica settimanale (loop utenti): {e}")


async def _notifica_settimanale_per_utente(supabase_url, supabase_key, tg_token, tg_chat_id):
    from datetime import date, timedelta
    from supabase import create_client
    from bot.formatter import formato_importo
    from telegram import Bot

    db = create_client(supabase_url, supabase_key)
    cfg = db.table("bot_config").select("*").eq("id", 1).execute()
    if not cfg.data:
        return
    conf = cfg.data[0]
    if not conf.get("notifica_settimanale"):
        return

    oggi = date.today()
    sette_fa = (oggi - timedelta(days=7)).isoformat()
    res = db.table("spese").select("importo").gte("data", sette_fa).execute()
    spese = res.data or []
    totale = sum(s["importo"] for s in spese)
    testo = f"📆 *Riepilogo settimana*\nSpese: {len(spese)} · Totale: {formato_importo(totale)}"

    bot = Bot(token=tg_token)
    await bot.send_message(chat_id=tg_chat_id, text=testo, parse_mode="Markdown")


# ─── Main ─────────────────────────────────────────────────────────

if __name__ == '__main__':
    logging.basicConfig(
        level=logging.WARNING,
        format='%(levelname)s %(name)s: %(message)s',
    )
    # Silenzia log verbosi
    logging.getLogger('httpx').setLevel(logging.WARNING)
    logging.getLogger('telegram').setLevel(logging.WARNING)
    logging.getLogger('apscheduler').setLevel(logging.WARNING)

    print()
    print("🚀 SpesaTrack avviato!")
    print(f"   App web: http://localhost:{FLASK_PORT}")

    # Avvia scheduler notifiche
    threading.Thread(target=avvia_scheduler, daemon=True).start()

    # Avvia un bot per ogni utente con telegram_token
    avvia_tutti_i_bot()

    # Avvia Flask
    app.run(
        host='0.0.0.0',
        port=FLASK_PORT,
        debug=FLASK_DEBUG,
        use_reloader=False,  # Disabilita reloader per compatibilità con il thread del bot
    )
