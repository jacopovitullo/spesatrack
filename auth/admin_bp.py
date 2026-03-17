import secrets
from datetime import datetime, timezone, timedelta

from flask import Blueprint, request, jsonify, session, render_template, url_for

from auth.admin_client import get_admin_client
from auth.decorators import require_admin

admin_bp = Blueprint('admin', __name__)


def _admin_required():
    """Controlla accesso admin per before_request."""
    if not session.get('user_id'):
        if request.path.startswith('/admin/api/'):
            return jsonify({"error": "Non autenticato"}), 401
        from flask import redirect
        from flask import url_for as _url_for
        return redirect(_url_for('auth.login_page'))
    if session.get('role') != 'admin':
        if request.path.startswith('/admin/api/'):
            return jsonify({"error": "Accesso negato"}), 403
        from flask import redirect
        return redirect('/')


@admin_bp.before_request
def check_admin():
    return _admin_required()


# ── Pannello admin ─────────────────────────────────────────────────

@admin_bp.route('/admin')
def admin_page():
    db = get_admin_client()
    users   = db.table('st_users').select('id, email, display_name, role, is_active, created_at, last_login_at').order('created_at').execute()
    invites = db.table('st_invites').select('*').order('created_at', desc=True).limit(50).execute()
    return render_template('admin.html',
                           users=users.data or [],
                           invites=invites.data or [],
                           admin_email=session.get('email'))


# ── API Utenti ─────────────────────────────────────────────────────

@admin_bp.route('/admin/api/users', methods=['GET'])
def list_users():
    db = get_admin_client()
    res = db.table('st_users').select(
        'id, email, display_name, role, is_active, created_at, last_login_at'
    ).order('created_at').execute()
    return jsonify(res.data or [])


@admin_bp.route('/admin/api/users/<user_id>/deactivate', methods=['POST'])
def deactivate_user(user_id: str):
    if user_id == session.get('user_id'):
        return jsonify({"error": "Non puoi disattivare te stesso"}), 400
    db = get_admin_client()
    db.table('st_users').update({'is_active': False}).eq('id', user_id).execute()
    return jsonify({"ok": True})


@admin_bp.route('/admin/api/users/<user_id>/activate', methods=['POST'])
def activate_user(user_id: str):
    db = get_admin_client()
    db.table('st_users').update({'is_active': True}).eq('id', user_id).execute()
    return jsonify({"ok": True})


# ── API Inviti ─────────────────────────────────────────────────────

@admin_bp.route('/admin/api/invites', methods=['GET'])
def list_invites():
    db = get_admin_client()
    res = db.table('st_invites').select('*').order('created_at', desc=True).limit(100).execute()
    return jsonify(res.data or [])


@admin_bp.route('/admin/api/invites', methods=['POST'])
def create_invite():
    data       = request.get_json() or {}
    email_hint = (data.get('email_hint') or '').strip()
    expires_days = int(data.get('expires_days') or 7)

    token = secrets.token_hex(24)
    expires_at = (datetime.now(timezone.utc) + timedelta(days=expires_days)).isoformat()

    db = get_admin_client()
    res = db.table('st_invites').insert({
        'token':      token,
        'email_hint': email_hint,
        'created_by': session.get('user_id'),
        'expires_at': expires_at,
    }).execute()

    if not res.data:
        return jsonify({"error": "Errore creazione invito"}), 500

    invite = res.data[0]
    base_url = request.host_url.rstrip('/')
    invite['url'] = f"{base_url}/register/{token}"
    return jsonify(invite), 201


@admin_bp.route('/admin/api/invites/<invite_id>', methods=['DELETE'])
def delete_invite(invite_id: str):
    db = get_admin_client()
    db.table('st_invites').delete().eq('id', invite_id).execute()
    return jsonify({"ok": True})
