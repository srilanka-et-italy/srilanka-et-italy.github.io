import { initAuthGate, showError } from './admin-shared.js';
import { db } from './firebase-config.js';
import { fetchAnalyticsSummary, renderTileGrid } from './analytics-data.js';

initAuthGate(async () => {
  await loadStatsTile();
});

async function loadStatsTile() {
  try {
    const { totalPageviews, byLabel } = await fetchAnalyticsSummary(db);

    document.getElementById('home-stats-pageviews').textContent = totalPageviews;
    renderTileGrid(document.getElementById('home-stats-by-label'), byLabel);

    const hasData = totalPageviews > 0 || Object.values(byLabel).some(count => count > 0);
    document.getElementById('home-stats-empty').hidden = hasData;
  } catch (err) {
    const errorEl = document.getElementById('home-stats-error');
    errorEl.hidden = false;
    showError(errorEl, err.message);
  }
}
