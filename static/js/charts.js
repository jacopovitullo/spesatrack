/**
 * charts.js — Gestione grafici Chart.js per SpesaTrack.
 */

let chartBar = null;
let chartDoughnut = null;

const CHART_DEFAULTS = {
  font: { family: "'DM Mono', monospace", size: 12 },
  color: '#7a7a9a',
};

Chart.defaults.font.family = CHART_DEFAULTS.font.family;
Chart.defaults.color = CHART_DEFAULTS.color;

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

  chartBar = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Spese (€)',
        data: valori,
        backgroundColor: 'rgba(200, 255, 0, 0.15)',
        borderColor: '#c8ff00',
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
          backgroundColor: '#1c1c26',
          borderColor: '#2a2a38',
          borderWidth: 1,
          callbacks: {
            label: ctx => `€${ctx.parsed.y.toFixed(2)}`,
          },
        },
      },
      scales: {
        x: {
          grid: { color: 'rgba(42,42,56,0.5)', drawBorder: false },
          ticks: { maxTicksLimit: 10 },
        },
        y: {
          grid: { color: 'rgba(42,42,56,0.5)', drawBorder: false },
          ticks: { callback: v => `€${v}` },
          beginAtZero: true,
        },
      },
    },
  });
}

// ── Grafico a ciambella — per categoria ───────────────────────────

export function renderDoughnutChart(perCategoria) {
  const ctx = document.getElementById('chart-doughnut');
  if (!ctx) return;

  const labels = perCategoria.map(c => c.nome);
  const valori = perCategoria.map(c => c.totale);
  const colori = perCategoria.map(c => c.colore || '#7c6dfa');

  if (chartDoughnut) chartDoughnut.destroy();

  chartDoughnut = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: valori,
        backgroundColor: colori.map(c => c + '99'),
        borderColor: colori,
        borderWidth: 2,
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
          },
        },
        tooltip: {
          backgroundColor: '#1c1c26',
          borderColor: '#2a2a38',
          borderWidth: 1,
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
