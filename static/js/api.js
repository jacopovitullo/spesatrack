/**
 * api.js — Wrapper per le chiamate al backend Flask.
 * Base URL: /api
 */

const BASE = '/api';

async function request(method, path, body = null) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== null) opts.body = JSON.stringify(body);

  const res = await fetch(BASE + path, opts);
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data;
}

// ── Spese ─────────────────────────────────────────────────────────

export async function getSpese(params = {}) {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== null && v !== '' && v !== undefined)
  ).toString();
  return request('GET', `/spese${qs ? '?' + qs : ''}`);
}

export async function creaSpesa(data) {
  return request('POST', '/spese', data);
}

export async function modificaSpesa(id, data) {
  return request('PUT', `/spese/${id}`, data);
}

export async function eliminaSpesa(id) {
  return request('DELETE', `/spese/${id}`);
}

// ── Statistiche ───────────────────────────────────────────────────

export async function getStatistiche(mese, anno) {
  return request('GET', `/statistiche?mese=${mese}&anno=${anno}`);
}

// ── Categorie ─────────────────────────────────────────────────────

export async function getCategorie() {
  return request('GET', '/categorie');
}

export async function creaCategoria(data) {
  return request('POST', '/categorie', data);
}

export async function modificaCategoria(id, data) {
  return request('PUT', `/categorie/${id}`, data);
}

export async function eliminaCategoria(id) {
  return request('DELETE', `/categorie/${id}`);
}

// ── Configurazione ────────────────────────────────────────────────

export async function getBotConfig() {
  return request('GET', '/config/bot');
}

export async function setBotConfig(data) {
  return request('PUT', '/config/bot', data);
}

export async function getAppConfig() {
  return request('GET', '/config/app');
}

export async function setAppConfig(data) {
  return request('PUT', '/config/app', data);
}

// ── Export ────────────────────────────────────────────────────────

export function downloadExport(tipo, mese, anno, tutto = false) {
  const params = tutto ? 'tutto=true' : `mese=${mese}&anno=${anno}`;
  window.location.href = `${BASE}/export/${tipo}?${params}`;
}
