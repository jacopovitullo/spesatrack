from flask import Blueprint, request, jsonify
from db.client import get_client

config_bp = Blueprint("config", __name__)


def _error(msg: str, code: int = 400):
    return jsonify({"error": msg}), code


def _upsert(table: str, data: dict, row_id: int = 1):
    """Upsert riga con id fisso."""
    data["id"] = row_id
    return get_client().table(table).upsert(data).execute()


@config_bp.route("/config/bot", methods=["GET"])
def get_bot_config():
    try:
        res = get_client().table("bot_config").select("*").eq("id", 1).execute()
        if res.data:
            return jsonify(res.data[0])
        # Ritorna default se non esiste
        return jsonify({
            "id": 1,
            "token": "",
            "chat_id": "",
            "notifica_giornaliera": True,
            "ora_giornaliera": "21:00",
            "notifica_settimanale": True,
            "ora_settimanale": "09:00",
            "alert_budget": True,
            "conferma_inserimento": True,
            "formato_riepilogo": "dettagliato",
        })
    except Exception as e:
        return _error(str(e), 500)


@config_bp.route("/config/bot", methods=["PUT"])
def set_bot_config():
    try:
        data = request.get_json()
        if not data:
            return _error("Body JSON mancante")

        campi = {
            "token", "chat_id", "notifica_giornaliera", "ora_giornaliera",
            "notifica_settimanale", "ora_settimanale", "alert_budget",
            "conferma_inserimento", "formato_riepilogo",
        }
        aggiornamento = {k: v for k, v in data.items() if k in campi}
        res = _upsert("bot_config", aggiornamento)
        return jsonify(res.data[0] if res.data else aggiornamento)
    except Exception as e:
        return _error(str(e), 500)


@config_bp.route("/config/app", methods=["GET"])
def get_app_config():
    try:
        res = get_client().table("app_config").select("*").eq("id", 1).execute()
        if res.data:
            return jsonify(res.data[0])
        return jsonify({
            "id": 1,
            "valuta": "EUR",
            "simbolo_valuta": "€",
            "formato_data": "DD/MM/YYYY",
            "budget_mensile_globale": 1500,
        })
    except Exception as e:
        return _error(str(e), 500)


@config_bp.route("/config/app", methods=["PUT"])
def set_app_config():
    try:
        data = request.get_json()
        if not data:
            return _error("Body JSON mancante")

        campi = {"valuta", "simbolo_valuta", "formato_data", "budget_mensile_globale"}
        aggiornamento = {k: v for k, v in data.items() if k in campi}
        res = _upsert("app_config", aggiornamento)
        return jsonify(res.data[0] if res.data else aggiornamento)
    except Exception as e:
        return _error(str(e), 500)
