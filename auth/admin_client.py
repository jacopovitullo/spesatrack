from supabase import create_client, Client
from config import SUPABASE_URL, SUPABASE_KEY

_admin_client: Client | None = None


def get_admin_client() -> Client:
    """Ritorna il client Supabase dell'admin (singleton da .env).
    Usato per gestire st_users e st_invites."""
    global _admin_client
    if _admin_client is None:
        if not SUPABASE_URL or not SUPABASE_KEY:
            raise ValueError("SUPABASE_URL e SUPABASE_KEY devono essere configurati nel .env")
        _admin_client = create_client(SUPABASE_URL, SUPABASE_KEY)
    return _admin_client
