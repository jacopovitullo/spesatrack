import secrets
from datetime import datetime, timezone

from flask import (Blueprint, request, jsonify, session,
                   redirect, url_for, render_template, flash)
from werkzeug.security import generate_password_hash, check_password_hash
from supabase import create_client

from auth.admin_client import get_admin_client

auth_bp = Blueprint('auth', __name__)


# ── Helpers ────────────────────────────────────────────────────────────────

def _set_session(user: dict):
    session.permanent = True
    session['user_id']        = str(user['id'])
    session['email']          = user['email']
    session['display_name']   = user.get('display_name', '')
    session['role']           = user['role']
    session['supabase_url']   = user['supabase_url']
    session['supabase_key']   = user['supabase_key']
    session['telegram_token'] = user.get('telegram_token', '')
    session['telegram_chat_id'] = user.get('telegram_chat_id', '')


def _test_supabase(url: str, key: str) -> bool:
    """Verifica rapidamente che le credenziali Supabase siano valide."""
    try:
        client = create_client(url, key)
        client.table("app_config").select("id").limit(1).execute()
        return True
    except Exception:
        return False


# ── Login ──────────────────────────────────────────────────────────────────

@auth_bp.route('/login', methods=['GET'])
def login_page():
    if session.get('user_id'):
        return redirect(url_for('index'))
    error = request.args.get('error', '')
    return render_template('login.html', error=error)


@auth_bp.route('/login', methods=['POST'])
def login_submit():
    email    = (request.form.get('email') or '').strip().lower()
    password = request.form.get('password') or ''

    if not email or not password:
        return redirect(url_for('auth.login_page', error='Compila tutti i campi'))

    db = get_admin_client()
    res = db.table('st_users').select('*').eq('email', email).eq('is_active', True).limit(1).execute()

    if not res.data:
        return redirect(url_for('auth.login_page', error='Credenziali non valide'))

    user = res.data[0]

    if not check_password_hash(user['password_hash'], password):
        return redirect(url_for('auth.login_page', error='Credenziali non valide'))

    # Verifica credenziali Supabase dell'utente (non necessario per admin)
    if user['role'] != 'admin':
        if not _test_supabase(user['supabase_url'], user['supabase_key']):
            return redirect(url_for('auth.login_page',
                                    error='Credenziali Supabase non valide. Aggiorna il profilo.'))

    _set_session(user)

    # Aggiorna last_login_at
    db.table('st_users').update({'last_login_at': datetime.now(timezone.utc).isoformat()}).eq('id', user['id']).execute()

    if user['role'] == 'admin':
        return redirect(url_for('admin.admin_page'))
    return redirect(url_for('index'))


# ── Logout ─────────────────────────────────────────────────────────────────

@auth_bp.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('auth.login_page'))


# ── Register ───────────────────────────────────────────────────────────────

@auth_bp.route('/register/<token>', methods=['GET'])
def register_page(token: str):
    db = get_admin_client()
    res = db.table('st_invites').select('*').eq('token', token).limit(1).execute()

    if not res.data:
        return render_template('login.html', error='Link di invito non valido o scaduto.')

    invite = res.data[0]

    if invite.get('used_by'):
        return render_template('login.html', error='Questo invito è già stato utilizzato.')

    if invite.get('expires_at'):
        expires = datetime.fromisoformat(invite['expires_at'].replace('Z', '+00:00'))
        if expires < datetime.now(timezone.utc):
            return render_template('login.html', error='Questo invito è scaduto.')

    return render_template('register.html',
                           token=token,
                           email_hint=invite.get('email_hint', ''))


