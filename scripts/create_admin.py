#!/usr/bin/env python3
"""
Script one-shot per creare il primo utente admin di SpesaTrack.

Utilizzo:
  /Library/Frameworks/Python.framework/Versions/3.13/bin/python3 scripts/create_admin.py
"""
import sys
import os
import getpass

# Aggiungi la root del progetto al path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from werkzeug.security import generate_password_hash
from auth.admin_client import get_admin_client


def main():
    print("=" * 50)
    print("  SpesaTrack — Creazione Admin")
    print("=" * 50)
    print()

    db = get_admin_client()

    # Controlla se esistono già admin
    existing = db.table('st_users').select('id, email').eq('role', 'admin').execute()
    if existing.data:
        print("Admin esistenti:")
        for u in existing.data:
            print(f"  - {u['email']}")
        print()
        confirm = input("Vuoi creare un altro admin? [s/N] ").strip().lower()
        if confirm != 's':
            print("Operazione annullata.")
            return

    email = input("Email admin: ").strip().lower()
    if not email:
        print("Email obbligatoria.")
        sys.exit(1)

    display_name = input("Nome visualizzato (opzionale): ").strip()

    password = getpass.getpass("Password (min. 8 caratteri): ")
    if len(password) < 8:
        print("Password troppo corta.")
        sys.exit(1)

    password_conf = getpass.getpass("Conferma password: ")
    if password != password_conf:
        print("Le password non coincidono.")
        sys.exit(1)

    supabase_url = os.getenv("SUPABASE_URL", "").strip().rstrip('/')
    supabase_key = os.getenv("SUPABASE_KEY", "").strip()
    if not supabase_url or not supabase_key:
        print("SUPABASE_URL e SUPABASE_KEY non trovati nel .env")
        sys.exit(1)
    print(f"Supabase: {supabase_url[:40]}… ✓")

    # Verifica credenziali Supabase
    print()
    print("Verifico credenziali Supabase... ", end='', flush=True)
    try:
        from supabase import create_client
        test_client = create_client(supabase_url, supabase_key)
        test_client.table("app_config").select("id").limit(1).execute()
        print("OK")
    except Exception as e:
        print(f"ERRORE: {e}")
        sys.exit(1)

    # Crea utente admin
    password_hash = generate_password_hash(password, method='pbkdf2:sha256', salt_length=16)
    res = db.table('st_users').insert({
        'email':           email,
        'password_hash':   password_hash,
        'display_name':    display_name,
        'role':            'admin',
        'supabase_url':    supabase_url,
        'supabase_key':    supabase_key,
    }).execute()

    if not res.data:
        print("Errore durante la creazione dell'admin.")
        sys.exit(1)

    print()
    print("=" * 50)
    print(f"  Admin creato: {email}")
    print(f"  Accedi su:    http://localhost:5001/login")
    print("=" * 50)


if __name__ == '__main__':
    main()
