/**
 * main.js — Logica principale SPA SpesaTrack.
 */

import {
  getSpese, creaSpesa, modificaSpesa, eliminaSpesa,
  getStatistiche, getStatisticheAnnuali, getStatisticheAnnualiEntrate, getTotaliEntrate, getCategorie, creaCategoria, modificaCategoria, eliminaCategoria,
  getBotConfig, setBotConfig, getAppConfig, setAppConfig,
  downloadExport,
  getEntrate, creaEntrata, modificaEntrata, eliminaEntrata,
  getAbbonamenti, creaAbbonamento, modificaAbbonamento, eliminaAbbonamento,
  disattivaAbbonamento, addebitaAbbonamento, riativaAbbonamento,
  getMe, updateProfile,
} from './api.js';

import { renderBarChart, renderAnnualChart, renderDoughnutChart, renderAnnualEntryChart, renderQueryChart } from './charts.js';

// ─── Stato globale ────────────────────────────────────────────────

const state = {
  meseCorrente: new Date().getMonth() + 1,
  annoCorrente: new Date().getFullYear(),
  categorie: [],
  speseCorrente: [],
  entrateCorrente: [],
  abbonamentiCorrente: [],
  paginaCorrente: 1,
  righePerPagina: 20,
  ordinamento: { col: 'data', dir: 'desc' },
  filtriSpese: {},
  filtriEntrate: {},
  filtroTipoAbb: 'tutti',
  salvataggioQuery: [],
  appConfig: {},
  botConfig: {},
  spesaModifica: null,
  entrataModifica: null,
  abboModifica: null,
  viewGrafico: 'mensile',
};

// ─── Utils ────────────────────────────────────────────────────────