@auth_bp.route('/register', methods=['POST'])
def register_submit():
    token           = request.form.get('token', '').strip()
    email           = (request.form.get('email') or '').strip().lower()
    display_name    = (request.form.get('display_name') or '').strip()
    password        = request.form.get('password') or ''
    password_conf   = request.form.get('password_confirm') or ''
    supabase_url    = (request.form.get('supabase_url') or '').strip().rstrip('/')
    supabase_key    = (request.form.get('supabase_key') or '').strip()
    telegram_token  = (request.form.get('telegram_token') or '').strip()
    telegram_chat_id = (request.form.get('telegram_chat_id') or '').strip()

    def _err(msg):
        return render_template('register.html', token=token, email_hint=email, error=msg)

    if not all([token, email, password, password_conf, supabase_url, supabase_key,
                telegram_token, telegram_chat_id]):
        return _err('Tutti i campi sono obbligatori.')

    if password != password_conf:
        return _err('Le password non coincidono.')

    if len(password) < 8:
        return _err('La password deve essere di almeno 8 caratteri.')

    db = get_admin_client()

    # Valida invito
    inv_res = db.table('st_invites').select('*').eq('token', token).limit(1).execute()
    if not inv_res.data:
        return _err('Invito non valido.')
    invite = inv_res.data[0]
    if invite.get('used_by'):
        return _err('Invito già utilizzato.')
    if invite.get('expires_at'):
        expires = datetime.fromisoformat(invite['expires_at'].replace('Z', '+00:00'))
        if expires < datetime.now(timezone.utc):
            return _err('Invito scaduto.')

    # Email già registrata?
    existing = db.table('st_users').select('id').eq('email', email).limit(1).execute()
    if existing.data:
        return _err('Email già registrata.')

    # Verifica credenziali Supabase
    if not _test_supabase(supabase_url, supabase_key):
        return _err('Credenziali Supabase non valide. Controlla URL e anon key.')

    # Crea utente
    new_user_res = db.table('st_users').insert({
        'email': email,
        'password_hash': generate_password_hash(password, method='pbkdf2:sha256', salt_length=16),
        'display_name': display_name,
        'role': 'user',
        'supabase_url': supabase_url,
        'supabase_key': supabase_key,
        'telegram_token': telegram_token,
        'telegram_chat_id': telegram_chat_id,
    }).execute()

    if not new_user_res.data:
        return _err('Errore durante la registrazione. Riprova.')

    new_user = new_user_res.data[0]

    # Marca invito come usato
    now = datetime.now(timezone.utc).isoformat()
    db.table('st_invites').update({
        'used_by': str(new_user['id']),
        'used_at': now,
    }).eq('token', token).execute()

    _set_session(new_user)
    return redirect(url_for('index'))


# ── API: profilo corrente ──────────────────────────────────────────────────

@auth_bp.route('/api/auth/me', methods=['GET'])
def me():
    if not session.get('user_id'):
        return jsonify({"error": "Non autenticato"}), 401
    return jsonify({
        'user_id':      session.get('user_id'),
        'email':        session.get('email'),
        'display_name': session.get('display_name'),
        'role':         session.get('role'),
    })


@auth_bp.route('/api/auth/profile', methods=['PUT'])
def update_profile():
    if not session.get('user_id'):
        return jsonify({"error": "Non autenticato"}), 401

    data = request.get_json() or {}
    allowed = {'supabase_url', 'supabase_key', 'telegram_token', 'telegram_chat_id', 'display_name', 'password'}
    updates = {k: v for k, v in data.items() if k in allowed and v}

    if 'password' in updates:
        if len(updates['password']) < 8:
            return jsonify({"error": "Password minimo 8 caratteri"}), 400
        updates['password_hash'] = generate_password_hash(updates.pop('password'),
                                                          method='pbkdf2:sha256', salt_length=16)

    # Se cambiano le credenziali Supabase, verifica subito
    new_url = updates.get('supabase_url', session.get('supabase_url'))
    new_key = updates.get('supabase_key', session.get('supabase_key'))
    if 'supabase_url' in updates or 'supabase_key' in updates:
        if not _test_supabase(new_url, new_key):
            return jsonify({"error": "Credenziali Supabase non valide"}), 400

    if not updates:
        return jsonify({"error": "Nessun campo da aggiornare"}), 400

    db = get_admin_client()
    db.table('st_users').update(updates).eq('id', session['user_id']).execute()

    # Aggiorna sessione
    for field in ('supabase_url', 'supabase_key', 'telegram_token', 'telegram_chat_id', 'display_name'):
        if field in updates:
            session[field] = updates[field]

    return jsonify({"ok": True})
