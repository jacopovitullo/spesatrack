import re
import logging
from datetime import date, timedelta
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    Application,
    CommandHandler,
    MessageHandler,
    CallbackQueryHandler,
    filters,
    ContextTypes,
)
from bot.formatter import (
    formato_compatto,
    formato_dettagliato,
    formato_completo,
    formato_budget,
    formato_importo,
)

logger = logging.getLogger(__name__)


# ─── Utility ────────────────────────────────────────────────────────────────

def _get_bot_config(client) -> dict:
    try:
        res = client.table("bot_config").select("*").eq("id", 1).execute()
        return res.data[0] if res.data else {}
    except Exception:
        return {}


def _get_categorie(client) -> list:
    try:
        res = client.table("categorie").select("*").execute()
        return res.data or []
    except Exception:
        return []


def _auto_categoria(descrizione: str, categorie: list) -> dict | None:
    desc_lower = descrizione.lower()
    for cat in categorie:
        regole = cat.get("regole") or []
        for regola in regole:
            if regola.lower() in desc_lower:
                return cat
    return None


def _parse_messaggio(testo: str) -> dict | None:
    """
    Interpreta testo libero come spesa.
    Formati supportati:
      "caffè 1.50"
      "supermercato 45 cibo"
      "taxi 18.50 nota: lavoro"
    """
    # Estrai nota
    nota = ""
    match_nota = re.search(r"nota:\s*(.+)$", testo, re.IGNORECASE)
    if match_nota:
        nota = match_nota.group(1).strip()
        testo = testo[: match_nota.start()].strip()

    # Cerca importo (numero con punto o virgola)
    match_importo = re.search(r"(\d+[.,]\d{1,2}|\d+)", testo)
    if not match_importo:
        return None

    importo_str = match_importo.group(1).replace(",", ".")
    importo = float(importo_str)

    # Tutto prima dell'importo = descrizione; dopo = eventuale categoria
    parti = testo[: match_importo.start()].strip()
    dopo = testo[match_importo.end() :].strip()

    descrizione = parti if parti else dopo
    categoria_hint = dopo if parti else ""

    return {
        "descrizione": descrizione,
        "importo": importo,
        "nota": nota,
        "categoria_hint": categoria_hint.lower(),
    }


# ─── Comandi ─────────────────────────────────────────────────────────────────

async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    testo = (
        "👋 *Benvenuto su SpesaTrack!*\n\n"
        "Inserisci una spesa scrivendo ad esempio:\n"
        "`caffè 1.50`\n`supermercato 45 cibo`\n`taxi 18.50 nota: lavoro`\n\n"
        "*Comandi disponibili:*\n"
        "/oggi — spese di oggi\n"
        "/settimana — ultime 7 giorni per categoria\n"
        "/mese — riepilogo mese corrente\n"
        "/budget — stato budget per categoria\n"
        "/lista — ultime 10 spese\n"
        "/cancella — annulla ultima spesa\n"
        "/cerca <testo> — cerca nelle spese"
    )
    await update.message.reply_text(testo, parse_mode="Markdown")


async def cmd_oggi(update: Update, context: ContextTypes.DEFAULT_TYPE):
    client = context.bot_data['client']
    oggi = date.today().isoformat()
    try:
        res = (
            client
            .table("spese")
            .select("*, categorie(nome, icona)")
            .eq("data", oggi)
            .order("created_at", desc=True)
            .execute()
        )
        spese = res.data or []
        totale = sum(s["importo"] for s in spese)
        if not spese:
            await update.message.reply_text("📭 Nessuna spesa registrata oggi.")
            return
        righe = [f"📅 *Spese di oggi ({oggi})*\n"]
        for s in spese:
            cat = s.get("categorie") or {}
            icona = cat.get("icona", "📦")
            righe.append(f"{icona} {s['descrizione']}: *{formato_importo(s['importo'])}*")
        righe.append(f"\nTotale: *{formato_importo(totale)}*")
        await update.message.reply_text("\n".join(righe), parse_mode="Markdown")
    except Exception as e:
        logger.error(f"Errore /oggi: {e}")
        await update.message.reply_text("❌ Errore nel recupero delle spese.")


