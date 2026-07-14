import { db } from './firebase-config.js';
import {
  collection, query, where, orderBy, limit, getDocs
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { initAuthGate, showError } from './admin-shared.js';
import { fetchAnalyticsSummary, renderTileGrid } from './analytics-data.js';

initAuthGate(async () => {
  await loadAnalytics();
});

async function loadAnalytics() {
  try {
    const eventsCol = collection(db, 'analytics_events');

    const [{ totalPageviews, byLabel }, allPageSnap, recentSnap] = await Promise.all([
      fetchAnalyticsSummary(db),
      getDocs(query(eventsCol, where('type', '==', 'pageview'))),
      getDocs(query(eventsCol, orderBy('timestamp', 'desc'), limit(50)))
    ]);

    document.getElementById('analytics-total-pageviews').textContent = totalPageviews;

    const byPage = {};
    allPageSnap.forEach(docSnap => {
      const page = docSnap.data().page || '(unbekannt)';
      byPage[page] = (byPage[page] || 0) + 1;
    });
    renderCountList('analytics-by-page', byPage);

    renderTileGrid(document.getElementById('analytics-by-label'), byLabel);

    const recentList = document.getElementById('analytics-recent');
    recentList.innerHTML = '';
    recentSnap.forEach(docSnap => {
      const data = docSnap.data();
      const li = document.createElement('li');
      const ts = data.timestamp?.toDate ? data.timestamp.toDate().toLocaleString('de-DE') : '–';
      li.textContent = `${ts} — ${data.type}${data.label ? ' (' + data.label + ')' : ''} — ${data.page || '(unbekannt)'}`;
      recentList.appendChild(li);
    });

    const hasData = totalPageviews > 0 || recentSnap.size > 0;
    document.getElementById('analytics-empty').hidden = hasData;
  } catch (err) {
    const errorEl = document.getElementById('analytics-error');
    errorEl.hidden = false;
    showError(errorEl, err.message);
  }
}

function renderCountList(elementId, counts) {
  const el = document.getElementById(elementId);
  el.innerHTML = '';
  Object.entries(counts)
    .filter(([, count]) => count > 0)
    .sort(([, a], [, b]) => b - a)
    .forEach(([key, count]) => {
      const li = document.createElement('li');
      li.textContent = `${key}: ${count}`;
      el.appendChild(li);
    });
}
