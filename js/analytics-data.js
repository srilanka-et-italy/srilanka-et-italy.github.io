import {
  collection, query, where, getCountFromServer
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { t } from './admin-shared.js';

export const CLICK_LABELS = [
  'hero_cta_menu', 'menu_open', 'route_plan',
  'contact_email', 'contact_phone', 'club_link',
  'lang_switch_de', 'lang_switch_en', 'lang_switch_ta',
  'flyer_open'
];

// data-track values are internal tracking identifiers, not display text —
// translate known ones for the admin UI, falling back to the raw key for
// any future label that hasn't been given a translation yet.
export function translateLabel(key) {
  const i18nKey = `admin.analytics_label_${key}`;
  const translated = t(i18nKey);
  return translated === i18nKey ? key : translated;
}

// Tracked "page" values are raw pathnames (window.location.pathname) —
// translate the ones with a friendly name, fall back to the raw path for
// anything else (e.g. a future subpage that hasn't been given a label).
export function translatePage(path) {
  if (path === '/') return t('admin.analytics_page_home');
  return path;
}

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

// Renders a sorted, proportional-width bar ranking — each bar's length is
// relative to the largest count in the set, so the busiest item reads at
// a glance without needing a full charting library for a handful of rows.
export function renderBarRanking(el, counts) {
  el.innerHTML = '';
  const entries = Object.entries(counts)
    .filter(([, count]) => count > 0)
    .sort(([, a], [, b]) => b - a);

  const max = entries.length ? entries[0][1] : 0;

  entries.forEach(([key, count]) => {
    const row = document.createElement('div');
    row.className = 'analytics-bar-row';

    const label = document.createElement('span');
    label.className = 'analytics-bar-label';
    label.textContent = translateLabel(key);

    const track = document.createElement('div');
    track.className = 'analytics-bar-track';
    const fill = document.createElement('div');
    fill.className = 'analytics-bar-fill';
    fill.style.width = max > 0 ? `${Math.max((count / max) * 100, 4)}%` : '0%';
    track.appendChild(fill);

    const value = document.createElement('span');
    value.className = 'analytics-bar-count';
    value.textContent = count;

    row.appendChild(label);
    row.appendChild(track);
    row.appendChild(value);
    el.appendChild(row);
  });
}
