from datetime import datetime


def formato_importo(importo: float, simbolo: str = "€") -> str:
    return f"{simbolo}{importo:.2f}"


def barra_avanzamento(percentuale: float, lunghezza: int = 8) -> str:
    """Genera una barra testuale tipo: ████░░░░ 75%"""
    riempite = int(percentuale / 100 * lunghezza)
    vuote = lunghezza - riempite
    return f"{'█' * riempite}{'░' * vuote} {percentuale:.0f}%"


def formato_compatto(stats: dict) -> str:
    """Riepilogo breve: totale + confronto mese precedente."""
    variazione = stats.get("variazione_mese_precedente", 0)
    freccia = "📈" if variazione > 0 else "📉" if variazione < 0 else "➡️"
    return (
        f"📊 *Riepilogo mese*\n"
        f"Totale: *{formato_importo(stats.get('totale_mese', 0))}*\n"
        f"Rispetto al mese scorso: {freccia} {abs(variazione):.1f}%"
    )


def formato_dettagliato(stats: dict) -> str:
    """Totale + suddivisione per categoria."""
    righe = [
        f"📊 *Riepilogo dettagliato*\n",
        f"Totale mese: *{formato_importo(stats.get('totale_mese', 0))}*",
        f"Media giornaliera: {formato_importo(stats.get('media_giornaliera', 0))}",
        f"Budget rimanente: {formato_importo(stats.get('budget_rimanente', 0))}\n",
        "*Per categoria:*",
    ]
    for cat in stats.get("per_categoria", []):
        righe.append(
            f"  {cat.get('icona','📦')} {cat['nome']}: {formato_importo(cat['totale'])} ({cat['percentuale']:.1f}%)"
        )
    return "\n".join(righe)


def formato_completo(stats: dict, spese_recenti: list) -> str:
    """Dettagliato + lista spese recenti."""
    base = formato_dettagliato(stats)
    righe = [base, "\n*Ultime spese:*"]
    for s in spese_recenti[:10]:
        data = s.get("data", "")
        righe.append(f"  • {data} — {s['descrizione']}: {formato_importo(s['importo'])}")
    return "\n".join(righe)


def formato_budget(categorie_stats: list) -> str:
    """Stato budget per categoria con barre."""
    righe = ["💰 *Stato budget*\n"]
    for cat in categorie_stats:
        budget = cat.get("budget_mensile", 0)
        speso = cat.get("totale_speso", 0)
        if budget > 0:
            perc = min(speso / budget * 100, 100)
            barra = barra_avanzamento(perc)
            stato = "🔴" if perc >= 90 else "🟡" if perc >= 70 else "🟢"
            righe.append(
                f"{stato} {cat.get('icona','📦')} *{cat['nome']}*\n"
                f"   {barra}\n"
                f"   {formato_importo(speso)} / {formato_importo(budget)}"
            )
    return "\n".join(righe) if len(righe) > 1 else "Nessun budget configurato."
