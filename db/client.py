from supabase import create_client, Client
from config import SUPABASE_URL, SUPABASE_KEY

# Fallback singleton per il bot thread (fuori dal request context Flask)
_bot_client: Client | None = None


def get_client() -> Client:
    """Ritorna il client Supabase per la richiesta corrente.

    - Dentro un request context Flask: usa le credenziali Supabase dell'utente
      dalla sessione (caching su flask.g per riutilizzo nella stessa richiesta).
    - Fuori dal request context (bot/scheduler thread): usa il singleton
      con le credenziali del .env (account admin).
    """
    try:
        from flask import g, session
        if 'supabase_client' not in g:
            url = session.get('supabase_url')
            key = session.get('supabase_key')
            if not url or not key:
                from flask import abort
                abort(401)
            g.supabase_client = create_client(url, key)
        return g.supabase_client
    except RuntimeError:
        # RuntimeError = fuori dal request context → thread bot
        global _bot_client
        if _bot_client is None:
            if not SUPABASE_URL or not SUPABASE_KEY:
                raise ValueError("SUPABASE_URL e SUPABASE_KEY devono essere configurati nel .env")
            _bot_client = create_client(SUPABASE_URL, SUPABASE_KEY)
        return _bot_client
