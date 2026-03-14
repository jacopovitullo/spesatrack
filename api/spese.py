from flask import Blueprint, request, jsonify
from db.client import get_client

spese_bp = Blueprint("spese", __name__)


def _error(msg: str, code: int = 400):
    return jsonify({"error": msg}), code


@spese_bp.route("/spese", methods=["GET"])
def lista_spese():
    try:
        db = get_client()
        query = db.table("spese").select("*, categorie(id, nome, colore, icona)")

        # Filtri
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

        categoria_id = request.args.get("categoria_id")
        if categoria_id:
            query = query.eq("categoria_id", categoria_id)

        q = request.args.get("q")
        if q:
            query = query.ilike("descrizione", f"%{q}%")

        fonte = request.args.get("fonte")
        if fonte:
            query = query.eq("fonte", fonte)

        importo_min = request.args.get("importo_min")
        importo_max = request.args.get("importo_max")
        if importo_min:
            query = query.gte("importo", float(importo_min))
        if importo_max:
            query = query.lte("importo", float(importo_max))

        # Ordinamento
        order_by = request.args.get("order_by", "data")
        order_dir = request.args.get("order_dir", "desc")
        valid_cols = {"data", "importo", "descrizione", "created_at"}
        if order_by not in valid_cols:
            order_by = "data"
        query = query.order(order_by, desc=(order_dir.lower() == "desc"))

        res = query.execute()
        return jsonify(res.data or [])
    except Exception as e:
        return _error(str(e), 500)


@spese_bp.route("/spese", methods=["POST"])
def crea_spesa():
    try:
        data = request.get_json()
        if not data:
            return _error("Body JSON mancante")
        required = ["descrizione", "importo"]
        for field in required:
            if field not in data:
                return _error(f"Campo obbligatorio mancante: {field}")

        nuova = {
            "descrizione": str(data["descrizione"]),
            "importo": float(data["importo"]),
            "categoria_id": data.get("categoria_id"),
            "data": data.get("data"),
            "fonte": data.get("fonte", "web"),
            "note": data.get("note", ""),
        }
        # Rimuovi chiavi None
        nuova = {k: v for k, v in nuova.items() if v is not None}

        res = get_client().table("spese").insert(nuova).execute()
        return jsonify(res.data[0] if res.data else nuova), 201
    except Exception as e:
        return _error(str(e), 500)


@spese_bp.route("/spese/<spesa_id>", methods=["PUT"])
def modifica_spesa(spesa_id: str):
    try:
        data = request.get_json()
        if not data:
            return _error("Body JSON mancante")

        campi_consentiti = {"descrizione", "importo", "categoria_id", "data", "note", "fonte"}
        aggiornamento = {k: v for k, v in data.items() if k in campi_consentiti}

        res = get_client().table("spese").update(aggiornamento).eq("id", spesa_id).execute()
        if not res.data:
            return _error("Spesa non trovata", 404)
        return jsonify(res.data[0])
    except Exception as e:
        return _error(str(e), 500)


@spese_bp.route("/spese/<spesa_id>", methods=["DELETE"])
def elimina_spesa(spesa_id: str):
    try:
        res = get_client().table("spese").delete().eq("id", spesa_id).execute()
        if not res.data:
            return _error("Spesa non trovata", 404)
        return jsonify({"success": True, "id": spesa_id})
    except Exception as e:
        return _error(str(e), 500)


