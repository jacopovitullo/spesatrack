/**
 * main.js — Logica principale SPA SpesaTrack.
 */

import {
  getSpese, creaSpesa, modificaSpesa, eliminaSpesa,
  getStatistiche, getCategorie, creaCategoria, modificaCategoria, eliminaCategoria,
  getBotConfig, setBotConfig, getAppConfig, setAppConfig,
  downloadExport,
} from './api.js';

import { renderBarChart, renderDoughnutChart } from './charts.js';

// ─── Stato globale ────────────────────────────────────────────────

const state = {
  meseCorrente: new Date().getMonth() + 1,
  annoCorrente: new Date().getFullYear(),
  categorie: [],
  speseCorrente: [],
  paginaCorrente: 1,
  righePerPagina: 20,
  ordinamento: { col: 'data', dir: 'desc' },
  filtriSpese: {},
  salvataggioQuery: [],
  appConfig: {},
  botConfig: {},
  spesaModifica: null,
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
  if (pageId === 'configurazione') loadConfigurazione();
  if (pageId === 'esporta') loadEsporta();
}

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

// ─── DASHBOARD ────────────────────────────────────────────────────

async function loadDashboard() {
  try {
    loading('kpi-container');
    const stats = await getStatistiche(state.meseCorrente, state.annoCorrente);
    renderKPI(stats);
    renderBarChart(stats.per_giorno || []);
    renderDoughnutChart(stats.per_categoria || []);
    await loadUltimeSpese();
  } catch (e) {
    toast('Errore caricamento dashboard: ' + e.message, 'error');
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

  if (el('bot-token')) el('bot-token').value = cfg.token || '';
  if (el('bot-chat-id')) el('bot-chat-id').value = cfg.chat_id || '';
  if (el('toggle-notif-giornaliera')) el('toggle-notif-giornaliera').checked = cfg.notifica_giornaliera !== false;
  if (el('toggle-notif-settimanale')) el('toggle-notif-settimanale').checked = cfg.notifica_settimanale !== false;
  if (el('toggle-alert-budget')) el('toggle-alert-budget').checked = cfg.alert_budget !== false;
  if (el('toggle-conferma')) el('toggle-conferma').checked = cfg.conferma_inserimento !== false;

  // Formato riepilogo
  document.querySelectorAll('.formato-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.formato === (cfg.formato_riepilogo || 'dettagliato'));
  });

  // Status connessione
  const haToken = !!(cfg.token && cfg.token.length > 10);
  const dot = document.getElementById('bot-status-dot');
  const label = document.getElementById('bot-status-label');
  if (dot) dot.className = `status-dot ${haToken ? 'online' : 'offline'}`;
  if (label) label.textContent = haToken ? 'Bot configurato' : 'Token non configurato';
}

document.querySelectorAll('.formato-btn').forEach(b => {
  b.addEventListener('click', () => {
    document.querySelectorAll('.formato-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
  });
});

document.getElementById('btn-toggle-token')?.addEventListener('click', () => {
  const input = document.getElementById('bot-token');
  input.type = input.type === 'password' ? 'text' : 'password';
});

document.getElementById('btn-salva-bot')?.addEventListener('click', async () => {
  const formatoAttivo = document.querySelector('.formato-btn.active')?.dataset.formato || 'dettagliato';
  const payload = {
    token: document.getElementById('bot-token').value,
    chat_id: document.getElementById('bot-chat-id').value,
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
