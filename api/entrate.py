from calendar import monthrange
from datetime import datetime
from flask import Blueprint, request, jsonify
from db.client import get_client

entrate_bp = Blueprint("entrate", __name__)

TIPI_VALIDI = {"stipendio", "freelance", "rimborso", "bonus", "altro"}


def _error(msg: str, code: int = 400):
    return jsonify({"error": msg}), code


@entrate_bp.route("/entrate", methods=["GET"])
def lista_entrate():
    try:
        db = get_client()
        query = db.table("entrate").select("*")

        mese = request.args.get("mese")
        anno = request.args.get("anno")
        if mese and anno:
            from calendar import monthrange
            giorni = monthrange(int(anno), int(mese))[1]
            data_da = f"{anno}-{int(mese):02d}-01"
            data_a = f"{anno}-{int(mese):02d}-{giorni:02d}"
            query = query.gte("data", data_da).lte("data", data_a)

        data_da = request.args.get("data_da")
        data_a = request.args.get("data_a")
        if data_da:
            query = query.gte("data", data_da)
        if data_a:
            query = query.lte("data", data_a)

        tipo = request.args.get("tipo")
        if tipo:
            query = query.eq("tipo", tipo)

        q = request.args.get("q")
        if q:
            query = query.ilike("descrizione", f"%{q}%")

        query = query.order("data", desc=True)
        res = query.execute()
        return jsonify(res.data or [])
    except Exception as e:
        return _error(str(e), 500)


@entrate_bp.route("/entrate", methods=["POST"])
def crea_entrata():
    try:
        data = request.get_json()
        if not data:
            return _error("Body JSON mancante")
        if not data.get("descrizione") or not data.get("importo"):
            return _error("Campi obbligatori: descrizione, importo")

        nuova = {
            "descrizione": str(data["descrizione"]),
            "importo": float(data["importo"]),
            "tipo": data.get("tipo", "altro"),
            "data": data.get("data"),
            "note": data.get("note", ""),
            "fonte": data.get("fonte", "web"),
        }
        nuova = {k: v for k, v in nuova.items() if v is not None}

        res = get_client().table("entrate").insert(nuova).execute()
        return jsonify(res.data[0] if res.data else nuova), 201
    except Exception as e:
        return _error(str(e), 500)


@entrate_bp.route("/entrate/<entrata_id>", methods=["PUT"])
def modifica_entrata(entrata_id: str):
    try:
        data = request.get_json()
        if not data:
            return _error("Body JSON mancante")

        campi = {"descrizione", "importo", "tipo", "data", "note", "fonte"}
        aggiornamento = {k: v for k, v in data.items() if k in campi}

        res = get_client().table("entrate").update(aggiornamento).eq("id", entrata_id).execute()
        if not res.data:
            return _error("Entrata non trovata", 404)
        return jsonify(res.data[0])
    except Exception as e:
        return _error(str(e), 500)


@entrate_bp.route("/entrate/totali", methods=["GET"])
def totali_entrate():
    try:
        anno = int(request.args.get("anno", datetime.now().year))
        storico = get_client().table("entrate").select("importo").execute()
        anno_data = get_client().table("entrate").select("importo") \
            .gte("data", f"{anno}-01-01").lte("data", f"{anno}-12-31").execute()
        totale_storico = sum(float(r["importo"]) for r in (storico.data or []))
        totale_anno = sum(float(r["importo"]) for r in (anno_data.data or []))
        return jsonify({"totale_storico": round(totale_storico, 2), "totale_anno": round(totale_anno, 2)})
    except Exception as e:
        return _error(str(e), 500)


@entrate_bp.route("/entrate/statistiche/annuali", methods=["GET"])
def statistiche_annuali_entrate():
    try:
        anno = int(request.args.get("anno", datetime.now().year))
        MESI = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu",
                "Lug", "Ago", "Set", "Ott", "Nov", "Dic"]
        risultati = []
        for m in range(1, 13):
            _, giorni = monthrange(anno, m)
            res = get_client().table("entrate").select("importo") \
                .gte("data", f"{anno}-{m:02d}-01") \
                .lte("data", f"{anno}-{m:02d}-{giorni:02d}").execute()
            totale = sum(float(r["importo"]) for r in (res.data or []))
            risultati.append({"mese": m, "nome": MESI[m - 1], "totale": round(totale, 2)})
        return jsonify(risultati)
    except Exception as e:
        return _error(str(e), 500)


@entrate_bp.route("/entrate/<entrata_id>", methods=["DELETE"])
def elimina_entrata(entrata_id: str):
    try:
        res = get_client().table("entrate").delete().eq("id", entrata_id).execute()
        if not res.data:
            return _error("Entrata non trovata", 404)
        return jsonify({"success": True, "id": entrata_id})
    except Exception as e:
        return _error(str(e), 500)
