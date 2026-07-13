import { db } from './firebase-config.js';
import { login, logout, onAdminAuthStateChanged } from './auth.js';
import { I18n } from './i18n.js';
import {
  collection, addDoc, serverTimestamp, Timestamp
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// ── i18n ────────────────────────────────────────────────────────────────────

export const i18n = new I18n();
await i18n.init();

export function t(key) {
  return i18n.getValueByPath(i18n.translations, key) || key;
}

function applyPlaceholders() {
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const val = t(el.getAttribute('data-i18n-placeholder'));
    if (val) el.placeholder = val;
  });
}

function setupLangButtons() {
  document.querySelectorAll('.admin-lang-btn[data-lang]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await i18n.setLanguage(btn.getAttribute('data-lang'));
      document.querySelectorAll('.admin-lang-btn[data-lang]').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-lang') === i18n.lang);
      });
      i18n.updateDOM();
      applyPlaceholders();
    });
  });
}

setupLangButtons();
i18n.updateDOM();
applyPlaceholders();

// ── Auth gate ────────────────────────────────────────────────────────────────

// Wires the login form, logout button, and password-visibility toggle that
// every admin page's login screen has (identical markup on all three pages).
// Calls onAuthed() once a user is confirmed and the #admin-panel element is
// shown — each page passes its own page-specific initialization as onAuthed.
export function initAuthGate(onAuthed) {
  const loginScreen = document.getElementById('login-screen');
  const adminPanel  = document.getElementById('admin-panel');
  const loginForm   = document.getElementById('login-form');
  const loginError  = document.getElementById('login-error');
  const logoutBtn   = document.getElementById('logout-btn');

  onAdminAuthStateChanged(async (user) => {
    if (user) {
      loginScreen.hidden = true;
      adminPanel.hidden  = false;
      await onAuthed?.();
    } else {
      loginScreen.hidden = false;
      adminPanel.hidden  = true;
    }
  });

  document.getElementById('toggle-password').addEventListener('click', () => {
    const pw  = document.getElementById('password');
    const btn = document.getElementById('toggle-password');
    if (pw.type === 'password') { pw.type = 'text'; btn.textContent = '🙈'; }
    else { pw.type = 'password'; btn.textContent = '👁'; }
  });

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.hidden = true;
    const email    = DOMPurify.sanitize(document.getElementById('email').value.trim());
    const password = document.getElementById('password').value;
    try {
      await login(email, password);
    } catch (err) {
      loginError.textContent = err.code === 'auth/invalid-credential' || err.message === 'not-admin'
        ? t('admin.login_error_invalid')
        : 'Fehler: ' + err.message;
      loginError.hidden = false;
    }
  });

  logoutBtn.addEventListener('click', () => logout());
}

// ── Small helpers ─────────────────────────────────────────────────────────────

export function showError(el, msg) {
  el.textContent = msg;
  el.hidden = false;
}

export function localBerlinToTimestamp(localDatetimeStr) {
  const dt = luxon.DateTime.fromISO(localDatetimeStr, { zone: 'Europe/Berlin' });
  return Timestamp.fromMillis(dt.toMillis());
}

export async function writeAuditLog(action, docId, fileName) {
  try {
    const { auth: fbAuth } = await import('./firebase-config.js');
    await addDoc(collection(db, 'audit_logs'), {
      action,
      docId,
      fileName,
      userId: fbAuth.currentUser?.uid || 'unknown',
      timestamp: serverTimestamp()
    });
  } catch { /* audit log failure is non-fatal */ }
}

// ── Date range picker (shared by upload forms and the edit panel) ────────────

