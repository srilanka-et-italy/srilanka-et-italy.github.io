import { db } from './firebase-config.js';
import {
  collection, query, where, orderBy, limit, getDocs, getCountFromServer, Timestamp
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { initAuthGate, showError } from './admin-shared.js';
import { fetchAnalyticsSummary, renderBarRanking } from './analytics-data.js';

const LANG_LABELS = ['lang_switch_de', 'lang_switch_en', 'lang_switch_ta'];

initAuthGate(async () => {
  await loadAnalytics();
});

async function loadAnalytics() {
  try {
    const eventsCol = collection(db, 'analytics_events');
    const now = Timestamp.now();
    const todayStart = Timestamp.fromDate(new Date(new Date().setHours(0, 0, 0, 0)));
    const weekStart = Timestamp.fromMillis(now.toMillis() - 7 * 24 * 3600 * 1000);

    const [
      { totalPageviews, byLabel },
      allPageSnap,
      recentSnap,
      totalClicksSnap,
      todaySnap,
      weekSnap
    ] = await Promise.all([
      fetchAnalyticsSummary(db),
      getDocs(query(eventsCol, where('type', '==', 'pageview'))),
      getDocs(query(eventsCol, orderBy('timestamp', 'desc'), limit(50))),
      getCountFromServer(query(eventsCol, where('type', '==', 'click'))),
      getCountFromServer(query(eventsCol, where('type', '==', 'pageview'), where('timestamp', '>=', todayStart))),
      getCountFromServer(query(eventsCol, where('type', '==', 'pageview'), where('timestamp', '>=', weekStart)))
    ]);

    const totalClicks = totalClicksSnap.data().count;

    document.getElementById('analytics-total-pageviews').textContent = totalPageviews;
    document.getElementById('analytics-total-clicks').textContent = totalClicks;
    document.getElementById('analytics-click-rate').textContent =
      totalPageviews > 0 ? `${Math.round((totalClicks / totalPageviews) * 100)}%` : '–';

    const topLabelEntry = Object.entries(byLabel).sort(([, a], [, b]) => b - a)[0];
    document.getElementById('analytics-top-label').textContent =
      topLabelEntry && topLabelEntry[1] > 0 ? topLabelEntry[0] : '–';

    document.getElementById('analytics-today').textContent = todaySnap.data().count;
    document.getElementById('analytics-week').textContent = weekSnap.data().count;

    const byPage = {};
    allPageSnap.forEach(docSnap => {
      const page = docSnap.data().page || '(unbekannt)';
      byPage[page] = (byPage[page] || 0) + 1;
    });
    renderCountList('analytics-by-page', byPage);

    renderBarRanking(document.getElementById('analytics-by-label'), byLabel);

    const langCounts = {};
    LANG_LABELS.forEach(label => { langCounts[label] = byLabel[label] || 0; });
    renderBarRanking(document.getElementById('analytics-lang-breakdown'), langCounts);

    const recentList = document.getElementById('analytics-recent');
    recentList.innerHTML = '';
    recentSnap.forEach(docSnap => {
      const data = docSnap.data();
      const li = document.createElement('li');
      const ts = data.timestamp?.toDate ? data.timestamp.toDate().toLocaleString('de-DE') : '–';
      li.textContent = `${ts} — ${data.type}${data.label ? ' (' + data.label + ')' : ''} — ${data.page || '(unbekannt)'}`;
      recentList.appendChild(li);
    });

    const lastActivityTs = recentSnap.docs[0]?.data().timestamp;
    document.getElementById('analytics-last-activity').textContent = lastActivityTs?.toDate
      ? lastActivityTs.toDate().toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
      : '–';

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