function toast(msg, tipo = 'info') {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast ${tipo}`;
  const icone = { success: '✅', error: '❌', info: 'ℹ️' };
  el.innerHTML = `<span>${icone[tipo] || ''}</span> ${msg}`;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function formatImporto(v, simbolo = '€') {
  return `${simbolo}${Number(v).toFixed(2)}`;
}

function formatData(isoDate) {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}

function nomeMese(mese, anno) {
  return new Date(anno, mese - 1, 1).toLocaleString('it-IT', { month: 'long', year: 'numeric' });
}

function loading(id) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = '<div class="loading"><div class="spinner"></div> Caricamento...</div>';
}

// ─── Navigazione ─────────────────────────────────────────────────

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    item.classList.add('active');
    const pageId = item.dataset.page;
    const page = document.getElementById(`page-${pageId}`);
    if (page) {
      page.classList.add('active');
      document.querySelector('.topbar-title').textContent = item.querySelector('span')?.textContent || '';
      onPageActivate(pageId);
    }
  });
});

function onPageActivate(pageId) {
  if (pageId === 'dashboard') loadDashboard();
  if (pageId === 'spese') loadSpese();
  if (pageId === 'entrate') loadEntrate();
  if (pageId === 'abbonamenti') loadAbbonamenti();
  if (pageId === 'configurazione') loadConfigurazione();
  if (pageId === 'esporta') loadEsporta();
}

// ─── Hamburger mobile ─────────────────────────────────────────────

document.getElementById('btn-hamburger')?.addEventListener('click', () => {
  document.querySelector('.sidebar').classList.toggle('mobile-open');
});

document.addEventListener('click', (e) => {
  const sidebar = document.querySelector('.sidebar');
  const hamburger = document.getElementById('btn-hamburger');
  if (sidebar?.classList.contains('mobile-open') && !sidebar.contains(e.target) && e.target !== hamburger) {
    sidebar.classList.remove('mobile-open');
  }
});

// ─── Theme change: ridisegna grafici pagina corrente ──────────────

window.addEventListener('themechange', () => {
  const activePage = document.querySelector('.page.active');
  if (!activePage) return;
  const pageId = activePage.id.replace('page-', '');
  if (['dashboard', 'entrate'].includes(pageId)) {
    onPageActivate(pageId);
  }
});

// ─── Navigazione mese ─────────────────────────────────────────────

document.getElementById('btn-prev-month')?.addEventListener('click', () => {
  state.meseCorrente--;
  if (state.meseCorrente < 1) { state.meseCorrente = 12; state.annoCorrente--; }
  aggiornaLabelMese();
  loadDashboard();
});

document.getElementById('btn-next-month')?.addEventListener('click', () => {
  state.meseCorrente++;
  if (state.meseCorrente > 12) { state.meseCorrente = 1; state.annoCorrente++; }
  aggiornaLabelMese();
  loadDashboard();
});

function aggiornaLabelMese() {
  const el = document.getElementById('label-mese');
  if (el) el.textContent = nomeMese(state.meseCorrente, state.annoCorrente);
}

// ─── Tab grafici ──────────────────────────────────────────────────

document.querySelectorAll('.chart-tab').forEach(btn => {
  btn.addEventListener('click', async () => {
    document.querySelectorAll('.chart-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.viewGrafico = btn.dataset.view;
    if (state.viewGrafico === 'annuale') {
      try {
        const annuali = await getStatisticheAnnuali(state.annoCorrente);
        renderAnnualChart(annuali);
      } catch (e) {
        toast('Errore grafico annuale: ' + e.message, 'error');
      }
    } else {
      try {
        const stats = await getStatistiche(state.meseCorrente, state.annoCorrente);
        renderBarChart(stats.per_giorno || []);
      } catch (e) {
        toast('Errore grafico mensile: ' + e.message, 'error');
      }
    }
  });
});

// ─── DASHBOARD ────────────────────────────────────────────────────

async function loadDashboard() {
  try {
    loading('kpi-container');
    const stats = await getStatistiche(state.meseCorrente, state.annoCorrente);
    renderKPI(stats);
    renderBudgetBar(stats);
    if (state.viewGrafico === 'annuale') {
      const annuali = await getStatisticheAnnuali(state.annoCorrente);
      renderAnnualChart(annuali);
    } else {
      renderBarChart(stats.per_giorno || []);
    }
    renderDoughnutChart(stats.per_categoria || []);
    await loadUltimeSpese();
  } catch (e) {
    toast('Errore caricamento dashboard: ' + e.message, 'error');
  }
}

function renderBudgetBar(stats) {
  const section = document.getElementById('budget-section');
  if (!section) return;
  const totale = stats.totale_mese || 0;
  const budget = stats.budget_globale || (totale + (stats.budget_rimanente || 0));
  if (!budget) { section.style.display = 'none'; return; }
  section.style.display = '';
  const perc = Math.min((totale / budget) * 100, 100);
  const simbolo = state.appConfig.simbolo_valuta || '€';
  const colore = perc < 70 ? 'var(--green)' : perc < 90 ? '#ffa502' : 'var(--red)';
  const fill = document.getElementById('budget-bar-fill');
  if (fill) { fill.style.width = perc + '%'; fill.style.background = colore; }
  const elImporti = document.getElementById('budget-label-importi');
  if (elImporti) elImporti.textContent = `${formatImporto(totale, simbolo)} / ${formatImporto(budget, simbolo)}`;
  const elPerc = document.getElementById('budget-label-perc');
  if (elPerc) elPerc.textContent = `${perc.toFixed(1)}% utilizzato`;
  const elRim = document.getElementById('budget-label-rimanente');
  if (elRim) {
    const rim = stats.budget_rimanente || 0;
    elRim.textContent = `Rimanente: ${formatImporto(rim, simbolo)}`;
    elRim.style.color = rim < 0 ? 'var(--red)' : 'var(--green)';
  }
}

function renderKPI(stats) {
  const simbolo = state.appConfig.simbolo_valuta || '€';
  const variazione = stats.variazione_mese_precedente || 0;
  const vClass = variazione > 0 ? 'up' : variazione < 0 ? 'down' : 'neutral';
  const vLabel = `${variazione > 0 ? '+' : ''}${variazione}%`;

  document.getElementById('kpi-container').innerHTML = `
    <div class="kpi-card">
      <div class="kpi-label">Totale mese</div>
      <div class="kpi-value">${formatImporto(stats.totale_mese, simbolo)}</div>
      <div class="kpi-sub">
        <span class="kpi-badge ${vClass}">${vLabel} vs mese prec.</span>
      </div>
      <div class="kpi-icon">💸</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Media giornaliera</div>
      <div class="kpi-value">${formatImporto(stats.media_giornaliera, simbolo)}</div>
      <div class="kpi-sub">al giorno</div>
      <div class="kpi-icon">📅</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Categoria top</div>
      <div class="kpi-value" style="font-size:22px">${stats.categoria_top || '—'}</div>
      <div class="kpi-sub">la più costosa</div>
      <div class="kpi-icon">🏆</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Budget rimanente</div>
      <div class="kpi-value" style="color:${stats.budget_rimanente < 0 ? 'var(--red)' : 'var(--green)'}">
        ${formatImporto(stats.budget_rimanente, simbolo)}
      </div>
      <div class="kpi-sub">del budget mensile</div>
      <div class="kpi-icon">🎯</div>
    </div>
  `;
}

async function loadUltimeSpese() {
  const res = await getSpese({ mese: state.meseCorrente, anno: state.annoCorrente, order_by: 'data', order_dir: 'desc' });
  const ultime = res.slice(0, 5);
  const tbody = document.getElementById('tbody-ultime');
  if (!tbody) return;

  if (!ultime.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text2)">Nessuna spesa</td></tr>';
    return;
  }

  tbody.innerHTML = ultime.map(s => {
    const cat = s.categorie || {};
    const bg = cat.colore ? cat.colore + '22' : 'var(--surface2)';
    const color = cat.colore || '#888';
    return `<tr>
      <td>${formatData(s.data)}</td>
      <td>${s.descrizione}</td>
      <td><span class="badge" style="background:${bg};color:${color}">${cat.icona || '📦'} ${cat.nome || '—'}</span></td>
      <td class="importo">${formatImporto(s.importo)}</td>
      <td class="fonte-badge">${s.fonte === 'telegram' ? '🤖' : '🌐'}</td>
      <td>
        <button class="btn btn-danger btn-sm" onclick="confermaEliminaSpesa('${s.id}','${s.descrizione.replace(/'/g,"\\'")}')">🗑️</button>
      </td>
    </tr>`;
  }).join('');
}

// ─── SPESE ────────────────────────────────────────────────────────

async function loadSpese() {
  await Promise.all([loadCategorieFiltro(), fetchERenderSpese()]);
}

async function loadCategorieFiltro() {
  if (!state.categorie.length) state.categorie = await getCategorie();
  const sel = document.getElementById('filtro-categoria');
  if (!sel) return;
  sel.innerHTML = '<option value="">Tutte le categorie</option>' +
    state.categorie.map(c => `<option value="${c.id}">${c.icona || ''} ${c.nome}</option>`).join('');
}

async function fetchERenderSpese() {
  try {
    const params = {
      mese: state.meseCorrente,
      anno: state.annoCorrente,
      order_by: state.ordinamento.col,
      order_dir: state.ordinamento.dir,
      ...state.filtriSpese,
    };
    const spese = await getSpese(params);
    state.speseCorrente = spese;
    state.paginaCorrente = 1;
    renderTabellaSpese();
  } catch (e) {
    toast('Errore caricamento spese: ' + e.message, 'error');
  }
}

function renderTabellaSpese() {
  const start = (state.paginaCorrente - 1) * state.righePerPagina;
  const pagina = state.speseCorrente.slice(start, start + state.righePerPagina);
  const tbody = document.getElementById('tbody-spese');
  if (!tbody) return;

  if (!pagina.length) {
    tbody.innerHTML = '<tr><td colspan="7"><div class="empty-state"><div class="empty-state-icon">📭</div><div class="empty-state-text">Nessuna spesa trovata</div></div></td></tr>';
  } else {
    tbody.innerHTML = pagina.map(s => {
      const cat = s.categorie || {};
      const bg = cat.colore ? cat.colore + '22' : 'var(--surface2)';
      const color = cat.colore || '#888';
      return `<tr>
        <td>${formatData(s.data)}</td>
        <td>${s.descrizione}</td>
        <td><span class="badge" style="background:${bg};color:${color}">${cat.icona || '📦'} ${cat.nome || '—'}</span></td>
        <td class="importo">${formatImporto(s.importo)}</td>
        <td class="fonte-badge">${s.fonte === 'telegram' ? '🤖 Telegram' : '🌐 Web'}</td>
        <td style="color:var(--text2);font-size:12px">${s.note || ''}</td>
        <td>
          <div style="display:flex;gap:4px">
            <button class="btn btn-ghost btn-sm" onclick="apriModificaSpesa('${s.id}')">✏️</button>
            <button class="btn btn-danger btn-sm" onclick="confermaEliminaSpesa('${s.id}','${s.descrizione}')">🗑️</button>
          </div>
        </td>
      </tr>`;
    }).join('');
  }

  renderPaginazione();
}

function renderPaginazione() {
  const totale = state.speseCorrente.length;
  const pagine = Math.ceil(totale / state.righePerPagina);
  const cont = document.getElementById('paginazione');
  if (!cont) return;

  const info = `<span class="pagination-info">${totale} spese totali</span>`;
  let btns = `<button onclick="cambiaPagina(${state.paginaCorrente - 1})" ${state.paginaCorrente <= 1 ? 'disabled' : ''}>←</button>`;

  for (let i = 1; i <= pagine; i++) {
    if (pagine <= 7 || Math.abs(i - state.paginaCorrente) <= 2 || i === 1 || i === pagine) {
      btns += `<button class="${i === state.paginaCorrente ? 'active' : ''}" onclick="cambiaPagina(${i})">${i}</button>`;
    } else if (Math.abs(i - state.paginaCorrente) === 3) {
      btns += `<span style="color:var(--text2)">…</span>`;
    }
  }

  btns += `<button onclick="cambiaPagina(${state.paginaCorrente + 1})" ${state.paginaCorrente >= pagine ? 'disabled' : ''}>→</button>`;
  cont.innerHTML = info + btns;
}

window.cambiaPagina = function(p) {
  const max = Math.ceil(state.speseCorrente.length / state.righePerPagina);
  if (p < 1 || p > max) return;
  state.paginaCorrente = p;
  renderTabellaSpese();
};

// Filtri spese
document.getElementById('filtro-testo')?.addEventListener('input', debounce(e => {
  if (e.target.value) state.filtriSpese.q = e.target.value;
  else delete state.filtriSpese.q;
  fetchERenderSpese();
}, 300));

document.getElementById('filtro-categoria')?.addEventListener('change', e => {
  if (e.target.value) state.filtriSpese.categoria_id = e.target.value;
  else delete state.filtriSpese.categoria_id;
  fetchERenderSpese();
});

document.getElementById('filtro-periodo')?.addEventListener('change', e => {
  const oggi = new Date();
  delete state.filtriSpese.data_da;
  delete state.filtriSpese.data_a;
  delete state.filtriSpese.mese;
  delete state.filtriSpese.anno;

  if (e.target.value === 'settimana') {
    const sette = new Date(oggi);
    sette.setDate(oggi.getDate() - 7);
    state.filtriSpese.data_da = sette.toISOString().split('T')[0];
  } else if (e.target.value === 'mese') {
    state.filtriSpese.mese = oggi.getMonth() + 1;
    state.filtriSpese.anno = oggi.getFullYear();
  } else if (e.target.value === 'tre-mesi') {
    const treM = new Date(oggi);
    treM.setMonth(oggi.getMonth() - 3);
    state.filtriSpese.data_da = treM.toISOString().split('T')[0];
  }
  fetchERenderSpese();
});

// Ordinamento colonne
document.querySelectorAll('thead th[data-col]').forEach(th => {
  th.addEventListener('click', () => {
    const col = th.dataset.col;
    if (state.ordinamento.col === col) {
      state.ordinamento.dir = state.ordinamento.dir === 'asc' ? 'desc' : 'asc';
    } else {
      state.ordinamento.col = col;
      state.ordinamento.dir = 'desc';
    }
    document.querySelectorAll('thead th[data-col]').forEach(t => t.classList.remove('sort-asc', 'sort-desc'));
    th.classList.add(state.ordinamento.dir === 'asc' ? 'sort-asc' : 'sort-desc');
    fetchERenderSpese();
  });
});

// ─── MODAL NUOVA SPESA ────────────────────────────────────────────

document.getElementById('btn-nuova-spesa')?.addEventListener('click', () => apriModalSpesa());

async function apriModalSpesa(spesaId = null) {
  state.spesaModifica = spesaId;
  if (!state.categorie.length) state.categorie = await getCategorie();

  const modal = document.getElementById('modal-spesa');
  const titolo = document.getElementById('modal-spesa-titolo');
  titolo.textContent = spesaId ? 'Modifica spesa' : 'Nuova spesa';

  const selCat = document.getElementById('spesa-categoria');
  selCat.innerHTML = '<option value="">Seleziona categoria...</option>' +
    state.categorie.map(c => `<option value="${c.id}">${c.icona || ''} ${c.nome}</option>`).join('');

  // Pre-popola se modifica
  if (spesaId) {
    const spesa = state.speseCorrente.find(s => s.id === spesaId);
    if (spesa) {
      document.getElementById('spesa-importo').value = spesa.importo;
      document.getElementById('spesa-data').value = spesa.data;
      document.getElementById('spesa-descrizione').value = spesa.descrizione;
      document.getElementById('spesa-categoria').value = spesa.categoria_id || '';
      document.getElementById('spesa-note').value = spesa.note || '';
    }
  } else {
    document.getElementById('spesa-importo').value = '';
    document.getElementById('spesa-data').value = new Date().toISOString().split('T')[0];
    document.getElementById('spesa-descrizione').value = '';
    document.getElementById('spesa-note').value = '';
  }

  modal.classList.add('active');
}

window.apriModificaSpesa = function(id) {
  apriModalSpesa(id);
};

document.getElementById('modal-spesa')?.addEventListener('click', e => {
  if (e.target === e.currentTarget) chiudiModalSpesa();
});

document.getElementById('btn-chiudi-spesa')?.addEventListener('click', chiudiModalSpesa);
document.getElementById('btn-annulla-spesa')?.addEventListener('click', chiudiModalSpesa);

function chiudiModalSpesa() {
  document.getElementById('modal-spesa').classList.remove('active');
  state.spesaModifica = null;
}

document.getElementById('btn-salva-spesa')?.addEventListener('click', async () => {
  const importo = parseFloat(document.getElementById('spesa-importo').value);
  const data = document.getElementById('spesa-data').value;
  const descrizione = document.getElementById('spesa-descrizione').value.trim();
  const categoria_id = document.getElementById('spesa-categoria').value || null;
  const note = document.getElementById('spesa-note').value.trim();

  if (!descrizione || isNaN(importo) || importo <= 0) {
    toast('Inserisci descrizione e importo valido', 'error');
    return;
  }

  try {
    const payload = { descrizione, importo, data, nota: note, fonte: 'web' };
    if (categoria_id) payload.categoria_id = categoria_id;

    if (state.spesaModifica) {
      await modificaSpesa(state.spesaModifica, payload);
      toast('Spesa modificata', 'success');
    } else {
      await creaSpesa(payload);
      toast('Spesa aggiunta', 'success');
    }

    chiudiModalSpesa();
    await fetchERenderSpese();
    await loadDashboard();
  } catch (e) {
    toast('Errore: ' + e.message, 'error');
  }
});

// Auto-suggerimento categoria
document.getElementById('spesa-descrizione')?.addEventListener('input', debounce(async e => {
  const desc = e.target.value.toLowerCase();
  if (!desc || !state.categorie.length) return;
  const match = state.categorie.find(c =>
    (c.regole || []).some(r => desc.includes(r.toLowerCase()))
  );
  if (match) {
    document.getElementById('spesa-categoria').value = match.id;
  }
}, 200));

window.confermaEliminaSpesa = async function(id, desc) {
  if (!confirm(`Eliminare "${desc}"?`)) return;
  try {
    await eliminaSpesa(id);
    toast('Spesa eliminata', 'success');
    await fetchERenderSpese();
    await loadDashboard();
  } catch (e) {
    toast('Errore: ' + e.message, 'error');
  }
};

// ─── ENTRATE ──────────────────────────────────────────────────────

async function loadEntrate() {
  await fetchERenderEntrate();
  const annuali = await getStatisticheAnnualiEntrate(state.annoCorrente);
  renderAnnualEntryChart(annuali);
  const label = document.getElementById('entrate-anno-label');
  if (label) label.textContent = state.annoCorrente;
  try {
    const totali = await getTotaliEntrate(state.annoCorrente);
    const kpiAnno = document.getElementById('kpi-entrate-anno');
    const kpiStorico = document.getElementById('kpi-entrate-storico');
    if (kpiAnno) kpiAnno.textContent = formatImporto(totali.totale_anno);
    if (kpiStorico) kpiStorico.textContent = formatImporto(totali.totale_storico);
  } catch { /* non critico */ }
}

async function fetchERenderEntrate() {
  try {
    const params = { ...state.filtriEntrate };
    const entrate = await getEntrate(params);
    state.entrateCorrente = entrate;
    renderTabellaEntrate();
  } catch (e) {
    toast('Errore caricamento entrate: ' + e.message, 'error');
  }
}

function renderTabellaEntrate() {
  const tbody = document.getElementById('tbody-entrate');
  if (!tbody) return;
  if (!state.entrateCorrente.length) {
    tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state"><div class="empty-state-icon">💰</div><div class="empty-state-text">Nessuna entrata</div></div></td></tr>';
    return;
  }
  tbody.innerHTML = state.entrateCorrente.map(e => `<tr>
    <td>${formatData(e.data)}</td>
    <td>${e.descrizione}</td>
    <td><span class="badge" style="background:var(--surface2);color:var(--text2)">${e.tipo || 'altro'}</span></td>
    <td class="importo" style="color:var(--green)">${formatImporto(e.importo)}</td>
    <td style="color:var(--text2);font-size:12px">${e.note || ''}</td>
    <td>
      <div style="display:flex;gap:4px">
        <button class="btn btn-ghost btn-sm" onclick="apriModificaEntrata('${e.id}')">✏️</button>
        <button class="btn btn-danger btn-sm" onclick="confermaEliminaEntrata('${e.id}','${e.descrizione.replace(/'/g,"\\'")}')">🗑️</button>
      </div>
    </td>
  </tr>`).join('');
}

document.getElementById('entrate-filtro-testo')?.addEventListener('input', debounce(e => {
  if (e.target.value) state.filtriEntrate.q = e.target.value;
  else delete state.filtriEntrate.q;
  fetchERenderEntrate();
}, 300));

document.getElementById('entrate-filtro-tipo')?.addEventListener('change', e => {
  if (e.target.value) state.filtriEntrate.tipo = e.target.value;
  else delete state.filtriEntrate.tipo;
  fetchERenderEntrate();
});

document.getElementById('btn-nuova-entrata')?.addEventListener('click', () => apriModalEntrata());

async function apriModalEntrata(id = null) {
  state.entrataModifica = id;
  const modal = document.getElementById('modal-entrata');
  document.getElementById('modal-entrata-titolo').textContent = id ? 'Modifica entrata' : 'Nuova entrata';

  if (id) {
    const e = state.entrateCorrente.find(x => x.id === id);
    if (e) {
      document.getElementById('entrata-importo').value = e.importo;
      document.getElementById('entrata-data').value = e.data;
      document.getElementById('entrata-descrizione').value = e.descrizione;
      document.getElementById('entrata-tipo').value = e.tipo || 'altro';
      document.getElementById('entrata-note').value = e.note || '';
    }
  } else {
    document.getElementById('entrata-importo').value = '';
    document.getElementById('entrata-data').value = new Date().toISOString().split('T')[0];
    document.getElementById('entrata-descrizione').value = '';
    document.getElementById('entrata-tipo').value = 'stipendio';
    document.getElementById('entrata-note').value = '';
  }
  modal.classList.add('active');
}

window.apriModificaEntrata = apriModalEntrata;

document.getElementById('modal-entrata')?.addEventListener('click', e => {
  if (e.target === e.currentTarget) document.getElementById('modal-entrata').classList.remove('active');
});
document.getElementById('btn-chiudi-entrata')?.addEventListener('click', () =>
  document.getElementById('modal-entrata').classList.remove('active'));
document.getElementById('btn-annulla-entrata')?.addEventListener('click', () =>
  document.getElementById('modal-entrata').classList.remove('active'));

document.getElementById('btn-salva-entrata')?.addEventListener('click', async () => {
  const importo = parseFloat(document.getElementById('entrata-importo').value);
  const data = document.getElementById('entrata-data').value;
  const descrizione = document.getElementById('entrata-descrizione').value.trim();
  const tipo = document.getElementById('entrata-tipo').value;
  const note = document.getElementById('entrata-note').value.trim();

  if (!descrizione || isNaN(importo) || importo <= 0) {
    toast('Inserisci descrizione e importo valido', 'error');
    return;
  }
  try {
    const payload = { descrizione, importo, data, tipo, note };
    if (state.entrataModifica) {
      await modificaEntrata(state.entrataModifica, payload);
      toast('Entrata modificata', 'success');
    } else {
      await creaEntrata(payload);
      toast('Entrata aggiunta', 'success');
    }
    document.getElementById('modal-entrata').classList.remove('active');
    state.entrataModifica = null;
    await fetchERenderEntrate();
  } catch (e) {
    toast('Errore: ' + e.message, 'error');
  }
});

window.confermaEliminaEntrata = async function(id, desc) {
  if (!confirm(`Eliminare "${desc}"?`)) return;
  try {
    await eliminaEntrata(id);
    toast('Entrata eliminata', 'success');
    await fetchERenderEntrate();
  } catch (e) {
    toast('Errore: ' + e.message, 'error');
  }
};

// ─── ABBONAMENTI ──────────────────────────────────────────────────

async function loadAbbonamenti() {
  if (!state.categorie.length) state.categorie = await getCategorie();
  await fetchERenderAbbonamenti();
}

async function fetchERenderAbbonamenti() {
  try {
    const tutti = await getAbbonamenti();
    state.abbonamentiCorrente = tutti;
    renderListaAbbonamenti();
  } catch (e) {
    toast('Errore caricamento abbonamenti: ' + e.message, 'error');
  }
}

function renderListaAbbonamenti() {
  const cont = document.getElementById('lista-abbonamenti');
  if (!cont) return;

  // KPI costo mensile abbonamenti attivi (escluso rate)
  const soloAbb = state.abbonamentiCorrente.filter(a => a.attivo && a.tipo === 'abbonamento');
  const totMensile = soloAbb.reduce((s, a) => s + parseFloat(a.importo), 0);
  const kpiAbb = document.getElementById('abb-totale-mensile');
  if (kpiAbb) kpiAbb.textContent = formatImporto(totMensile);

  // Filtraggio per tab
  let lista;
  const filtro = state.filtroTipoAbb;
  if (filtro === 'completate') {
    lista = state.abbonamentiCorrente.filter(a =>
      !a.attivo && a.tipo === 'rata' && a.n_rate_totali && (a.n_rate_pagate || 0) >= a.n_rate_totali
    );
  } else if (filtro === 'tutti') {
    lista = state.abbonamentiCorrente.filter(a => a.attivo);
  } else {
    lista = state.abbonamentiCorrente.filter(a => a.attivo && a.tipo === filtro);
  }

  if (!lista.length) {
    cont.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🔄</div><div class="empty-state-text">Nessun abbonamento</div></div>';
    return;
  }

  const isCompletate = filtro === 'completate';

  cont.innerHTML = lista.map(a => {
    const cat = a.categorie || {};
    const bg = cat.colore ? cat.colore + '22' : 'var(--surface2)';
    const color = cat.colore || '#888';
    const freqLabel = a.tipo === 'rata' ? ' totale' : ({ mensile: '/mese', annuale: '/anno', settimanale: '/sett.' }[a.frequenza] || '');
    let rateInfo = '';
    if (a.tipo === 'rata' && a.n_rate_totali) {
      const perc = Math.min(100, Math.round(((a.n_rate_pagate || 0) / a.n_rate_totali) * 100));
      const importoRata = parseFloat(a.importo) / parseInt(a.n_rate_totali);
      const pagato = (a.n_rate_pagate || 0) * importoRata;
      const totale = parseFloat(a.importo);
      rateInfo = `<div class="rata-progress">
        <div class="rata-label">${a.n_rate_pagate || 0} / ${a.n_rate_totali} rate — ${formatImporto(pagato)} / ${formatImporto(totale)}</div>
        <div class="rata-bar-track"><div class="rata-bar-fill" style="width:${perc}%"></div></div>
      </div>`;
    }
    const badgeCompletata = isCompletate
      ? '<span class="badge abb-attivo" style="background:#00d4ff22;color:#00d4ff">✅ Completata</span>'
      : `<span class="badge ${a.attivo ? 'abb-attivo' : 'abb-inattivo'}">${a.attivo ? 'Attivo' : 'Inattivo'}</span>`;
    const descEsc = a.descrizione.replace(/'/g, "\\'");
    const azioni = isCompletate
      ? `<button class="btn btn-danger btn-sm" onclick="confermaEliminaAbb('${a.id}','${descEsc}')">🗑️</button>`
      : `<button class="btn btn-ghost btn-sm" onclick="apriModificaAbbonamento('${a.id}')">✏️ Modifica</button>
         ${a.attivo ? `<button class="btn btn-secondary btn-sm" onclick="addebitaOra('${a.id}')">💳 Addebita ora</button>` : `<button class="btn btn-primary btn-sm" onclick="apriRiattiva('${a.id}',${a.tipo === 'rata' ? 'true' : 'false'},${a.giorno_addebito})">↩️ Riattiva</button>`}
         ${a.attivo ? `<button class="btn btn-danger btn-sm" onclick="confermaDisattivaAbb('${a.id}','${descEsc}')">⏹ Disattiva</button>` : ''}
         <button class="btn btn-danger btn-sm" onclick="confermaEliminaAbb('${a.id}','${descEsc}')">🗑️</button>`;
    return `<div class="abb-card">
      <div class="abb-card-header">
        <div class="abb-card-title">
          <span style="font-size:18px">${cat.icona || '🔄'}</span>
          <div>
            <div class="abb-nome">${a.descrizione}</div>
            <div class="abb-meta">Giorno ${a.giorno_addebito} · ${a.frequenza}</div>
          </div>
        </div>
        <div class="abb-card-right">
          <div class="abb-importo">${formatImporto(a.importo)}<span style="font-size:11px;color:var(--text2)">${freqLabel}</span></div>
          ${badgeCompletata}
        </div>
      </div>
      ${cat.nome ? `<div style="margin:6px 0"><span class="badge" style="background:${bg};color:${color}">${cat.icona || ''} ${cat.nome}</span></div>` : ''}
      ${rateInfo}
      ${a.note ? `<div style="font-size:12px;color:var(--text2);margin-top:4px">${a.note}</div>` : ''}
      <div class="abb-actions">${azioni}</div>
    </div>`;
  }).join('');
}

document.querySelectorAll('.abb-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.abb-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.filtroTipoAbb = btn.dataset.tipo;
    renderListaAbbonamenti();
  });
});

document.getElementById('btn-nuovo-abbonamento')?.addEventListener('click', () => apriModalAbbonamento());

async function apriModalAbbonamento(id = null) {
  state.abboModifica = id;
  if (!state.categorie.length) state.categorie = await getCategorie();
  const modal = document.getElementById('modal-abbonamento');
  document.getElementById('modal-abb-titolo').textContent = id ? 'Modifica abbonamento' : 'Nuovo abbonamento';
  document.getElementById('abb-id-hidden').value = id || '';

  const selCat = document.getElementById('abb-categoria');
  selCat.innerHTML = '<option value="">Nessuna</option>' +
    state.categorie.map(c => `<option value="${c.id}">${c.icona || ''} ${c.nome}</option>`).join('');

  if (id) {
    const a = state.abbonamentiCorrente.find(x => x.id === id);
    if (a) {
      document.getElementById('abb-descrizione').value = a.descrizione;
      document.getElementById('abb-importo').value = a.importo;
      document.getElementById('abb-tipo').value = a.tipo || 'abbonamento';
      document.getElementById('abb-frequenza').value = a.frequenza || 'mensile';
      document.getElementById('abb-giorno').value = a.giorno_addebito || 1;
      document.getElementById('abb-categoria').value = a.categoria_id || '';
      document.getElementById('abb-n-rate').value = a.n_rate_totali || '';
      document.getElementById('abb-note').value = a.note || '';
      document.getElementById('abb-rate-group').style.display = a.tipo === 'rata' ? '' : 'none';
    }
  } else {
    document.getElementById('abb-descrizione').value = '';
    document.getElementById('abb-importo').value = '';
    document.getElementById('abb-tipo').value = 'abbonamento';
    document.getElementById('abb-frequenza').value = 'mensile';
    document.getElementById('abb-giorno').value = new Date().getDate();
    document.getElementById('abb-categoria').value = '';
    document.getElementById('abb-n-rate').value = '';
    document.getElementById('abb-note').value = '';
    document.getElementById('abb-rate-group').style.display = 'none';
  }
  modal.classList.add('active');
}

window.apriModificaAbbonamento = apriModalAbbonamento;

function aggiornaCalcRata() {
  const tipo = document.getElementById('abb-tipo')?.value;
  const importo = parseFloat(document.getElementById('abb-importo')?.value);
  const nRate = parseInt(document.getElementById('abb-n-rate')?.value);
  const helper = document.getElementById('abb-importo-helper');
  // Aggiorna label campo importo
  const labelImporto = document.getElementById('abb-importo')?.closest('.form-group')?.querySelector('label');
  if (labelImporto) labelImporto.textContent = tipo === 'rata' ? 'Importo totale (€) *' : 'Importo (€) *';
  if (!helper) return;
  if (tipo === 'rata' && importo > 0 && nRate > 0) {
    document.getElementById('abb-rata-calc').textContent = `€${(importo / nRate).toFixed(2)}`;
    helper.style.display = 'block';
  } else {
    helper.style.display = 'none';
  }
}

document.getElementById('abb-tipo')?.addEventListener('change', e => {
  document.getElementById('abb-rate-group').style.display = e.target.value === 'rata' ? '' : 'none';
  aggiornaCalcRata();
});

document.getElementById('abb-importo')?.addEventListener('input', aggiornaCalcRata);
document.getElementById('abb-n-rate')?.addEventListener('input', aggiornaCalcRata);

document.getElementById('modal-abbonamento')?.addEventListener('click', e => {
  if (e.target === e.currentTarget) document.getElementById('modal-abbonamento').classList.remove('active');
});
document.getElementById('btn-chiudi-abb')?.addEventListener('click', () =>
  document.getElementById('modal-abbonamento').classList.remove('active'));
document.getElementById('btn-annulla-abb')?.addEventListener('click', () =>
  document.getElementById('modal-abbonamento').classList.remove('active'));

document.getElementById('btn-salva-abb')?.addEventListener('click', async () => {
  const descrizione = document.getElementById('abb-descrizione').value.trim();
  const importo = parseFloat(document.getElementById('abb-importo').value);
  if (!descrizione || isNaN(importo) || importo <= 0) {
    toast('Inserisci descrizione e importo valido', 'error');
    return;
  }
  const tipo = document.getElementById('abb-tipo').value;
  const payload = {
    descrizione,
    importo,
    tipo,
    frequenza: document.getElementById('abb-frequenza').value,
    giorno_addebito: parseInt(document.getElementById('abb-giorno').value) || 1,
    categoria_id: document.getElementById('abb-categoria').value || null,
    note: document.getElementById('abb-note').value.trim(),
  };
  if (tipo === 'rata') {
    const nRate = parseInt(document.getElementById('abb-n-rate').value);
    if (nRate > 0) payload.n_rate_totali = nRate;
  }
  try {
    const id = document.getElementById('abb-id-hidden').value;
    if (id) {
      await modificaAbbonamento(id, payload);
      toast('Abbonamento modificato', 'success');
    } else {
      const creato = await creaAbbonamento(payload);
      try {
        await addebitaAbbonamento(creato.id);
        toast('Abbonamento aggiunto — prima spesa addebitata', 'success');
      } catch (errAbb) {
        toast('Abbonamento aggiunto, ma addebito fallito: ' + errAbb.message, 'warning');
      }
    }
    document.getElementById('modal-abbonamento').classList.remove('active');
    state.abboModifica = null;
    await fetchERenderAbbonamenti();
  } catch (e) {
    toast('Errore: ' + e.message, 'error');
  }
});

window.addebitaOra = async function(id) {
  try {
    await addebitaAbbonamento(id);
    toast('Spesa addebitata con successo', 'success');
    await fetchERenderAbbonamenti();
  } catch (e) {
    toast('Errore: ' + e.message, 'error');
  }
};

window.confermaDisattivaAbb = async function(id, nome) {
  if (!confirm(`Disattivare "${nome}"? Dal prossimo ciclo non verrà più addebitato.`)) return;
  try {
    await disattivaAbbonamento(id);
    toast('Abbonamento disattivato', 'success');
    await fetchERenderAbbonamenti();
  } catch (e) {
    toast('Errore: ' + e.message, 'error');
  }
};

window.apriRiattiva = function(id, isRata, giornoAttuale) {
  document.getElementById('riattiva-id').value = id;
  document.getElementById('riattiva-giorno').value = giornoAttuale || 1;
  const rateGroup = document.getElementById('riattiva-rate-group');
  if (rateGroup) rateGroup.style.display = isRata === true || isRata === 'true' ? '' : 'none';
  document.getElementById('riattiva-rate-pagate').value = 0;
  document.getElementById('modal-riattiva').classList.add('active');
};

document.getElementById('btn-salva-riattiva')?.addEventListener('click', async () => {
  const id = document.getElementById('riattiva-id').value;
  const payload = {
    giorno_addebito: parseInt(document.getElementById('riattiva-giorno').value) || 1,
  };
  const rateGroup = document.getElementById('riattiva-rate-group');
  if (rateGroup && rateGroup.style.display !== 'none') {
    payload.n_rate_pagate = parseInt(document.getElementById('riattiva-rate-pagate').value) || 0;
  }
  try {
    await riativaAbbonamento(id, payload);
    toast('Abbonamento riattivato', 'success');
    document.getElementById('modal-riattiva').classList.remove('active');
    await fetchERenderAbbonamenti();
  } catch (e) {
    toast('Errore: ' + e.message, 'error');
  }
});

['btn-chiudi-riattiva', 'btn-annulla-riattiva'].forEach(btnId => {
  document.getElementById(btnId)?.addEventListener('click', () =>
    document.getElementById('modal-riattiva').classList.remove('active'));
});

window.confermaEliminaAbb = async function(id, nome) {
  if (!confirm(`Eliminare definitivamente "${nome}"?`)) return;
  try {
    await eliminaAbbonamento(id);
    toast('Abbonamento eliminato', 'success');
    await fetchERenderAbbonamenti();
  } catch (e) {
    toast('Errore: ' + e.message, 'error');
  }
};

// ─── CONFIGURAZIONE ───────────────────────────────────────────────

async function loadConfigurazione() {
  try {
    state.categorie = await getCategorie();
    state.appConfig = await getAppConfig();
    renderListaCategorie();
    populateAppConfig();
  } catch (e) {
    toast('Errore caricamento configurazione: ' + e.message, 'error');
  }
}

function renderListaCategorie() {
  const cont = document.getElementById('lista-categorie');
  if (!cont) return;
  if (!state.categorie.length) {
    cont.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📂</div><div class="empty-state-text">Nessuna categoria</div></div>';
    return;
  }
  cont.innerHTML = state.categorie.map(c => `
    <div class="categoria-item">
      <div class="cat-icona" style="background:${c.colore}22">${c.icona || '📦'}</div>
      <div>
        <div class="cat-nome">${c.nome}</div>
        <div class="cat-budget">Budget: ${formatImporto(c.budget_mensile || 0)}/mese</div>
        <div class="cat-regole">${(c.regole || []).join(', ') || 'Nessuna regola'}</div>
      </div>
      <div class="cat-actions">
        <button class="btn btn-ghost btn-sm" onclick="apriModificaCategoria('${c.id}')">✏️</button>
        <button class="btn btn-danger btn-sm" onclick="confermaEliminaCategoria('${c.id}','${c.nome}')">🗑️</button>
      </div>
    </div>
  `).join('');
}

function populateAppConfig() {
  const cfg = state.appConfig;
  const el = id => document.getElementById(id);
  if (el('cfg-valuta')) el('cfg-valuta').value = cfg.valuta || 'EUR';
  if (el('cfg-simbolo')) el('cfg-simbolo').value = cfg.simbolo_valuta || '€';
  if (el('cfg-budget')) el('cfg-budget').value = cfg.budget_mensile_globale || 1500;
}

document.getElementById('btn-salva-app-config')?.addEventListener('click', async () => {
  try {
    await setAppConfig({
      valuta: document.getElementById('cfg-valuta').value,
      simbolo_valuta: document.getElementById('cfg-simbolo').value,
      budget_mensile_globale: parseFloat(document.getElementById('cfg-budget').value),
    });
    toast('Impostazioni salvate', 'success');
  } catch (e) {
    toast('Errore: ' + e.message, 'error');
  }
});

// Modal categoria
document.getElementById('btn-nuova-categoria')?.addEventListener('click', () => apriModalCategoria());

function apriModalCategoria(id = null) {
  const modal = document.getElementById('modal-categoria');
  document.getElementById('modal-cat-titolo').textContent = id ? 'Modifica categoria' : 'Nuova categoria';
  document.getElementById('cat-id-hidden').value = id || '';

  if (id) {
    const cat = state.categorie.find(c => c.id === id);
    if (cat) {
      document.getElementById('cat-nome').value = cat.nome;
      document.getElementById('cat-icona').value = cat.icona || '';
      document.getElementById('cat-colore').value = cat.colore || '#c8ff00';
      document.getElementById('cat-budget').value = cat.budget_mensile || 0;
      document.getElementById('cat-regole').value = (cat.regole || []).join(', ');
    }
  } else {
    document.getElementById('cat-nome').value = '';
    document.getElementById('cat-icona').value = '';
    document.getElementById('cat-colore').value = '#c8ff00';
    document.getElementById('cat-budget').value = 0;
    document.getElementById('cat-regole').value = '';
  }
  modal.classList.add('active');
}

window.apriModificaCategoria = apriModalCategoria;

document.getElementById('modal-categoria')?.addEventListener('click', e => {
  if (e.target === e.currentTarget) document.getElementById('modal-categoria').classList.remove('active');
});
document.getElementById('btn-chiudi-cat')?.addEventListener('click', () =>
  document.getElementById('modal-categoria').classList.remove('active'));
document.getElementById('btn-annulla-cat')?.addEventListener('click', () =>
  document.getElementById('modal-categoria').classList.remove('active'));

document.getElementById('btn-salva-categoria')?.addEventListener('click', async () => {
  const nome = document.getElementById('cat-nome').value.trim();
  if (!nome) { toast('Inserisci il nome della categoria', 'error'); return; }

  const regoleRaw = document.getElementById('cat-regole').value;
  const regole = regoleRaw.split(',').map(r => r.trim()).filter(Boolean);

  const payload = {
    nome,
    icona: document.getElementById('cat-icona').value || '📦',
    colore: document.getElementById('cat-colore').value,
    budget_mensile: parseFloat(document.getElementById('cat-budget').value) || 0,
    regole,
  };

  try {
    const id = document.getElementById('cat-id-hidden').value;
    if (id) {
      await modificaCategoria(id, payload);
      toast('Categoria modificata', 'success');
    } else {
      await creaCategoria(payload);
      toast('Categoria creata', 'success');
    }
    document.getElementById('modal-categoria').classList.remove('active');
    state.categorie = await getCategorie();
    renderListaCategorie();
  } catch (e) {
    toast('Errore: ' + e.message, 'error');
  }
});

window.confermaEliminaCategoria = async function(id, nome) {
  if (!confirm(`Eliminare la categoria "${nome}"?`)) return;
  try {
    await eliminaCategoria(id);
    toast('Categoria eliminata', 'success');
    state.categorie = await getCategorie();
    renderListaCategorie();
  } catch (e) {
    toast('Errore: ' + e.message, 'error');
  }
};

// ─── ESPORTA ──────────────────────────────────────────────────────

function loadEsporta() {
  const sel = document.getElementById('export-periodo');
  if (sel) sel.value = `${state.meseCorrente}-${state.annoCorrente}`;
}

document.querySelectorAll('.btn-export').forEach(btn => {
  btn.addEventListener('click', () => {
    const tipo = btn.dataset.tipo;
    const tutto = document.getElementById('export-tutto')?.checked;
    if (tutto) {
      downloadExport(tipo, null, null, true);
    } else {
      downloadExport(tipo, state.meseCorrente, state.annoCorrente);
    }
  });
});

// ─── BOT TELEGRAM MODAL ───────────────────────────────────────────

document.getElementById('btn-bot')?.addEventListener('click', async () => {
  try {
    state.botConfig = await getBotConfig();
    populateBotModal();
    document.getElementById('modal-bot').classList.add('active');
  } catch (e) {
    toast('Errore caricamento config bot', 'error');
  }
});

document.getElementById('modal-bot')?.addEventListener('click', e => {
  if (e.target === e.currentTarget) document.getElementById('modal-bot').classList.remove('active');
});

document.getElementById('btn-chiudi-bot')?.addEventListener('click', () =>
  document.getElementById('modal-bot').classList.remove('active'));

function populateBotModal() {
  const cfg = state.botConfig;
  const el = id => document.getElementById(id);

  if (el('toggle-notif-giornaliera')) el('toggle-notif-giornaliera').checked = cfg.notifica_giornaliera !== false;
  if (el('toggle-notif-settimanale')) el('toggle-notif-settimanale').checked = cfg.notifica_settimanale !== false;
  if (el('toggle-alert-budget')) el('toggle-alert-budget').checked = cfg.alert_budget !== false;
  if (el('toggle-conferma')) el('toggle-conferma').checked = cfg.conferma_inserimento !== false;

  // Formato riepilogo
  document.querySelectorAll('.formato-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.formato === (cfg.formato_riepilogo || 'dettagliato'));
  });

  // Status connessione
  const dot = document.getElementById('bot-status-dot');
  const label = document.getElementById('bot-status-label');
  if (dot) dot.className = 'status-dot online';
  if (label) label.textContent = 'Bot configurato';
}

document.querySelectorAll('.formato-btn').forEach(b => {
  b.addEventListener('click', () => {
    document.querySelectorAll('.formato-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
  });
});

document.getElementById('btn-salva-bot')?.addEventListener('click', async () => {
  const formatoAttivo = document.querySelector('.formato-btn.active')?.dataset.formato || 'dettagliato';
  const payload = {
    notifica_giornaliera: document.getElementById('toggle-notif-giornaliera').checked,
    notifica_settimanale: document.getElementById('toggle-notif-settimanale').checked,
    alert_budget: document.getElementById('toggle-alert-budget').checked,
    conferma_inserimento: document.getElementById('toggle-conferma').checked,
    formato_riepilogo: formatoAttivo,
  };
  try {
    await setBotConfig(payload);
    toast('Configurazione bot salvata', 'success');
    document.getElementById('modal-bot').classList.remove('active');
  } catch (e) {
    toast('Errore: ' + e.message, 'error');
  }
});

// ─── QUERY AVANZATE ───────────────────────────────────────────────

document.getElementById('btn-esegui-query')?.addEventListener('click', async () => {
  const params = {
    data_da: document.getElementById('query-data-da').value || null,
    data_a: document.getElementById('query-data-a').value || null,
    categoria_id: document.getElementById('query-categoria').value || null,
    importo_min: document.getElementById('query-importo-min').value || null,
    importo_max: document.getElementById('query-importo-max').value || null,
    q: document.getElementById('query-testo').value || null,
    fonte: document.getElementById('query-fonte').value || null,
  };

  try {
    const spese = await getSpese(params);
    const totale = spese.reduce((a, s) => a + s.importo, 0);
    const cont = document.getElementById('query-risultati');
    if (!cont) return;

    cont.innerHTML = `
      <div style="margin-bottom:12px;font-size:13px;color:var(--text2)">
        <strong style="color:var(--accent)">${spese.length}</strong> risultati —
        Totale: <strong style="color:var(--text)">${formatImporto(totale)}</strong>
      </div>
      <table>
        <thead><tr><th>Data</th><th>Descrizione</th><th>Categoria</th><th>Importo</th><th>Note</th></tr></thead>
        <tbody>
          ${spese.map(s => {
            const cat = s.categorie || {};
            return `<tr>
              <td>${formatData(s.data)}</td>
              <td>${s.descrizione}</td>
              <td>${cat.icona || ''} ${cat.nome || '—'}</td>
              <td class="importo">${formatImporto(s.importo)}</td>
              <td style="color:var(--text2);font-size:12px">${s.note || ''}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    `;
    // Grafico opzionale
    const flagGrafico = document.getElementById('query-flag-grafico');
    const chartCont = document.getElementById('query-chart-container');
    if (flagGrafico?.checked && spese.length) {
      chartCont.style.display = 'block';
      renderQueryChart(spese);
    } else if (chartCont) {
      chartCont.style.display = 'none';
    }
  } catch (e) {
    toast('Errore query: ' + e.message, 'error');
  }
});

