import { db } from './firebase-config.js';
import {
  collection, query, where, orderBy, limit, getDocs, getCountFromServer
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { initAuthGate } from './admin-shared.js';

const CLICK_LABELS = [
  'hero_cta_menu', 'menu_open', 'route_plan',
  'contact_email', 'contact_phone', 'club_link',
  'lang_switch_de', 'lang_switch_en', 'lang_switch_ta'
];

initAuthGate(async () => {
  await loadAnalytics();
});

async function loadAnalytics() {
  const eventsCol = collection(db, 'analytics_events');

  const [totalPageviewsSnap, allPageSnap, recentSnap] = await Promise.all([
    getCountFromServer(query(eventsCol, where('type', '==', 'pageview'))),
    getDocs(query(eventsCol, where('type', '==', 'pageview'))),
    getDocs(query(eventsCol, orderBy('timestamp', 'desc'), limit(50)))
  ]);

  document.getElementById('analytics-total-pageviews').textContent = totalPageviewsSnap.data().count;

  const byPage = {};
  allPageSnap.forEach(docSnap => {
    const page = docSnap.data().page || '(unbekannt)';
    byPage[page] = (byPage[page] || 0) + 1;
  });
  renderCountList('analytics-by-page', byPage);

  const byLabelCounts = {};
  await Promise.all(CLICK_LABELS.map(async (label) => {
    const snap = await getCountFromServer(query(eventsCol, where('type', '==', 'click'), where('label', '==', label)));
    byLabelCounts[label] = snap.data().count;
  }));
  renderCountList('analytics-by-label', byLabelCounts);

  const recentList = document.getElementById('analytics-recent');
  recentList.innerHTML = '';
  recentSnap.forEach(docSnap => {
    const data = docSnap.data();
    const li = document.createElement('li');
    const ts = data.timestamp?.toDate ? data.timestamp.toDate().toLocaleString('de-DE') : '–';
    li.textContent = `${ts} — ${data.type}${data.label ? ' (' + data.label + ')' : ''} — ${data.page}`;
    recentList.appendChild(li);
  });

  const hasData = totalPageviewsSnap.data().count > 0 || recentSnap.size > 0;
  document.getElementById('analytics-empty').hidden = hasData;
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