async def cmd_settimana(update: Update, context: ContextTypes.DEFAULT_TYPE):
    client = context.bot_data['client']
    oggi = date.today()
    sette_giorni_fa = (oggi - timedelta(days=7)).isoformat()
    try:
        res = (
            client
            .table("spese")
            .select("*, categorie(nome, icona, colore)")
            .gte("data", sette_giorni_fa)
            .lte("data", oggi.isoformat())
            .execute()
        )
        spese = res.data or []
        if not spese:
            await update.message.reply_text("📭 Nessuna spesa negli ultimi 7 giorni.")
            return
        # Raggruppa per categoria
        per_cat: dict = {}
        for s in spese:
            cat = s.get("categorie") or {}
            nome = cat.get("nome", "Altro")
            icona = cat.get("icona", "📦")
            key = f"{icona} {nome}"
            per_cat[key] = per_cat.get(key, 0) + s["importo"]
        totale = sum(per_cat.values())
        righe = [f"📆 *Ultime 7 giorni*\n"]
        for cat_nome, tot in sorted(per_cat.items(), key=lambda x: x[1], reverse=True):
            perc = tot / totale * 100 if totale else 0
            righe.append(f"{cat_nome}: *{formato_importo(tot)}* ({perc:.1f}%)")
        righe.append(f"\nTotale: *{formato_importo(totale)}*")
        await update.message.reply_text("\n".join(righe), parse_mode="Markdown")
    except Exception as e:
        logger.error(f"Errore /settimana: {e}")
        await update.message.reply_text("❌ Errore nel recupero delle spese.")


async def cmd_mese(update: Update, context: ContextTypes.DEFAULT_TYPE):
    client = context.bot_data['client']
    oggi = date.today()
    primo_mese = date(oggi.year, oggi.month, 1).isoformat()
    try:
        res_spese = (
            client
            .table("spese")
            .select("*, categorie(nome, icona)")
            .gte("data", primo_mese)
            .lte("data", oggi.isoformat())
            .execute()
        )
        spese = res_spese.data or []
        totale = sum(s["importo"] for s in spese)

        # Config app per budget globale
        res_cfg = client.table("app_config").select("*").eq("id", 1).execute()
        budget_globale = res_cfg.data[0]["budget_mensile_globale"] if res_cfg.data else 1500

        # Per categoria
        per_cat: dict = {}
        for s in spese:
            cat = s.get("categorie") or {}
            nome = cat.get("nome", "Altro")
            icona = cat.get("icona", "📦")
            key = (nome, icona)
            per_cat[key] = per_cat.get(key, 0) + s["importo"]

        giorni_passati = oggi.day
        stats = {
            "totale_mese": totale,
            "media_giornaliera": totale / giorni_passati if giorni_passati else 0,
            "budget_rimanente": budget_globale - totale,
            "variazione_mese_precedente": 0,
            "per_categoria": [
                {"nome": k[0], "icona": k[1], "totale": v, "percentuale": v / totale * 100 if totale else 0}
                for k, v in per_cat.items()
            ],
        }

        cfg_bot = _get_bot_config(client)
        fmt = cfg_bot.get("formato_riepilogo", "dettagliato")
        if fmt == "compatto":
            testo = formato_compatto(stats)
        elif fmt == "completo":
            testo = formato_completo(stats, spese)
        else:
            testo = formato_dettagliato(stats)

        await update.message.reply_text(testo, parse_mode="Markdown")
    except Exception as e:
        logger.error(f"Errore /mese: {e}")
        await update.message.reply_text("❌ Errore nel recupero del riepilogo.")


async def cmd_budget(update: Update, context: ContextTypes.DEFAULT_TYPE):
    client = context.bot_data['client']
    oggi = date.today()
    primo_mese = date(oggi.year, oggi.month, 1).isoformat()
    try:
        categorie = _get_categorie(client)
        res = (
            client
            .table("spese")
            .select("importo, categoria_id")
            .gte("data", primo_mese)
            .execute()
        )
        spese = res.data or []

        # Calcola speso per categoria
        speso_per_cat: dict = {}
        for s in spese:
            cid = s.get("categoria_id")
            speso_per_cat[cid] = speso_per_cat.get(cid, 0) + s["importo"]

        cat_stats = []
        for cat in categorie:
            cat_stats.append({
                "nome": cat["nome"],
                "icona": cat.get("icona", "📦"),
                "budget_mensile": cat.get("budget_mensile", 0),
                "totale_speso": speso_per_cat.get(cat["id"], 0),
            })

        testo = formato_budget(cat_stats)
        await update.message.reply_text(testo, parse_mode="Markdown")
    except Exception as e:
        logger.error(f"Errore /budget: {e}")
        await update.message.reply_text("❌ Errore nel recupero del budget.")