document.getElementById('btn-salva-query')?.addEventListener('click', () => {
  const nome = prompt('Nome per questa query:');
  if (!nome) return;
  const query = {
    nome,
    params: {
      data_da: document.getElementById('query-data-da').value,
      data_a: document.getElementById('query-data-a').value,
      categoria_id: document.getElementById('query-categoria').value,
      importo_min: document.getElementById('query-importo-min').value,
      importo_max: document.getElementById('query-importo-max').value,
      q: document.getElementById('query-testo').value,
      fonte: document.getElementById('query-fonte').value,
    },
  };
  state.salvataggioQuery.push(query);
  localStorage.setItem('spesatrack_queries', JSON.stringify(state.salvataggioQuery));
  renderQuerySalvate();
  toast(`Query "${nome}" salvata`, 'success');
});

function renderQuerySalvate() {
  const cont = document.getElementById('query-salvate');
  if (!cont) return;
  if (!state.salvataggioQuery.length) {
    cont.innerHTML = '<div style="color:var(--text2);font-size:13px">Nessuna query salvata</div>';
    return;
  }
  cont.innerHTML = state.salvataggioQuery.map((q, i) => `
    <div class="saved-query-item" onclick="caricaQuery(${i})">
      <span>🔍</span>
      <span>${q.nome}</span>
      <button class="btn btn-ghost btn-sm" style="margin-left:auto" onclick="eliminaQuerySalvata(event,${i})">✕</button>
    </div>
  `).join('');
}

