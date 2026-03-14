"""
app.py — Entry point SpesaTrack.
Avvia Flask + bot Telegram in thread separato.
"""

import threading
import asyncio
import logging
import sys

from flask import Flask, render_template
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

# ─── Flask app ────────────────────────────────────────────────────

app = Flask(__name__)
app.secret_key = FLASK_SECRET_KEY
CORS(app)

# Registra blueprint con prefisso /api
app.register_blueprint(spese_bp, url_prefix='/api')
app.register_blueprint(categorie_bp, url_prefix='/api')
app.register_blueprint(config_bp, url_prefix='/api')
app.register_blueprint(export_bp, url_prefix='/api')
app.register_blueprint(entrate_bp, url_prefix='/api')
app.register_blueprint(abbonamenti_bp, url_prefix='/api')


@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def index(path):
    """Serve la SPA per tutte le route non-API."""
    return render_template('index.html')


# ─── Bot Telegram ─────────────────────────────────────────────────

def avvia_bot():
    """Avvia il bot Telegram in un thread separato."""
    if not TELEGRAM_TOKEN or len(TELEGRAM_TOKEN) < 10:
        print("   Bot Telegram: ⚠️  TOKEN non configurato (imposta TELEGRAM_TOKEN nel .env)")
        return

    async def _run():
        from bot.handlers import build_application
        from apscheduler.schedulers.asyncio import AsyncIOScheduler
        telegram_app = build_application(TELEGRAM_TOKEN)
        scheduler = None
        try:
            await telegram_app.initialize()
            await telegram_app.start()
            await telegram_app.updater.start_polling(drop_pending_updates=True)
            me = await telegram_app.bot.get_me()
            print(f"   Bot Telegram: @{me.username} ✅ connesso", flush=True)

            # Scheduler notifiche e addebito abbonamenti
            scheduler = AsyncIOScheduler()
            scheduler.add_job(_notifica_giornaliera, 'cron', hour=21, minute=0, args=[telegram_app])
            scheduler.add_job(_notifica_settimanale, 'cron', day_of_week='mon', hour=9, minute=0, args=[telegram_app])
            scheduler.add_job(_addebita_abbonamenti_giornalieri, 'cron', hour=8, minute=0)
            scheduler.start()
            print("   Scheduler notifiche: ✅ attivo", flush=True)

            while True:
                await asyncio.sleep(3600)
        except Exception as e:
            print(f"   Bot Telegram: ❌ errore — {e}", flush=True)
        finally:
            if scheduler and scheduler.running:
                scheduler.shutdown()
            await telegram_app.updater.stop()
            await telegram_app.stop()
            await telegram_app.shutdown()

    try:
        asyncio.run(_run())
    except Exception as e:
        print(f"   Bot Telegram: ❌ errore avvio — {e}", flush=True)


async def _addebita_abbonamenti_giornalieri():
    """Ogni mattina: crea spese per abbonamenti attivi con giorno_addebito == oggi."""
    try:
        from datetime import date
        from db.client import get_client
        oggi = date.today()

        res = get_client().table("abbonamenti").select("*").eq("attivo", True).execute()
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
                get_client().table("spese")
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
            get_client().table("spese").insert(nuova_spesa).execute()

            if abb.get("tipo") == "rata":
                n_pagate = (abb.get("n_rate_pagate") or 0) + 1
                update_data = {"n_rate_pagate": n_pagate}
                n_totali = abb.get("n_rate_totali")
                if n_totali and n_pagate >= n_totali:
                    update_data["attivo"] = False
                    update_data["data_fine"] = oggi_iso
                get_client().table("abbonamenti").update(update_data).eq("id", abb["id"]).execute()

    except Exception as e:
        logging.warning(f"Errore addebito abbonamenti: {e}")


async def _notifica_giornaliera(telegram_app):
    """Invia riepilogo giornaliero se configurato."""
    try:
        from db.client import get_client
        cfg = get_client().table("bot_config").select("*").eq("id", 1).execute()
        if not cfg.data:
            return
        conf = cfg.data[0]
        if not conf.get("notifica_giornaliera") or not conf.get("chat_id"):
            return

        from datetime import date
        from bot.formatter import formato_importo
        oggi = date.today().isoformat()
        res = get_client().table("spese").select("importo").eq("data", oggi).execute()
        spese = res.data or []
        totale = sum(s["importo"] for s in spese)
        testo = f"🌙 *Riepilogo di oggi*\nSpese: {len(spese)} · Totale: {formato_importo(totale)}"
        await telegram_app.bot.send_message(chat_id=conf["chat_id"], text=testo, parse_mode="Markdown")

        # Controlla superamento budget mensile
        if conf.get("alert_budget"):
            from calendar import monthrange
            mese, anno = oggi[:7].split("-")
            _, giorni = monthrange(int(anno), int(mese))
            primo = f"{anno}-{mese}-01"
            ultimo = f"{anno}-{mese}-{giorni:02d}"
            res_mese = get_client().table("spese").select("importo").gte("data", primo).lte("data", ultimo).execute()
            totale_mese = sum(float(s["importo"]) for s in (res_mese.data or []))
            cfg_app = get_client().table("app_config").select("budget_mensile_globale").limit(1).execute()
            budget = float((cfg_app.data[0].get("budget_mensile_globale") or 0) if cfg_app.data else 0)
            if budget > 0 and totale_mese >= budget:
                perc = round(totale_mese / budget * 100)
                msg = (f"⚠️ *Budget mensile superato!*\n"
                       f"Speso: {formato_importo(totale_mese)} su {formato_importo(budget)} ({perc}%)")
                await telegram_app.bot.send_message(chat_id=conf["chat_id"], text=msg, parse_mode="Markdown")
    except Exception as e:
        logging.warning(f"Errore notifica giornaliera: {e}")


async def _notifica_settimanale(telegram_app):
    """Invia riepilogo settimanale se configurato."""
    try:
        from db.client import get_client
        cfg = get_client().table("bot_config").select("*").eq("id", 1).execute()
        if not cfg.data:
            return
        conf = cfg.data[0]
        if not conf.get("notifica_settimanale") or not conf.get("chat_id"):
            return

        from datetime import date, timedelta
        from bot.formatter import formato_importo
        oggi = date.today()
        sette_fa = (oggi - timedelta(days=7)).isoformat()
        res = get_client().table("spese").select("importo").gte("data", sette_fa).execute()
        spese = res.data or []
        totale = sum(s["importo"] for s in spese)
        testo = f"📆 *Riepilogo settimana*\nSpese: {len(spese)} · Totale: {formato_importo(totale)}"
        await telegram_app.bot.send_message(chat_id=conf["chat_id"], text=testo, parse_mode="Markdown")
    except Exception as e:
        logging.warning(f"Errore notifica settimanale: {e}")


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

    # Avvia bot in thread daemon
    bot_thread = threading.Thread(target=avvia_bot, daemon=True)
    bot_thread.start()

    # Avvia Flask
    app.run(
        host='0.0.0.0',
        port=FLASK_PORT,
        debug=FLASK_DEBUG,
        use_reloader=False,  # Disabilita reloader per compatibilità con il thread del bot
    )
