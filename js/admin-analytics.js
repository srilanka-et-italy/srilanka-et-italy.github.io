import { db } from './firebase-config.js';
import {
  collection, query, where, orderBy, limit, getDocs, getCountFromServer, Timestamp
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { initAuthGate, showError, i18n, t } from './admin-shared.js';
import { fetchAnalyticsSummary, renderBarRanking, translateLabel } from './analytics-data.js';

const LANG_LABELS = ['lang_switch_de', 'lang_switch_en', 'lang_switch_ta'];
const CONTACT_LABELS = ['contact_email', 'contact_phone', 'route_plan'];
const WEEKDAY_MS = 24 * 3600 * 1000;

initAuthGate(async () => {
  await loadAnalytics();
});

async function loadAnalytics() {
  try {
    const eventsCol = collection(db, 'analytics_events');
    const now = Timestamp.now();
    const todayStart = Timestamp.fromDate(new Date(new Date().setHours(0, 0, 0, 0)));
    const yesterdayStart = Timestamp.fromMillis(todayStart.toMillis() - WEEKDAY_MS);
    const weekStart = Timestamp.fromMillis(now.toMillis() - 7 * WEEKDAY_MS);
    const prevWeekStart = Timestamp.fromMillis(weekStart.toMillis() - 7 * WEEKDAY_MS);

    const [
      { totalPageviews, byLabel },
      allPageSnap,
      recentSnap,
      totalClicksSnap,
      todaySnap,
      yesterdaySnap,
      weekSnap,
      prevWeekSnap
    ] = await Promise.all([
      fetchAnalyticsSummary(db),
      getDocs(query(eventsCol, where('type', '==', 'pageview'))),
      getDocs(query(eventsCol, orderBy('timestamp', 'desc'), limit(50))),
      getCountFromServer(query(eventsCol, where('type', '==', 'click'))),
      getCountFromServer(query(eventsCol, where('type', '==', 'pageview'), where('timestamp', '>=', todayStart))),
      getCountFromServer(query(eventsCol, where('type', '==', 'pageview'), where('timestamp', '>=', yesterdayStart), where('timestamp', '<', todayStart))),
      getCountFromServer(query(eventsCol, where('type', '==', 'pageview'), where('timestamp', '>=', weekStart))),
      getCountFromServer(query(eventsCol, where('type', '==', 'pageview'), where('timestamp', '>=', prevWeekStart), where('timestamp', '<', weekStart)))
    ]);

    const totalClicks = totalClicksSnap.data().count;
    const todayCount = todaySnap.data().count;
    const weekCount = weekSnap.data().count;

    document.getElementById('analytics-total-pageviews').textContent = totalPageviews;
    document.getElementById('analytics-total-clicks').textContent = totalClicks;
    document.getElementById('analytics-click-rate').textContent =
      totalPageviews > 0 ? `${Math.round((totalClicks / totalPageviews) * 100)}%` : '–';

    const topLabelEntry = Object.entries(byLabel).sort(([, a], [, b]) => b - a)[0];
    document.getElementById('analytics-top-label').textContent =
      topLabelEntry && topLabelEntry[1] > 0 ? translateLabel(topLabelEntry[0]) : '–';

    document.getElementById('analytics-today').textContent = todayCount;
    renderTrend(document.getElementById('analytics-today-trend'), todayCount, yesterdaySnap.data().count);
    document.getElementById('analytics-week').textContent = weekCount;
    renderTrend(document.getElementById('analytics-week-trend'), weekCount, prevWeekSnap.data().count);

    const contactClicks = CONTACT_LABELS.reduce((sum, label) => sum + (byLabel[label] || 0), 0);
    document.getElementById('analytics-conversion-rate').textContent =
      totalPageviews > 0 ? `${Math.round((contactClicks / totalPageviews) * 100)}%` : '–';

    document.getElementById('analytics-flyer-clicks').textContent = byLabel.flyer_open || 0;

    const byPage = {};
    const hourCounts = new Array(24).fill(0);
    const weekdayCounts = new Array(7).fill(0);
    allPageSnap.forEach(docSnap => {
      const data = docSnap.data();
      const page = data.page || '(unbekannt)';
      byPage[page] = (byPage[page] || 0) + 1;
      if (data.timestamp?.toDate) {
        const d = data.timestamp.toDate();
        hourCounts[d.getHours()]++;
        weekdayCounts[d.getDay()]++;
      }
    });
    renderCountList('analytics-by-page', byPage);

    document.getElementById('analytics-busiest-hour').textContent = formatBusiestHour(hourCounts);
    document.getElementById('analytics-busiest-weekday').textContent = formatBusiestWeekday(weekdayCounts);

    renderBarRanking(document.getElementById('analytics-by-label'), byLabel);

    const langCounts = {};
    LANG_LABELS.forEach(label => { langCounts[label] = byLabel[label] || 0; });
    renderBarRanking(document.getElementById('analytics-lang-breakdown'), langCounts);

    renderRecentEvents(recentSnap, todayStart, yesterdayStart);

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

function renderTrend(el, current, previous) {
  el.classList.remove('analytics-tile-trend--down');
  if (previous === 0) {
    el.textContent = current > 0 ? t('admin.analytics_trend_new') : '';
    return;
  }
  const pct = Math.round(((current - previous) / previous) * 100);
  el.textContent = `${pct > 0 ? '+' : ''}${pct}%`;
  if (pct < 0) el.classList.add('analytics-tile-trend--down');
}

function formatBusiestHour(hourCounts) {
  const max = Math.max(...hourCounts);
  if (max === 0) return '–';
  const hour = hourCounts.indexOf(max);
  return `${String(hour).padStart(2, '0')}:00–${String((hour + 1) % 24).padStart(2, '0')}:00`;
}

function formatBusiestWeekday(weekdayCounts) {
  const max = Math.max(...weekdayCounts);
  if (max === 0) return '–';
  const day = weekdayCounts.indexOf(max);
  const reference = new Date(2026, 0, 4 + day); // a known Sunday-indexed week
  return reference.toLocaleDateString(i18n.lang, { weekday: 'long' });
}

const EVENT_ICONS = {
  pageview: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"/><circle cx="12" cy="12" r="3"/></svg>',
  click: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11V4a1.5 1.5 0 0 1 3 0v6M12 10V2.5a1.5 1.5 0 0 1 3 0V10M15 10V4.5a1.5 1.5 0 0 1 3 0V12M18 11.5a1.5 1.5 0 0 1 3 0V15c0 4-2.5 8-7.5 8h-2C7.5 23 6 20 4.5 18l-2-3.5c-.5-1 0-2.3 1.5-2.3.8 0 1.3.4 1.8 1l1.2 1.8"/></svg>'
};

function renderRecentEvents(recentSnap, todayStart, yesterdayStart) {
  const container = document.getElementById('analytics-recent');
  container.innerHTML = '';

  const groups = [
    { key: 'today', labelKey: 'admin.analytics_group_today', docs: [] },
    { key: 'yesterday', labelKey: 'admin.analytics_group_yesterday', docs: [] },
    { key: 'older', labelKey: 'admin.analytics_group_older', docs: [] }
  ];

  recentSnap.forEach(docSnap => {
    const data = docSnap.data();
    const ts = data.timestamp?.toMillis ? data.timestamp.toMillis() : 0;
    if (ts >= todayStart.toMillis()) groups[0].docs.push(data);
    else if (ts >= yesterdayStart.toMillis()) groups[1].docs.push(data);
    else groups[2].docs.push(data);
  });

  groups.filter(g => g.docs.length > 0).forEach(group => {
    const groupEl = document.createElement('div');
    groupEl.className = 'analytics-event-group';

    const header = document.createElement('div');
    header.className = 'analytics-event-group-header';
    header.textContent = t(group.labelKey);
    groupEl.appendChild(header);

    group.docs.forEach(data => {
      const row = document.createElement('div');
      row.className = 'analytics-event-row';

      const icon = document.createElement('span');
      icon.className = `analytics-event-icon analytics-event-icon--${data.type}`;
      icon.innerHTML = EVENT_ICONS[data.type] || EVENT_ICONS.pageview;

      const main = document.createElement('div');
      main.className = 'analytics-event-main';
      const typeEl = document.createElement('span');
      typeEl.className = 'analytics-event-type';
      typeEl.textContent = t(data.type === 'click' ? 'admin.analytics_event_click' : 'admin.analytics_event_pageview');
      main.appendChild(typeEl);
      const detailEl = document.createElement('span');
      detailEl.className = 'analytics-event-detail';
      detailEl.textContent = data.label ? `${translateLabel(data.label)} · ${data.page || '(unbekannt)'}` : (data.page || '(unbekannt)');
      main.appendChild(detailEl);

      const timeEl = document.createElement('span');
      timeEl.className = 'analytics-event-time';
      timeEl.textContent = data.timestamp?.toDate ? formatRelativeTime(data.timestamp.toDate()) : '–';

      row.appendChild(icon);
      row.appendChild(main);
      row.appendChild(timeEl);
      groupEl.appendChild(row);
    });

    container.appendChild(groupEl);
  });
}

function formatRelativeTime(date) {
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.round(diffMs / 60000);
  const rtf = new Intl.RelativeTimeFormat(i18n.lang, { numeric: 'auto', style: 'short' });

  if (diffMin < 1) return rtf.format(0, 'minute');
  if (diffMin < 60) return rtf.format(-diffMin, 'minute');
  const diffHour = Math.round(diffMin / 60);
  if (diffHour < 24) return rtf.format(-diffHour, 'hour');
  const diffDay = Math.round(diffHour / 24);
  return rtf.format(-diffDay, 'day');
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