window.caricaQuery = function(i) {
  const q = state.salvataggioQuery[i];
  if (!q) return;
  const p = q.params;
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
  set('query-data-da', p.data_da);
  set('query-data-a', p.data_a);
  set('query-categoria', p.categoria_id);
  set('query-importo-min', p.importo_min);
  set('query-importo-max', p.importo_max);
  set('query-testo', p.q);
  set('query-fonte', p.fonte);
};

window.eliminaQuerySalvata = function(e, i) {
  e.stopPropagation();
  state.salvataggioQuery.splice(i, 1);
  localStorage.setItem('spesatrack_queries', JSON.stringify(state.salvataggioQuery));
  renderQuerySalvate();
};

// ─── MODAL PROFILO ────────────────────────────────────────────────

document.getElementById('btn-profilo')?.addEventListener('click', async () => {
  try {
    const me = await getMe();
    document.getElementById('profilo-nome').value = me.display_name || '';
    // supabase e telegram non vengono pre-popolati per sicurezza
    document.getElementById('profilo-supabase-url').value = '';
    document.getElementById('profilo-supabase-key').value = '';
    document.getElementById('profilo-tg-token').value = '';
    document.getElementById('profilo-tg-chat').value = '';
    document.getElementById('profilo-password').value = '';
    document.getElementById('profilo-password-conf').value = '';
    document.getElementById('modal-profilo').classList.add('active');
  } catch (e) {
    toast('Errore caricamento profilo: ' + e.message, 'error');
  }
});

