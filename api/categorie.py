from flask import Blueprint, request, jsonify
from db.client import get_client

categorie_bp = Blueprint("categorie", __name__)


def _error(msg: str, code: int = 400):
    return jsonify({"error": msg}), code


@categorie_bp.route("/categorie", methods=["GET"])
def lista_categorie():
    try:
        res = get_client().table("categorie").select("*").order("nome").execute()
        return jsonify(res.data or [])
    except Exception as e:
        return _error(str(e), 500)


@categorie_bp.route("/categorie", methods=["POST"])
def crea_categoria():
    try:
        data = request.get_json()
        if not data or not data.get("nome"):
            return _error("Il campo 'nome' è obbligatorio")

        nuova = {
            "nome": str(data["nome"]),
            "colore": data.get("colore", "#c8ff00"),
            "icona": data.get("icona", "📦"),
            "budget_mensile": float(data.get("budget_mensile", 0)),
            "regole": data.get("regole", []),
        }
        res = get_client().table("categorie").insert(nuova).execute()
        return jsonify(res.data[0] if res.data else nuova), 201
    except Exception as e:
        return _error(str(e), 500)


@categorie_bp.route("/categorie/<cat_id>", methods=["PUT"])
def modifica_categoria(cat_id: str):
    try:
        data = request.get_json()
        if not data:
            return _error("Body JSON mancante")

        campi = {"nome", "colore", "icona", "budget_mensile", "regole"}
        aggiornamento = {k: v for k, v in data.items() if k in campi}

        res = get_client().table("categorie").update(aggiornamento).eq("id", cat_id).execute()
        if not res.data:
            return _error("Categoria non trovata", 404)
        return jsonify(res.data[0])
    except Exception as e:
        return _error(str(e), 500)


@categorie_bp.route("/categorie/<cat_id>", methods=["DELETE"])
def elimina_categoria(cat_id: str):
    try:
        # Verifica se ci sono spese collegate
        res_check = (
            get_client().table("spese").select("id").eq("categoria_id", cat_id).limit(1).execute()
        )
        if res_check.data:
            return _error("Impossibile eliminare: esistono spese associate a questa categoria.", 409)

        res = get_client().table("categorie").delete().eq("id", cat_id).execute()
        if not res.data:
            return _error("Categoria non trovata", 404)
        return jsonify({"success": True, "id": cat_id})
    except Exception as e:
        return _error(str(e), 500)
