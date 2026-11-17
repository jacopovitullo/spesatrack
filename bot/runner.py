"""
bot/runner.py — Avvio bot Telegram per singolo utente.
Centralizzato qui per evitare import circolari tra app.py e auth/.
"""

import asyncio
import os
import threading

_active_bots: set[str] = set()
_lock = threading.Lock()


def avvia_bot_per_utente(user: dict):
    """Avvia il bot Telegram per un singolo utente (thread dedicato).

    Se il token è già attivo salta silenziosamente — evita doppi avvii
    in caso di riattivazione o re-registrazione con lo stesso token.
    """
    token = user.get('telegram_token', '')
    email = user.get('email', user.get('id', '?'))

    # Utenti il cui bot e' ascoltato da un altro programma (l'assistente sul server di casa):
    # qui niente polling, che andrebbe in conflitto; le notifiche partono lo stesso.
    solo_invio = {e.strip().lower() for e in os.getenv('BOT_SOLO_INVIO', '').split(',') if e.strip()}
    if str(user.get('email', '')).lower() in solo_invio:
        print(f"   Bot ({email}): solo invio, l'ascolto e' altrove", flush=True)
        return

    with _lock:
        if token in _active_bots:
            return
        _active_bots.add(token)

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
            with _lock:
                _active_bots.discard(token)
            try:
                await telegram_app.updater.stop()
                await telegram_app.stop()
                await telegram_app.shutdown()
            except Exception:
                pass

    try:
        asyncio.run(_run())
    except Exception as e:
        with _lock:
            _active_bots.discard(token)
        print(f"   Bot avvio ({email}): ❌ — {e}", flush=True)