@spese_bp.route("/statistiche", methods=["GET"])
def statistiche():
    try:
        from calendar import monthrange
        from datetime import date

        oggi = date.today()
        mese = int(request.args.get("mese", oggi.month))
        anno = int(request.args.get("anno", oggi.year))

        giorni_nel_mese = monthrange(anno, mese)[1]
        data_da = f"{anno}-{mese:02d}-01"
        data_a = f"{anno}-{mese:02d}-{giorni_nel_mese:02d}"

        db = get_client()

        # Spese del mese
        res = (
            db.table("spese")
            .select("*, categorie(id, nome, colore, icona)")
            .gte("data", data_da)
            .lte("data", data_a)
            .execute()
        )
        spese = res.data or []
        totale = sum(s["importo"] for s in spese)

        # Budget globale
        res_cfg = db.table("app_config").select("budget_mensile_globale").eq("id", 1).execute()
        budget_globale = float(res_cfg.data[0]["budget_mensile_globale"]) if res_cfg.data else 1500.0

        # Giorni passati del mese
        if anno == oggi.year and mese == oggi.month:
            giorni_passati = oggi.day
        else:
            giorni_passati = giorni_nel_mese

        media_giornaliera = totale / giorni_passati if giorni_passati else 0

        # Per categoria
        per_cat: dict = {}
        for s in spese:
            cat = s.get("categorie") or {}
            cid = cat.get("id", "senza-categoria")
            if cid not in per_cat:
                per_cat[cid] = {"nome": cat.get("nome", "Altro"), "colore": cat.get("colore", "#888"), "icona": cat.get("icona", "📦"), "totale": 0}
            per_cat[cid]["totale"] += s["importo"]

        per_cat_list = sorted(per_cat.values(), key=lambda x: x["totale"], reverse=True)
        for item in per_cat_list:
            item["percentuale"] = round(item["totale"] / totale * 100, 1) if totale else 0

        # Per giorno
        per_giorno: dict = {}
        for s in spese:
            per_giorno[s["data"]] = per_giorno.get(s["data"], 0) + s["importo"]
        per_giorno_list = [{"data": k, "totale": v} for k, v in sorted(per_giorno.items())]

        # Categoria top
        categoria_top = per_cat_list[0]["nome"] if per_cat_list else "—"

        # Mese precedente per variazione
        mese_prec = mese - 1 if mese > 1 else 12
        anno_prec = anno if mese > 1 else anno - 1
        giorni_mese_prec = monthrange(anno_prec, mese_prec)[1]
        data_da_prec = f"{anno_prec}-{mese_prec:02d}-01"
        data_a_prec = f"{anno_prec}-{mese_prec:02d}-{giorni_mese_prec:02d}"
        res_prec = (
            db.table("spese")
            .select("importo")
            .gte("data", data_da_prec)
            .lte("data", data_a_prec)
            .execute()
        )
        totale_prec = sum(s["importo"] for s in (res_prec.data or []))
        if totale_prec:
            variazione = round((totale - totale_prec) / totale_prec * 100, 1)
        else:
            variazione = 0.0

        return jsonify({
            "totale_mese": round(totale, 2),
            "media_giornaliera": round(media_giornaliera, 2),
            "categoria_top": categoria_top,
            "budget_rimanente": round(budget_globale - totale, 2),
            "budget_globale": round(budget_globale, 2),
            "variazione_mese_precedente": variazione,
            "per_categoria": per_cat_list,
            "per_giorno": per_giorno_list,
        })
    except Exception as e:
        return _error(str(e), 500)


@spese_bp.route("/statistiche/annuali", methods=["GET"])
def statistiche_annuali():
    try:
        from datetime import date
        from calendar import monthrange
        oggi = date.today()
        anno = int(request.args.get("anno", oggi.year))

        MESI = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu",
                "Lug", "Ago", "Set", "Ott", "Nov", "Dic"]

        db = get_client()
        risultati = []
        for mese in range(1, 13):
            giorni = monthrange(anno, mese)[1]
            data_da = f"{anno}-{mese:02d}-01"
            data_a = f"{anno}-{mese:02d}-{giorni:02d}"
            res = (
                db.table("spese")
                .select("importo")
                .gte("data", data_da)
                .lte("data", data_a)
                .execute()
            )
            totale = sum(s["importo"] for s in (res.data or []))
            risultati.append({"mese": mese, "nome": MESI[mese - 1], "totale": round(totale, 2)})

        return jsonify(risultati)
    except Exception as e:
        return _error(str(e), 500)