async def cmd_lista(update: Update, context: ContextTypes.DEFAULT_TYPE):
    client = context.bot_data['client']
    try:
        res = (
            client
            .table("spese")
            .select("*, categorie(nome, icona)")
            .order("created_at", desc=True)
            .limit(10)
            .execute()
        )
        spese = res.data or []
        if not spese:
            await update.message.reply_text("📭 Nessuna spesa registrata.")
            return
        righe = ["📋 *Ultime 10 spese*\n"]
        for s in spese:
            cat = s.get("categorie") or {}
            icona = cat.get("icona", "📦")
            righe.append(f"{icona} `{s['data']}` {s['descrizione']}: *{formato_importo(s['importo'])}*")
        await update.message.reply_text("\n".join(righe), parse_mode="Markdown")
    except Exception as e:
        logger.error(f"Errore /lista: {e}")
        await update.message.reply_text("❌ Errore nel recupero delle spese.")


async def cmd_cancella(update: Update, context: ContextTypes.DEFAULT_TYPE):
    client = context.bot_data['client']
    try:
        res = (
            client
            .table("spese")
            .select("*")
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        if not res.data:
            await update.message.reply_text("📭 Nessuna spesa da annullare.")
            return
        spesa = res.data[0]
        context.user_data["ultima_spesa"] = spesa
        keyboard = InlineKeyboardMarkup([
            [
                InlineKeyboardButton("✅ Sì, cancella", callback_data="cancella_si"),
                InlineKeyboardButton("❌ No", callback_data="cancella_no"),
            ]
        ])
        await update.message.reply_text(
            f"Vuoi cancellare:\n*{spesa['descrizione']}* — {formato_importo(spesa['importo'])} ({spesa['data']})?",
            parse_mode="Markdown",
            reply_markup=keyboard,
        )
    except Exception as e:
        logger.error(f"Errore /cancella: {e}")
        await update.message.reply_text("❌ Errore.")


async def cmd_cerca(update: Update, context: ContextTypes.DEFAULT_TYPE):
    client = context.bot_data['client']
    query = " ".join(context.args) if context.args else ""
    if not query:
        await update.message.reply_text("Uso: /cerca <testo>")
        return
    try:
        res = (
            client
            .table("spese")
            .select("*, categorie(nome, icona)")
            .ilike("descrizione", f"%{query}%")
            .order("data", desc=True)
            .limit(10)
            .execute()
        )
        spese = res.data or []
        if not spese:
            await update.message.reply_text(f"🔍 Nessuna spesa trovata per '{query}'.")
            return
        righe = [f"🔍 *Risultati per '{query}'*\n"]
        for s in spese:
            cat = s.get("categorie") or {}
            icona = cat.get("icona", "📦")
            righe.append(f"{icona} `{s['data']}` {s['descrizione']}: *{formato_importo(s['importo'])}*")
        await update.message.reply_text("\n".join(righe), parse_mode="Markdown")
    except Exception as e:
        logger.error(f"Errore /cerca: {e}")
        await update.message.reply_text("❌ Errore nella ricerca.")


# ─── Handler messaggi liberi ─────────────────────────────────────────────────

async def handle_messaggio(update: Update, context: ContextTypes.DEFAULT_TYPE):
    client = context.bot_data['client']
    testo = update.message.text.strip()
    parsed = _parse_messaggio(testo)
    if not parsed or not parsed["descrizione"] or parsed["importo"] <= 0:
        await update.message.reply_text(
            "❓ Non ho capito. Scrivi ad esempio:\n`caffè 1.50`\n`supermercato 45 cibo`",
            parse_mode="Markdown",
        )
        return

    categorie = _get_categorie(client)
    categoria = None

    # Prova prima con l'hint esplicito
    if parsed["categoria_hint"]:
        for cat in categorie:
            if parsed["categoria_hint"] in cat["nome"].lower():
                categoria = cat
                break

    # Poi con le regole automatiche
    if not categoria:
        categoria = _auto_categoria(parsed["descrizione"], categorie)

    if categoria:
        await _salva_spesa(update, context, parsed, categoria)
    else:
        # Chiedi categoria con tastiera inline
        context.user_data["spesa_pending"] = parsed
        keyboard = InlineKeyboardMarkup([
            [InlineKeyboardButton(f"{c.get('icona','📦')} {c['nome']}", callback_data=f"cat_{c['id']}")]
            for c in categorie
        ])
        await update.message.reply_text(
            f"📂 Scegli la categoria per *{parsed['descrizione']}* ({formato_importo(parsed['importo'])})",
            parse_mode="Markdown",
            reply_markup=keyboard,
        )


async def _salva_spesa(update: Update, context: ContextTypes.DEFAULT_TYPE, parsed: dict, categoria: dict):
    client = context.bot_data['client']
    try:
        nuova_spesa = {
            "descrizione": parsed["descrizione"],
            "importo": parsed["importo"],
            "categoria_id": categoria["id"],
            "data": date.today().isoformat(),
            "fonte": "telegram",
            "note": parsed.get("nota", ""),
        }
        res = client.table("spese").insert(nuova_spesa).execute()
        spesa = res.data[0] if res.data else nuova_spesa

        cfg_bot = _get_bot_config(client)
        if cfg_bot.get("conferma_inserimento", True):
            icona = categoria.get("icona", "📦")
            await update.message.reply_text(
                f"✅ Spesa salvata!\n{icona} *{spesa['descrizione']}* — {formato_importo(spesa['importo'])}\n"
                f"Categoria: {categoria['nome']}",
                parse_mode="Markdown",
            )
    except Exception as e:
        logger.error(f"Errore salvataggio spesa: {e}")
        await update.message.reply_text("❌ Errore nel salvataggio della spesa.")


# ─── Callback inline ─────────────────────────────────────────────────────────

async def handle_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    data = query.data

    if data.startswith("cat_"):
        categoria_id = data[4:]
        client = context.bot_data['client']
        parsed = context.user_data.get("spesa_pending")
        if not parsed:
            await query.edit_message_text("⚠️ Sessione scaduta, reinserisci la spesa.")
            return
        categorie = _get_categorie(client)
        categoria = next((c for c in categorie if c["id"] == categoria_id), None)
        if not categoria:
            await query.edit_message_text("❌ Categoria non trovata.")
            return
        await query.edit_message_text(f"✅ Categoria selezionata: {categoria.get('icona','')} {categoria['nome']}")
        await _salva_spesa(query, context, parsed, categoria)
        context.user_data.pop("spesa_pending", None)

        # Auto-apprendimento: aggiunge la parola chiave alle regole della categoria
        try:
            descrizione = parsed.get("descrizione", "").lower().strip()
            parola = descrizione.split()[0] if len(descrizione) > 10 else descrizione
            if parola:
                regole_esistenti = categoria.get("regole") or []
                if parola not in [r.lower() for r in regole_esistenti]:
                    nuove_regole = regole_esistenti + [parola]
                    client.table("categorie").update({"regole": nuove_regole}).eq("id", categoria_id).execute()
                    await query.message.reply_text(
                        f"📚 Imparato: *{parola}* → {categoria['nome']}",
                        parse_mode="Markdown",
                    )
        except Exception as e:
            logger.warning(f"Auto-apprendimento fallito: {e}")

    elif data == "cancella_si":
        client = context.bot_data['client']
        spesa = context.user_data.get("ultima_spesa")
        if not spesa:
            await query.edit_message_text("⚠️ Nessuna spesa da cancellare.")
            return
        try:
            client.table("spese").delete().eq("id", spesa["id"]).execute()
            await query.edit_message_text(
                f"🗑️ Spesa cancellata: *{spesa['descrizione']}* — {formato_importo(spesa['importo'])}",
                parse_mode="Markdown",
            )
            context.user_data.pop("ultima_spesa", None)
        except Exception as e:
            logger.error(f"Errore cancellazione: {e}")
            await query.edit_message_text("❌ Errore nella cancellazione.")

    elif data == "cancella_no":
        await query.edit_message_text("↩️ Operazione annullata.")
        context.user_data.pop("ultima_spesa", None)


# ─── Setup applicazione ───────────────────────────────────────────────────────

def build_application(token: str, client) -> Application:
    app = Application.builder().token(token).build()
    app.bot_data['client'] = client
    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CommandHandler("oggi", cmd_oggi))
    app.add_handler(CommandHandler("settimana", cmd_settimana))
    app.add_handler(CommandHandler("mese", cmd_mese))
    app.add_handler(CommandHandler("budget", cmd_budget))
    app.add_handler(CommandHandler("lista", cmd_lista))
    app.add_handler(CommandHandler("cancella", cmd_cancella))
    app.add_handler(CommandHandler("cerca", cmd_cerca))
    app.add_handler(CallbackQueryHandler(handle_callback))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_messaggio))
    return app
