import {
  collection, query, where, getCountFromServer
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

export const CLICK_LABELS = [
  'hero_cta_menu', 'menu_open', 'route_plan',
  'contact_email', 'contact_phone', 'club_link',
  'lang_switch_de', 'lang_switch_en', 'lang_switch_ta'
];

export async function fetchAnalyticsSummary(db) {
  const eventsCol = collection(db, 'analytics_events');
  const [totalSnap, ...labelSnaps] = await Promise.all([
    getCountFromServer(query(eventsCol, where('type', '==', 'pageview'))),
    ...CLICK_LABELS.map(label =>
      getCountFromServer(query(eventsCol, where('type', '==', 'click'), where('label', '==', label)))
    )
  ]);

  const byLabel = {};
  CLICK_LABELS.forEach((label, i) => { byLabel[label] = labelSnaps[i].data().count; });

  return { totalPageviews: totalSnap.data().count, byLabel };
}

export function renderTileGrid(el, counts) {
  el.innerHTML = '';
  Object.entries(counts)
    .filter(([, count]) => count > 0)
    .sort(([, a], [, b]) => b - a)
    .forEach(([key, count]) => {
      const tile = document.createElement('div');
      tile.className = 'analytics-tile';
      const value = document.createElement('span');
      value.className = 'analytics-tile-value';
      value.textContent = count;
      const label = document.createElement('span');
      label.className = 'analytics-tile-label';
      label.textContent = key;
      tile.appendChild(value);
      tile.appendChild(label);
      el.appendChild(tile);
    });
}