document.getElementById('btn-chiudi-profilo')?.addEventListener('click', () => {
  document.getElementById('modal-profilo').classList.remove('active');
});
document.getElementById('btn-annulla-profilo')?.addEventListener('click', () => {
  document.getElementById('modal-profilo').classList.remove('active');
});

document.getElementById('btn-salva-profilo')?.addEventListener('click', async () => {
  const payload = {};
  const nome      = document.getElementById('profilo-nome').value.trim();
  const sbUrl     = document.getElementById('profilo-supabase-url').value.trim();
  const sbKey     = document.getElementById('profilo-supabase-key').value.trim();
  const tgToken   = document.getElementById('profilo-tg-token').value.trim();
  const tgChat    = document.getElementById('profilo-tg-chat').value.trim();
  const pwd       = document.getElementById('profilo-password').value;
  const pwdConf   = document.getElementById('profilo-password-conf').value;

  if (nome)    payload.display_name    = nome;
  if (sbUrl)   payload.supabase_url    = sbUrl;
  if (sbKey)   payload.supabase_key    = sbKey;
  if (tgToken) payload.telegram_token  = tgToken;
  if (tgChat)  payload.telegram_chat_id = tgChat;

  if (pwd) {
    if (pwd !== pwdConf) { toast('Le password non coincidono', 'error'); return; }
    if (pwd.length < 8)  { toast('Password minimo 8 caratteri', 'error'); return; }
    payload.password = pwd;
  }

  if (Object.keys(payload).length === 0) {
    toast('Nessuna modifica da salvare', 'error');
    return;
  }

  try {
    await updateProfile(payload);
    if (nome) document.getElementById('topbar-nome').textContent = nome;
    document.getElementById('modal-profilo').classList.remove('active');
    toast('Profilo aggiornato', 'success');
  } catch (e) {
    toast('Errore: ' + e.message, 'error');
  }
});

// ─── INIT ─────────────────────────────────────────────────────────

function debounce(fn, ms) {
  let t;
  return function(...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), ms);
  };
}

async function init() {
  // Carica query salvate da localStorage
  const saved = localStorage.getItem('spesatrack_queries');
  if (saved) state.salvataggioQuery = JSON.parse(saved);
  renderQuerySalvate();

  // Carica config app
  try {
    state.appConfig = await getAppConfig();
    state.categorie = await getCategorie();
  } catch (e) {
    console.warn('Config non disponibile:', e.message);
  }

  aggiornaLabelMese();
  loadDashboard();
}

init();