export function createDateRangePicker({
  triggerId, pickerId, displayId, gridId, monthLabelId, hintId, clearBtnId,
  prevBtnId, nextBtnId, startInputId, endInputId
}) {
  const trigger  = document.getElementById(triggerId);
  const picker   = document.getElementById(pickerId);
  const display  = document.getElementById(displayId);
  const grid     = document.getElementById(gridId);
  const label    = document.getElementById(monthLabelId);
  const hint     = document.getElementById(hintId);
  const clearBtn = document.getElementById(clearBtnId);
  const startInput = document.getElementById(startInputId);
  const endInput   = document.getElementById(endInputId);
  if (!trigger) return { syncDates() {} };

  const MONTHS = ['Januar','Februar','März','April','Mai','Juni',
                  'Juli','August','September','Oktober','November','Dezember'];
  let viewYear  = new Date().getFullYear();
  let viewMonth = new Date().getMonth();
  let startDate = null;
  let endDate   = null;

  function fmt(d) {
    return d.toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric' });
  }

  function isoDate(d, endOfDay = false) {
    const pad = n => String(n).padStart(2,'0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${endOfDay ? '23:59' : '00:00'}`;
  }

  function sameDay(a, b) {
    return a && b && a.toDateString() === b.toDateString();
  }

  function updateDisplay() {
    if (startDate && endDate) {
      display.textContent = `${fmt(startDate)} – ${fmt(endDate)}`;
      display.className = 'daterange-value';
    } else if (startDate) {
      display.textContent = `${fmt(startDate)} – ?`;
      display.className = 'daterange-value';
    } else {
      display.textContent = t('admin.date_range_placeholder') || 'Zeitraum wählen';
      display.className = 'daterange-placeholder';
    }
    startInput.value = startDate ? isoDate(startDate, false) : '';
    endInput.value   = endDate   ? isoDate(endDate, true)    : '';
  }

  function renderGrid() {
    label.textContent = `${MONTHS[viewMonth]} ${viewYear}`;
    grid.innerHTML = '';
    const today = new Date(); today.setHours(0,0,0,0);
    const firstDay = new Date(viewYear, viewMonth, 1);
    let offset = (firstDay.getDay() + 6) % 7;
    const daysInMonth  = new Date(viewYear, viewMonth+1, 0).getDate();
    const daysInPrev   = new Date(viewYear, viewMonth, 0).getDate();

    for (let i = offset - 1; i >= 0; i--) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cal-day cal-day--other-month';
      btn.textContent = daysInPrev - i;
      grid.appendChild(btn);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(viewYear, viewMonth, d);
      const btn  = document.createElement('button');
      btn.type = 'button';
      btn.textContent = d;
      let cls = 'cal-day';
      if (date < today) cls += ' cal-day--disabled';
      if (sameDay(date, today)) cls += ' cal-day--today';
      if (sameDay(date, startDate) || sameDay(date, endDate)) cls += ' cal-day--selected';
      if (startDate && endDate && date > startDate && date < endDate) cls += ' cal-day--in-range';
      if (sameDay(date, startDate) && endDate && startDate < endDate) cls += ' cal-day--in-range cal-day--range-start';
      if (sameDay(date, endDate)   && startDate && startDate < endDate) cls += ' cal-day--in-range cal-day--range-end';
      btn.className = cls;
      if (!cls.includes('disabled')) {
        btn.addEventListener('click', (e) => { e.stopPropagation(); pickDay(date); });
      }
      grid.appendChild(btn);
    }

    const total = offset + daysInMonth;
    const remaining = total % 7 === 0 ? 0 : 7 - (total % 7);
    for (let i = 1; i <= remaining; i++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cal-day cal-day--other-month';
      btn.textContent = i;
      grid.appendChild(btn);
    }

    hint.textContent = startDate && !endDate
      ? (t('admin.date_pick_end') || 'Enddatum wählen')
      : (t('admin.date_pick_start') || 'Startdatum wählen');
  }

  function pickDay(date) {
    if (!startDate || (startDate && endDate)) {
      startDate = date; endDate = null;
    } else if (date < startDate) {
      endDate = startDate; startDate = date;
    } else {
      endDate = date;
      setTimeout(() => { picker.hidden = true; trigger.classList.remove('open'); }, 200);
    }
    updateDisplay();
    renderGrid();
  }

  document.getElementById(prevBtnId).addEventListener('click', () => {
    viewMonth--; if (viewMonth < 0) { viewMonth = 11; viewYear--; } renderGrid();
  });
  document.getElementById(nextBtnId).addEventListener('click', () => {
    viewMonth++; if (viewMonth > 11) { viewMonth = 0; viewYear++; } renderGrid();
  });
  clearBtn.addEventListener('click', () => {
    startDate = null; endDate = null; updateDisplay(); renderGrid();
  });

  trigger.addEventListener('click', () => {
    const open = picker.hidden;
    picker.hidden = !open;
    trigger.classList.toggle('open', open);
    if (open) renderGrid();
  });

  document.addEventListener('click', (e) => {
    if (!trigger.contains(e.target) && !picker.contains(e.target)) {
      picker.hidden = true;
      trigger.classList.remove('open');
    }
  });

  updateDisplay();

  return {
    syncDates(startVal, endVal) {
      startDate = startVal ? new Date(startVal) : null;
      endDate   = startVal && endVal ? new Date(endVal) : null;
      if (startDate) { viewYear = startDate.getFullYear(); viewMonth = startDate.getMonth(); }
      updateDisplay();
    }
  };
}

// ── PDF preview / thumbnail rendering ─────────────────────────────────────────

export async function renderLargePreview(container, url, isImage) {
  container.innerHTML = '';
  if (isImage) {
    const img = document.createElement('img');
    img.src = url;
    container.appendChild(img);
    return;
  }
  const canvas = document.createElement('canvas');
  container.appendChild(canvas);
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const pdf  = await pdfjsLib.getDocument({ url }).promise;
    const page = await pdf.getPage(1);
    const scale = Math.min(window.innerWidth * .8, 680) / page.getViewport({ scale: 1 }).width;
    const vp = page.getViewport({ scale });
    canvas.width  = vp.width;
    canvas.height = vp.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
  } catch {
    container.innerHTML = `<p style="color:var(--muted,#7A6E64)">Vorschau nicht verfügbar</p>`;
  }
}

export async function renderPdfThumb(url, canvas, targetWidth = 220) {
  if (!canvas || typeof pdfjsLib === 'undefined') return;
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const pdf  = await pdfjsLib.getDocument({ url }).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 1 });
    const scale = targetWidth / viewport.width;
    const vp = page.getViewport({ scale });
    canvas.width  = vp.width;
    canvas.height = vp.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
  } catch { /* show nothing on error */ }
}
