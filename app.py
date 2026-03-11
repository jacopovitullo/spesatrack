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

# ─── Flask app ────────────────────────────────────────────────────

app = Flask(__name__)
app.secret_key = FLASK_SECRET_KEY
CORS(app)

# Registra blueprint con prefisso /api
app.register_blueprint(spese_bp, url_prefix='/api')
app.register_blueprint(categorie_bp, url_prefix='/api')
app.register_blueprint(config_bp, url_prefix='/api')
app.register_blueprint(export_bp, url_prefix='/api')


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
        telegram_app = build_application(TELEGRAM_TOKEN)
        try:
            await telegram_app.initialize()
            await telegram_app.start()
            await telegram_app.updater.start_polling(drop_pending_updates=True)
            me = await telegram_app.bot.get_me()
            print(f"   Bot Telegram: @{me.username} ✅ connesso", flush=True)
            # Blocca finché il thread è attivo
            while True:
                await asyncio.sleep(3600)
        except Exception as e:
            print(f"   Bot Telegram: ❌ errore — {e}", flush=True)
        finally:
            await telegram_app.updater.stop()
            await telegram_app.stop()
            await telegram_app.shutdown()

    try:
        asyncio.run(_run())
    except Exception as e:
        print(f"   Bot Telegram: ❌ errore avvio — {e}", flush=True)


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
