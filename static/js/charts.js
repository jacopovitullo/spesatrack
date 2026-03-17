/**
 * charts.js — Gestione grafici Chart.js per SpesaTrack.
 */

let chartBar = null;
let chartDoughnut = null;
let chartBarEntrate = null;

const CHART_DEFAULTS = {
  font: { family: "'DM Mono', monospace", size: 12 },
  color: '#7a7a9a',
};

Chart.defaults.font.family = CHART_DEFAULTS.font.family;
Chart.defaults.color = CHART_DEFAULTS.color;

// ── Theme helpers ─────────────────────────────────────────────────

function isLight() {
  return document.body.classList.contains('light');
}

function themeColors() {
  const light = isLight();
  return {
    // Tick / label color
    tickColor:     light ? '#6b6b88' : '#7a7a9a',
    // Grid lines
    gridColor:     light ? 'rgba(176, 176, 200, 0.5)' : 'rgba(42,42,56,0.5)',
    // Tooltip
    tooltipBg:     light ? '#ffffff' : '#1c1c26',
    tooltipBorder: light ? '#d0d0e0' : '#2a2a38',
    tooltipText:   light ? '#111118' : '#e8e8f0',
    // Bar chart (spese giornaliere / annuali)
    barFill:       light ? 'rgba(109, 40, 217, 0.18)' : 'rgba(200, 255, 0, 0.15)',
    barBorder:     light ? '#6d28d9'                  : '#c8ff00',
    // Entrate chart
    entrateFill:   light ? 'rgba(22, 163, 74, 0.18)'  : 'rgba(0, 212, 255, 0.15)',
    entrateBorder: light ? '#16a34a'                  : '#00d4ff',
    // Query chart
    queryFill:     light ? 'rgba(79, 70, 229, 0.18)'  : 'rgba(124, 109, 250, 0.15)',
    queryBorder:   light ? '#4f46e5'                  : '#7c6dfa',
  };
}

function makeScales(tc) {
  return {
    x: {
      grid: { color: tc.gridColor, drawBorder: false },
      ticks: { color: tc.tickColor },
    },
    y: {
      grid: { color: tc.gridColor, drawBorder: false },
      ticks: { color: tc.tickColor, callback: v => `€${v}` },
      beginAtZero: true,
    },
  };
}

function makeTooltip(tc) {
  return {
    backgroundColor: tc.tooltipBg,
    borderColor: tc.tooltipBorder,
    borderWidth: 1,
    titleColor: tc.tooltipText,
    bodyColor: tc.tooltipText,
  };
}

// ── Grafico a barre — andamento giornaliero ───────────────────────

export function renderBarChart(datiPerGiorno) {
  const ctx = document.getElementById('chart-bar');
  if (!ctx) return;

  const labels = datiPerGiorno.map(d => {
    const parts = d.data.split('-');
    return `${parts[2]}/${parts[1]}`;
  });
  const valori = datiPerGiorno.map(d => d.totale);

  if (chartBar) chartBar.destroy();

  const tc = themeColors();
  const scales = makeScales(tc);
  scales.x.ticks = { ...scales.x.ticks, maxTicksLimit: 10 };

  chartBar = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Spese (€)',
        data: valori,
        backgroundColor: tc.barFill,
        borderColor: tc.barBorder,
        borderWidth: 1.5,
        borderRadius: 4,
        borderSkipped: false,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          ...makeTooltip(tc),
          callbacks: { label: ctx => `€${ctx.parsed.y.toFixed(2)}` },
        },
      },
      scales,
    },
  });
}

// ── Grafico a barre — andamento annuale ───────────────────────────

export function renderAnnualChart(datiPerMese) {
  const ctx = document.getElementById('chart-bar');
  if (!ctx) return;

  const labels = datiPerMese.map(d => d.nome);
  const valori = datiPerMese.map(d => d.totale);

  if (chartBar) chartBar.destroy();

  const tc = themeColors();

  chartBar = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Spese (€)',
        data: valori,
        backgroundColor: tc.barFill,
        borderColor: tc.barBorder,
        borderWidth: 1.5,
        borderRadius: 4,
        borderSkipped: false,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          ...makeTooltip(tc),
          callbacks: { label: ctx => `€${ctx.parsed.y.toFixed(2)}` },
        },
      },
      scales: makeScales(tc),
    },
  });
}

// ── Grafico a barre — entrate annuali ─────────────────────────────

export function renderAnnualEntryChart(datiPerMese) {
  const ctx = document.getElementById('chart-bar-entrate');
  if (!ctx) return;

  const labels = datiPerMese.map(d => d.nome);
  const valori = datiPerMese.map(d => d.totale);

  if (chartBarEntrate) chartBarEntrate.destroy();

  const tc = themeColors();

  chartBarEntrate = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Entrate (€)',
        data: valori,
        backgroundColor: tc.entrateFill,
        borderColor: tc.entrateBorder,
        borderWidth: 1.5,
        borderRadius: 4,
        borderSkipped: false,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          ...makeTooltip(tc),
          callbacks: { label: ctx => `€${ctx.parsed.y.toFixed(2)}` },
        },
      },
      scales: makeScales(tc),
    },
  });
}

// ── Grafico a barre — risultati query ─────────────────────────────

let chartQuery = null;

export function renderQueryChart(spese) {
  const ctx = document.getElementById('chart-query');
  if (!ctx) return;

  // Raggruppa per data
  const perGiorno = {};
  spese.forEach(s => {
    perGiorno[s.data] = (perGiorno[s.data] || 0) + parseFloat(s.importo);
  });
  const dateOrdinate = Object.keys(perGiorno).sort();
  const labels = dateOrdinate.map(d => {
    const parts = d.split('-');
    return `${parts[2]}/${parts[1]}`;
  });
  const valori = dateOrdinate.map(d => round2(perGiorno[d]));

  if (chartQuery) chartQuery.destroy();

  const tc = themeColors();

  chartQuery = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Spese (€)',
        data: valori,
        backgroundColor: tc.queryFill,
        borderColor: tc.queryBorder,
        borderWidth: 1.5,
        borderRadius: 4,
        borderSkipped: false,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          ...makeTooltip(tc),
          callbacks: { label: ctx => `€${ctx.parsed.y.toFixed(2)}` },
        },
      },
      scales: makeScales(tc),
    },
  });
}

function round2(v) { return Math.round(v * 100) / 100; }

// ── Grafico a ciambella — per categoria ───────────────────────────

export function renderDoughnutChart(perCategoria) {
  const ctx = document.getElementById('chart-doughnut');
  if (!ctx) return;

  const labels = perCategoria.map(c => c.nome);
  const valori = perCategoria.map(c => c.totale);
  const colori = perCategoria.map(c => c.colore || '#7c6dfa');

  if (chartDoughnut) chartDoughnut.destroy();

  const tc = themeColors();

  chartDoughnut = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: valori,
        backgroundColor: colori.map(c => c + '99'),
        borderColor: isLight() ? colori.map(c => c) : colori,
        borderWidth: isLight() ? 2.5 : 2,
        hoverOffset: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '68%',
      plugins: {
        legend: {
          position: 'right',
          labels: {
            boxWidth: 10,
            padding: 12,
            font: { size: 11 },
            color: tc.tickColor,
          },
        },
        tooltip: {
          ...makeTooltip(tc),
          callbacks: {
            label: ctx => {
              const tot = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const perc = tot ? ((ctx.parsed / tot) * 100).toFixed(1) : 0;
              return ` €${ctx.parsed.toFixed(2)} (${perc}%)`;
            },
          },
        },
      },
    },
  });
}
