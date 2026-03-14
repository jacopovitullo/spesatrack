from flask import Blueprint, request, jsonify
from db.client import get_client

abbonamenti_bp = Blueprint("abbonamenti", __name__)


def _error(msg: str, code: int = 400):
    return jsonify({"error": msg}), code


@abbonamenti_bp.route("/abbonamenti", methods=["GET"])
def lista_abbonamenti():
    try:
        db = get_client()
        query = db.table("abbonamenti").select("*, categorie(id, nome, colore, icona)")

        solo_attivi = request.args.get("attivi")
        if solo_attivi == "1":
            query = query.eq("attivo", True)

        query = query.order("created_at", desc=True)
        res = query.execute()
        return jsonify(res.data or [])
    except Exception as e:
        return _error(str(e), 500)


@abbonamenti_bp.route("/abbonamenti", methods=["POST"])
def crea_abbonamento():
    try:
        data = request.get_json()
        if not data:
            return _error("Body JSON mancante")
        if not data.get("descrizione") or not data.get("importo"):
            return _error("Campi obbligatori: descrizione, importo")

        nuova = {
            "descrizione": str(data["descrizione"]),
            "importo": float(data["importo"]),
            "categoria_id": data.get("categoria_id"),
            "tipo": data.get("tipo", "abbonamento"),
            "frequenza": data.get("frequenza", "mensile"),
            "giorno_addebito": int(data.get("giorno_addebito", 1)),
            "attivo": True,
            "data_inizio": data.get("data_inizio"),
            "n_rate_totali": data.get("n_rate_totali"),
            "n_rate_pagate": 0,
            "note": data.get("note", ""),
        }
        nuova = {k: v for k, v in nuova.items() if v is not None}

        res = get_client().table("abbonamenti").insert(nuova).execute()
        return jsonify(res.data[0] if res.data else nuova), 201
    except Exception as e:
        return _error(str(e), 500)


@abbonamenti_bp.route("/abbonamenti/<abb_id>", methods=["PUT"])
def modifica_abbonamento(abb_id: str):
    try:
        data = request.get_json()
        if not data:
            return _error("Body JSON mancante")

        campi = {"descrizione", "importo", "categoria_id", "tipo", "frequenza",
                 "giorno_addebito", "n_rate_totali", "note"}
        aggiornamento = {k: v for k, v in data.items() if k in campi}

        res = get_client().table("abbonamenti").update(aggiornamento).eq("id", abb_id).execute()
        if not res.data:
            return _error("Abbonamento non trovato", 404)
        return jsonify(res.data[0])
    except Exception as e:
        return _error(str(e), 500)


@abbonamenti_bp.route("/abbonamenti/<abb_id>", methods=["DELETE"])
def elimina_abbonamento(abb_id: str):
    try:
        res = get_client().table("abbonamenti").delete().eq("id", abb_id).execute()
        if not res.data:
            return _error("Abbonamento non trovato", 404)
        return jsonify({"success": True, "id": abb_id})
    except Exception as e:
        return _error(str(e), 500)


@abbonamenti_bp.route("/abbonamenti/<abb_id>/disattiva", methods=["PUT"])
def disattiva_abbonamento(abb_id: str):
    try:
        from datetime import date
        res = get_client().table("abbonamenti").update({
            "attivo": False,
            "data_fine": date.today().isoformat(),
        }).eq("id", abb_id).execute()
        if not res.data:
            return _error("Abbonamento non trovato", 404)
        return jsonify(res.data[0])
    except Exception as e:
        return _error(str(e), 500)


@abbonamenti_bp.route("/abbonamenti/<abb_id>/riattiva", methods=["PUT"])
def riattiva_abbonamento(abb_id: str):
    try:
        data = request.get_json() or {}
        giorno = int(data.get("giorno_addebito", 1))
        update = {
            "attivo": True,
            "data_fine": None,
            "giorno_addebito": giorno,
        }
        if "n_rate_pagate" in data:
            update["n_rate_pagate"] = int(data["n_rate_pagate"])
        res = get_client().table("abbonamenti").update(update).eq("id", abb_id).execute()
        if not res.data:
            return _error("Abbonamento non trovato", 404)
        return jsonify(res.data[0])
    except Exception as e:
        return _error(str(e), 500)


@abbonamenti_bp.route("/abbonamenti/<abb_id>/addebita", methods=["POST"])
def addebita_abbonamento(abb_id: str):
    """Crea manualmente una spesa per questo abbonamento."""
    try:
        from datetime import date
        db = get_client()

        res_abb = db.table("abbonamenti").select("*").eq("id", abb_id).execute()
        if not res_abb.data:
            return _error("Abbonamento non trovato", 404)
        abb = res_abb.data[0]

        if not abb.get("attivo"):
            return _error("Abbonamento non attivo", 400)

        oggi = date.today().isoformat()

        # Verifica se la spesa è già stata creata oggi per questo abbonamento
        check = (
            db.table("spese")
            .select("id")
            .eq("fonte", "abbonamento")
            .ilike("descrizione", f"%{abb['descrizione']}%")
            .eq("data", oggi)
            .execute()
        )
        if check.data:
            return _error("Spesa già addebitata oggi per questo abbonamento", 409)

        # Calcola importo e descrizione in base al tipo
        tipo = abb.get("tipo", "abbonamento")
        if tipo == "rata" and abb.get("n_rate_totali"):
            n_pagate_nuovo = (abb.get("n_rate_pagate") or 0) + 1
            n_totali = int(abb["n_rate_totali"])
            importo_addebito = round(float(abb["importo"]) / n_totali, 2)
            descrizione = f"[Rata {n_pagate_nuovo}/{n_totali}] {abb['descrizione']}"
        else:
            n_pagate_nuovo = None
            n_totali = None
            importo_addebito = float(abb["importo"])
            descrizione = f"[Abbonamento] {abb['descrizione']}"

        # Crea la spesa
        nuova_spesa = {
            "descrizione": descrizione,
            "importo": importo_addebito,
            "categoria_id": abb.get("categoria_id"),
            "data": oggi,
            "fonte": "abbonamento",
            "note": abb.get("note", ""),
        }
        nuova_spesa = {k: v for k, v in nuova_spesa.items() if v is not None}
        res_spesa = db.table("spese").insert(nuova_spesa).execute()

        # Aggiorna contatore rate se tipo='rata'
        if tipo == "rata" and n_pagate_nuovo is not None:
            update_data = {"n_rate_pagate": n_pagate_nuovo}
            if n_totali and n_pagate_nuovo >= n_totali:
                update_data["attivo"] = False
                update_data["data_fine"] = oggi
            db.table("abbonamenti").update(update_data).eq("id", abb_id).execute()

        return jsonify({
            "success": True,
            "spesa": res_spesa.data[0] if res_spesa.data else nuova_spesa,
        }), 201
    except Exception as e:
        return _error(str(e), 500)
