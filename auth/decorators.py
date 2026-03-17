from functools import wraps
from flask import session, redirect, url_for, request, jsonify


def require_login(f):
    """Richiede sessione autenticata. Per route API ritorna 401 JSON, altrimenti redirect /login."""
    @wraps(f)
    def decorated(*args, **kwargs):
        if not session.get('user_id'):
            if request.path.startswith('/api/'):
                return jsonify({"error": "Non autenticato"}), 401
            return redirect(url_for('auth.login_page'))
        return f(*args, **kwargs)
    return decorated


def require_admin(f):
    """Richiede ruolo admin. Deve essere usato dopo @require_login."""
    @wraps(f)
    def decorated(*args, **kwargs):
        if not session.get('user_id'):
            if request.path.startswith('/admin/api/'):
                return jsonify({"error": "Non autenticato"}), 401
            return redirect(url_for('auth.login_page'))
        if session.get('role') != 'admin':
            if request.path.startswith('/admin/api/'):
                return jsonify({"error": "Accesso negato"}), 403
            return redirect(url_for('index'))
        return f(*args, **kwargs)
    return decorated
