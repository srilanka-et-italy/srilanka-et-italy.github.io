# Admin Panel Launcher + Separate Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the admin panel into three real, separately-navigable HTML pages: `admin.html` (an icon-tile launcher), `admin-main-menu.html` (dedicated main-menu-card page), and `admin-seasonal-pdfs.html` (dedicated seasonal-PDFs page with upload form, tile grid, and the existing fullscreen edit panel — now seasonal-only).

**Architecture:** A new `js/admin-shared.js` module holds everything genuinely common to all three pages (i18n, the login/auth gate, small helpers, the date-range-picker factory, the PDF preview/thumbnail renderers). Each page gets its own thin JS module that imports from the shared one and owns only that page's DOM/data logic. `admin.html`'s old fetch-and-inject mechanism (`components/admin-panel.html`) and its combined `js/admin.js` are retired once the three new pages are built and verified working, so the live site is never left in a broken intermediate state — new files are added first, the old page is only cut over in the final task.

**Tech Stack:** Same as the rest of the admin panel — vanilla JS ES modules, Firebase Firestore/Storage SDK, pdf.js for previews, no test framework (frontend, matches the rest of this codebase — verification is manual).

## Global Constraints

- No Firestore/Storage schema or security-rules changes — this is a frontend-only restructuring.
- No new client-side router — plain `<a href="...">` navigation, real page loads.
- Reuse existing i18n keys wherever possible; the only new key needed is `admin.launcher_category` (DE/EN/TA) for the launcher's category heading.
- The main-menu page's "click launcher tile → straight to the edit view" behavior (no intermediate list page) and the seasonal page's "click launcher tile → grid page, then click a tile → overlay panel" behavior are both explicit, confirmed requirements — do not conflate the two pages' navigation depth.
- Every page must independently enforce the Firebase Auth login gate (each page has its own copy of the login-screen markup and calls the shared `initAuthGate()`).

---

### Task 1: Shared module — `js/admin-shared.js`

**Files:**
- Create: `js/admin-shared.js`

**Interfaces:**
- Produces (all named exports): `i18n` (the `I18n` instance), `t(key)`, `initAuthGate(onAuthed)`, `showError(el, msg)`, `localBerlinToTimestamp(str)`, `createDateRangePicker(ids)` (same shape as the current one: returns `{ syncDates(startVal, endVal) }`), `writeAuditLog(action, docId, fileName)`, `renderLargePreview(container, url, isImage)`, `renderPdfThumb(url, canvas, targetWidth = 220)`.
- Consumes: nothing from other tasks — this is pure extraction from the current `js/admin.js` (still present and unmodified after this task; nothing references this new file yet).

This task does not touch any existing file and cannot break the live site — it only adds a new, currently-unused module.

- [ ] **Step 1: Create `js/admin-shared.js`**

```js
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
```

- [ ] **Step 2: Verify syntax**

Run: `cd "/Users/tujiiprince/develop/Business/i2bit/srilanka_et_italy/srilanka-et-italy.github.io" && node -c js/admin-shared.js`
Expected: no output (exit 0) — note this only checks JS syntax validity, not the `import`/DOM-global usage, which can't be checked outside a browser.

- [ ] **Step 3: Commit**

```bash
cd "/Users/tujiiprince/develop/Business/i2bit/srilanka_et_italy/srilanka-et-italy.github.io"
git add js/admin-shared.js
git commit -m "$(cat <<'EOF'
Add js/admin-shared.js: common auth gate, i18n, and helpers

Pure extraction from js/admin.js — nothing references this file yet,
so the live admin panel is unaffected. Later tasks build three
separate pages on top of it and only then retire js/admin.js.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `admin-main-menu.html` + `js/admin-main-menu.js`

**Files:**
- Create: `admin-main-menu.html`
- Create: `js/admin-main-menu.js`

**Interfaces:**
- Consumes: `i18n`, `t`, `initAuthGate`, `showError`, `writeAuditLog`, `renderLargePreview` from `js/admin-shared.js` (Task 1).
- Produces: nothing consumed by later tasks — this page is self-contained. `admin.html`'s launcher (Task 5) will link to it by filename only.

This task creates a new page reachable only by typing its URL directly (nothing links to it yet) — it cannot break the live site.

- [ ] **Step 1: Create `admin-main-menu.html`**

```html
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Hauptspeisekarte — Admin — Sri Lanka ET Italy</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=Outfit:wght@300;400;500;600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="css/main.css">
  <link rel="stylesheet" href="css/admin.css">
  <link rel="icon" type="image/x-icon" href="assets/favicon.ico">
  <meta name="robots" content="noindex, nofollow">
</head>
<body>

  <!-- Login Screen -->
  <div id="login-screen" class="admin-login-screen">
    <div class="admin-login-card">
      <p class="admin-login-eyebrow">Sri Lanka ET Italy</p>
      <h1 class="admin-login-title" data-i18n="admin.login_title">Admin Login</h1>

      <div class="admin-lang-switch">
        <button class="admin-lang-btn active" data-lang="de">DE</button>
        <button class="admin-lang-btn" data-lang="en">EN</button>
        <button class="admin-lang-btn" data-lang="ta">TA</button>
      </div>

      <form id="login-form" novalidate>
        <div class="admin-field">
          <label for="email" data-i18n="admin.email_label">E-Mail</label>
          <input type="email" id="email" autocomplete="email" required>
        </div>
        <div class="admin-field">
          <label for="password" data-i18n="admin.password_label">Passwort</label>
          <div class="admin-password-wrap">
            <input type="password" id="password" autocomplete="current-password" required>
            <button type="button" id="toggle-password" class="admin-pw-toggle" aria-label="Passwort anzeigen">👁</button>
          </div>
        </div>
        <p id="login-error" class="admin-error" hidden></p>
        <button type="submit" class="btn-dark admin-submit" data-i18n="admin.login_btn">Anmelden</button>
      </form>
    </div>
  </div>

  <!-- Admin Panel (hidden until authenticated) -->
  <div id="admin-panel" class="admin-panel" hidden>
    <header class="admin-header">
      <div class="admin-header-brand">
        <a href="admin.html" class="tile-panel-back" aria-label="Zurück">←</a>
        <span class="admin-header-logo">Sri Lanka <em>ET</em> Italy</span>
        <span class="admin-header-badge" data-i18n="admin.header_badge">Admin</span>
      </div>
      <div class="admin-header-right">
        <div class="admin-header-langs">
          <button class="admin-lang-btn active" data-lang="de">DE</button>
          <button class="admin-lang-btn" data-lang="en">EN</button>
          <button class="admin-lang-btn" data-lang="ta">TA</button>
        </div>
        <button id="logout-btn" class="btn-outline" data-i18n="admin.logout_btn">Abmelden</button>
      </div>
    </header>
    <main class="admin-main">
      <div class="admin-panel-langs">
        <button class="admin-lang-btn active" data-lang="de">DE</button>
        <button class="admin-lang-btn" data-lang="en">EN</button>
        <button class="admin-lang-btn" data-lang="ta">TA</button>
      </div>

      <div class="admin-section">
        <div class="admin-section-header">
          <h2 class="admin-section-title" data-i18n="admin.main_menu_title">Hauptspeisekarte</h2>
        </div>

        <div class="tile-panel-preview" id="main-menu-preview"></div>
        <p id="main-menu-updated" class="pdf-tile-dates" style="margin-bottom:1.25rem"></p>

        <div class="admin-field">
          <label for="main-menu-file" data-i18n="admin.main_menu_file_label">Neue Datei (max. 2 MB)</label>
          <input type="file" id="main-menu-file" accept="application/pdf,image/png,image/jpeg">
        </div>
        <div id="main-menu-progress-wrap" class="upload-progress-wrap" hidden>
          <div class="upload-progress-bar"><div id="main-menu-progress-fill" class="upload-progress-fill"></div></div>
          <span id="main-menu-progress-text" class="upload-progress-label">0 %</span>
        </div>
        <p id="main-menu-error" class="admin-error" hidden></p>
        <p id="main-menu-success" class="admin-success" hidden data-i18n="admin.main_menu_success">Hauptspeisekarte aktualisiert.</p>
        <button id="main-menu-save-btn" type="button" class="btn-dark" data-i18n="admin.main_menu_replace_btn">Ersetzen</button>
      </div>
    </main>
  </div>

  <script src="https://cdnjs.cloudflare.com/ajax/libs/luxon/3.4.4/luxon.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.1.6/purify.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
  <script type="module" src="js/admin-main-menu.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create `js/admin-main-menu.js`**

```js
import { db, storage } from './firebase-config.js';
import {
  doc, getDoc, setDoc, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import {
  ref, uploadBytesResumable, getDownloadURL, deleteObject
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js';
import { t, initAuthGate, showError, writeAuditLog, renderLargePreview } from './admin-shared.js';

let currentData = null;

initAuthGate(async () => {
  await refreshMainMenuPage();
  document.getElementById('main-menu-save-btn').addEventListener('click', () => replaceMainMenuFile());
});

async function refreshMainMenuPage() {
  const preview   = document.getElementById('main-menu-preview');
  const updatedEl = document.getElementById('main-menu-updated');

  try {
    const docSnap = await getDoc(doc(db, 'main_menu', 'current'));
    currentData = docSnap.exists() ? docSnap.data() : null;
  } catch (err) {
    console.warn('Could not load main menu card:', err.message);
    currentData = null;
  }

  if (!currentData || !currentData.pdfUrl) {
    preview.innerHTML = `<p style="color:var(--muted,#7A6E64)">${t('admin.main_menu_empty')}</p>`;
    updatedEl.textContent = '';
    return;
  }

  const isImage = currentData.contentType && currentData.contentType.startsWith('image/');
  await renderLargePreview(preview, currentData.pdfUrl, isImage);
  const updatedStr = currentData.updatedAt?.toDate
    ? currentData.updatedAt.toDate().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })
    : '';
  updatedEl.textContent = `${t('admin.main_menu_updated_label')}: ${updatedStr}`;
}

async function replaceMainMenuFile() {
  const errorEl      = document.getElementById('main-menu-error');
  const successEl    = document.getElementById('main-menu-success');
  const progressWrap = document.getElementById('main-menu-progress-wrap');
  const progressFill = document.getElementById('main-menu-progress-fill');
  const progressText = document.getElementById('main-menu-progress-text');
  errorEl.hidden   = true;
  successEl.hidden = true;

  const file = document.getElementById('main-menu-file').files[0];
  if (!file) { showError(errorEl, t('admin.err_no_file')); return; }
  const allowed = ['application/pdf', 'image/png', 'image/jpeg'];
  if (!allowed.includes(file.type)) { showError(errorEl, t('admin.err_not_pdf')); return; }
  if (file.size > 2 * 1024 * 1024) { showError(errorEl, t('admin.err_too_large')); return; }

  const prevData = currentData;
  const docRef = doc(db, 'main_menu', 'current');
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/jpeg' ? 'jpg' : 'pdf';
  const fileName = `${crypto.randomUUID()}.${ext}`;
  const storageRef = ref(storage, `main-menu/${fileName}`);

  progressWrap.hidden = false;
  const uploadTask = uploadBytesResumable(storageRef, file, { contentType: file.type });

  uploadTask.on('state_changed',
    (snapshot) => {
      const pct = Math.round(snapshot.bytesTransferred / snapshot.totalBytes * 100);
      progressFill.style.width = pct + '%';
      progressText.textContent = pct + ' %';
    },
    (err) => {
      progressWrap.hidden = true;
      showError(errorEl, 'Upload fehlgeschlagen: ' + err.message);
    },
    async () => {
      const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
      await setDoc(docRef, {
        pdfUrl: downloadURL,
        fileName,
        contentType: file.type,
        updatedAt: serverTimestamp()
      });

      if (prevData?.fileName) {
        try {
          await deleteObject(ref(storage, `main-menu/${prevData.fileName}`));
        } catch (err) {
          if (err.code !== 'storage/object-not-found') {
            console.warn('Old main menu file delete failed:', err.message);
          }
        }
      }

      await writeAuditLog('main_menu_replace', 'current', fileName);
      progressWrap.hidden = true;
      successEl.hidden = false;
      document.getElementById('main-menu-file').value = '';
      await refreshMainMenuPage();
    }
  );
}
```

Note: unlike the just-replaced tile-panel version of this flow, `replaceMainMenuFile()` takes no parameter and always reads the module-level `currentData` at call time — since `currentData` is only reassigned after `refreshMainMenuPage()` fully resolves (awaited), a second click on "Ersetzen" always sees the just-updated data, not stale state from when the page first loaded.

- [ ] **Step 3: Verify syntax**

Run: `cd "/Users/tujiiprince/develop/Business/i2bit/srilanka_et_italy/srilanka-et-italy.github.io" && node -c js/admin-main-menu.js`
Expected: no output.

- [ ] **Step 4: Manual verification**

This page isn't linked from anywhere yet, so visit it directly: `npm run dev` (browser-sync) from the repo root, then open `http://localhost:3000/admin-main-menu.html` in a browser, log in, and confirm: the current main menu file's preview and "last updated" line render (or the empty-state message if none exists yet), the back arrow goes to `admin.html`, and uploading a replacement file shows a progress bar then updates the preview.

- [ ] **Step 5: Commit**

```bash
cd "/Users/tujiiprince/develop/Business/i2bit/srilanka_et_italy/srilanka-et-italy.github.io"
git add admin-main-menu.html js/admin-main-menu.js
git commit -m "$(cat <<'EOF'
Add dedicated admin-main-menu.html page

Standalone page for viewing/replacing the main menu card, built on
js/admin-shared.js. Not yet linked from anywhere — admin.html still
serves the old combined layout until Task 5 cuts over.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `admin-seasonal-pdfs.html` + `js/admin-seasonal-pdfs.js`

**Files:**
- Create: `admin-seasonal-pdfs.html`
- Create: `js/admin-seasonal-pdfs.js`

**Interfaces:**
- Consumes: `i18n`, `t`, `initAuthGate`, `showError`, `localBerlinToTimestamp`, `createDateRangePicker`, `writeAuditLog`, `renderLargePreview`, `renderPdfThumb` from `js/admin-shared.js` (Task 1).
- Produces: nothing consumed by later tasks.

Like Task 2, this page isn't linked from anywhere yet and cannot break the live site.

- [ ] **Step 1: Create `admin-seasonal-pdfs.html`**

```html
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Aktive Dateien — Admin — Sri Lanka ET Italy</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=Outfit:wght@300;400;500;600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="css/main.css">
  <link rel="stylesheet" href="css/admin.css">
  <link rel="icon" type="image/x-icon" href="assets/favicon.ico">
  <meta name="robots" content="noindex, nofollow">
</head>
<body>

  <!-- Login Screen -->
  <div id="login-screen" class="admin-login-screen">
    <div class="admin-login-card">
      <p class="admin-login-eyebrow">Sri Lanka ET Italy</p>
      <h1 class="admin-login-title" data-i18n="admin.login_title">Admin Login</h1>

      <div class="admin-lang-switch">
        <button class="admin-lang-btn active" data-lang="de">DE</button>
        <button class="admin-lang-btn" data-lang="en">EN</button>
        <button class="admin-lang-btn" data-lang="ta">TA</button>
      </div>

      <form id="login-form" novalidate>
        <div class="admin-field">
          <label for="email" data-i18n="admin.email_label">E-Mail</label>
          <input type="email" id="email" autocomplete="email" required>
        </div>
        <div class="admin-field">
          <label for="password" data-i18n="admin.password_label">Passwort</label>
          <div class="admin-password-wrap">
            <input type="password" id="password" autocomplete="current-password" required>
            <button type="button" id="toggle-password" class="admin-pw-toggle" aria-label="Passwort anzeigen">👁</button>
          </div>
        </div>
        <p id="login-error" class="admin-error" hidden></p>
        <button type="submit" class="btn-dark admin-submit" data-i18n="admin.login_btn">Anmelden</button>
      </form>
    </div>
  </div>

  <!-- Admin Panel (hidden until authenticated) -->
  <div id="admin-panel" class="admin-panel" hidden>
    <header class="admin-header">
      <div class="admin-header-brand">
        <a href="admin.html" class="tile-panel-back" aria-label="Zurück">←</a>
        <span class="admin-header-logo">Sri Lanka <em>ET</em> Italy</span>
        <span class="admin-header-badge" data-i18n="admin.header_badge">Admin</span>
      </div>
      <div class="admin-header-right">
        <div class="admin-header-langs">
          <button class="admin-lang-btn active" data-lang="de">DE</button>
          <button class="admin-lang-btn" data-lang="en">EN</button>
          <button class="admin-lang-btn" data-lang="ta">TA</button>
        </div>
        <button id="logout-btn" class="btn-outline" data-i18n="admin.logout_btn">Abmelden</button>
      </div>
    </header>
    <main class="admin-main">
      <div class="admin-panel-langs">
        <button class="admin-lang-btn active" data-lang="de">DE</button>
        <button class="admin-lang-btn" data-lang="en">EN</button>
        <button class="admin-lang-btn" data-lang="ta">TA</button>
      </div>

      <div class="admin-section">
        <div class="admin-section-header">
          <h2 class="admin-section-title" data-i18n="admin.upload_title">PDF hochladen</h2>
        </div>
        <form id="upload-form" class="admin-upload-form" novalidate>

          <div class="admin-field">
            <label for="pdf-title" data-i18n="admin.title_label">Titel</label>
            <input type="text" id="pdf-title" maxlength="80">
          </div>

          <div class="admin-field">
            <label data-i18n="admin.date_range_label">Zeitraum (Europe/Berlin)</label>
            <div class="daterange-trigger" id="daterange-trigger" tabindex="0" role="button">
              <span class="daterange-icon">📅</span>
              <span id="daterange-display" class="daterange-placeholder" data-i18n="admin.date_range_placeholder">Zeitraum wählen</span>
            </div>
            <div id="daterange-picker" class="daterange-picker" hidden>
              <div class="cal-header">
                <button type="button" class="cal-nav" id="cal-prev">‹</button>
                <span id="cal-month-label" class="cal-month-label"></span>
                <button type="button" class="cal-nav" id="cal-next">›</button>
              </div>
              <div class="cal-weekdays">
                <span>Mo</span><span>Di</span><span>Mi</span>
                <span>Do</span><span>Fr</span><span>Sa</span><span>So</span>
              </div>
              <div class="cal-grid" id="cal-grid"></div>
              <div class="cal-footer">
                <span id="cal-hint" class="cal-hint" data-i18n="admin.date_pick_start">Startdatum wählen</span>
                <button type="button" id="cal-clear" class="cal-clear" data-i18n="admin.date_clear">Löschen</button>
              </div>
            </div>
            <input type="hidden" id="pdf-start">
            <input type="hidden" id="pdf-end">
          </div>

          <div class="admin-field">
            <label for="pdf-order" data-i18n="admin.order_label">Reihenfolge</label>
            <input type="number" id="pdf-order" value="0" min="0" max="99" style="max-width:120px">
          </div>

          <div class="admin-field">
            <label for="pdf-file" data-i18n="admin.file_label">PDF-Datei (max. 2 MB)</label>
            <input type="file" id="pdf-file" accept="application/pdf,image/png,image/jpeg" required>
          </div>

          <div id="upload-progress-wrap" class="upload-progress-wrap" hidden>
            <div class="upload-progress-bar"><div id="upload-progress-fill" class="upload-progress-fill"></div></div>
            <span id="upload-progress-text" class="upload-progress-label">0 %</span>
          </div>
          <p id="upload-error" class="admin-error" hidden></p>
          <p id="upload-success" class="admin-success" hidden data-i18n="admin.upload_success">PDF erfolgreich hochgeladen.</p>
          <button type="submit" class="btn-dark" data-i18n="admin.upload_btn">Hochladen</button>
        </form>
      </div>

      <div class="admin-section">
        <div class="admin-section-header">
          <h2 class="admin-section-title" data-i18n="admin.list_title">Aktive Dateien</h2>
          <span id="pdf-count" class="admin-section-count" hidden></span>
        </div>
        <div id="pdf-tile-grid" class="pdf-tile-grid">
          <p class="pdf-list-empty" data-i18n="admin.list_empty">Keine Dateien vorhanden.</p>
        </div>
      </div>
    </main>
  </div>

  <!-- Tile detail panel (fullscreen, seasonal-only on this page) -->
  <div id="tile-panel" class="tile-panel" hidden role="dialog" aria-modal="true">
    <div class="tile-panel-header">
      <button class="tile-panel-back" id="tile-panel-back" aria-label="Zurück">←</button>
      <h2 class="tile-panel-title" id="tile-panel-title"></h2>
    </div>
    <div class="tile-panel-body">
      <div class="tile-panel-preview" id="tile-panel-preview"></div>

      <div class="admin-field">
        <label for="tile-title" data-i18n="admin.title_label">Titel</label>
        <input type="text" id="tile-title" maxlength="80">
      </div>
      <div class="admin-field">
        <label data-i18n="admin.date_range_label">Zeitraum (Europe/Berlin)</label>
        <div class="daterange-trigger" id="tile-daterange-trigger" tabindex="0" role="button">
          <span class="daterange-icon">📅</span>
          <span id="tile-daterange-display" class="daterange-placeholder" data-i18n="admin.date_range_placeholder">Zeitraum wählen</span>
        </div>
        <div id="tile-daterange-picker" class="daterange-picker" hidden>
          <div class="cal-header">
            <button type="button" class="cal-nav" id="tile-cal-prev">‹</button>
            <span id="tile-cal-month-label" class="cal-month-label"></span>
            <button type="button" class="cal-nav" id="tile-cal-next">›</button>
          </div>
          <div class="cal-weekdays">
            <span>Mo</span><span>Di</span><span>Mi</span>
            <span>Do</span><span>Fr</span><span>Sa</span><span>So</span>
          </div>
          <div class="cal-grid" id="tile-cal-grid"></div>
          <div class="cal-footer">
            <span id="tile-cal-hint" class="cal-hint" data-i18n="admin.date_pick_start">Startdatum wählen</span>
            <button type="button" id="tile-cal-clear" class="cal-clear" data-i18n="admin.date_clear">Löschen</button>
          </div>
        </div>
        <input type="hidden" id="tile-pdf-start">
        <input type="hidden" id="tile-pdf-end">
      </div>
      <div class="admin-field">
        <label for="tile-order" data-i18n="admin.order_label">Reihenfolge</label>
        <input type="number" id="tile-order" value="0" min="0" max="99" style="max-width:120px">
      </div>
      <p id="tile-seasonal-error" class="admin-error" hidden></p>
    </div>
    <div class="tile-panel-footer">
      <button id="tile-delete-btn" class="btn-outline" data-i18n="admin.delete_btn">Löschen</button>
      <button id="tile-save-btn" class="btn-dark" data-i18n="admin.edit_save">Speichern</button>
    </div>
  </div>

  <script src="https://cdnjs.cloudflare.com/ajax/libs/luxon/3.4.4/luxon.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.1.6/purify.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
  <script type="module" src="js/admin-seasonal-pdfs.js"></script>
</body>
</html>
```

Note: unlike the just-retired tile-panel, `#tile-delete-btn` has no `hidden` attribute here and is never toggled — this panel is seasonal-only now, so delete is always applicable, removing the need for the old `type`-based show/hide branching.

- [ ] **Step 2: Create `js/admin-seasonal-pdfs.js`**

```js
import { db, storage } from './firebase-config.js';
import {
  collection, doc, addDoc, updateDoc, deleteDoc, deleteField, getDocs,
  query, orderBy, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import {
  ref, uploadBytesResumable, getDownloadURL, deleteObject
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js';
import {
  i18n, t, initAuthGate, showError, localBerlinToTimestamp,
  createDateRangePicker, writeAuditLog, renderLargePreview, renderPdfThumb
} from './admin-shared.js';

initAuthGate(async () => {
  setupUploadForm();
  await refreshPdfList(document.getElementById('pdf-tile-grid'));
});

// ── Upload ───────────────────────────────────────────────────────────────────

function setupUploadForm() {
  const form        = document.getElementById('upload-form');
  const progressWrap = document.getElementById('upload-progress-wrap');
  const progressFill = document.getElementById('upload-progress-fill');
  const progressText = document.getElementById('upload-progress-text');
  const errorEl     = document.getElementById('upload-error');
  const successEl   = document.getElementById('upload-success');

  createDateRangePicker({
    triggerId: 'daterange-trigger', pickerId: 'daterange-picker', displayId: 'daterange-display',
    gridId: 'cal-grid', monthLabelId: 'cal-month-label', hintId: 'cal-hint', clearBtnId: 'cal-clear',
    prevBtnId: 'cal-prev', nextBtnId: 'cal-next', startInputId: 'pdf-start', endInputId: 'pdf-end'
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.hidden   = true;
    successEl.hidden = true;

    const file = document.getElementById('pdf-file').files[0];
    if (!file) { showError(errorEl, t('admin.err_no_file')); return; }
    const allowed = ['application/pdf', 'image/png', 'image/jpeg'];
    if (!allowed.includes(file.type)) { showError(errorEl, t('admin.err_not_pdf')); return; }
    if (file.size > 2 * 1024 * 1024) { showError(errorEl, t('admin.err_too_large')); return; }

    const startLocal = document.getElementById('pdf-start').value;
    const endLocal   = document.getElementById('pdf-end').value;
    const hasDates   = startLocal && endLocal;

    let startTs, endTs;
    if (hasDates) {
      startTs = localBerlinToTimestamp(startLocal);
      endTs   = localBerlinToTimestamp(endLocal);
      if (endTs.toMillis() <= startTs.toMillis()) { showError(errorEl, t('admin.err_date_order')); return; }
    }

    const order = parseInt(document.getElementById('pdf-order').value) || 0;
    const docId = Date.now().toString();
    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/jpeg' ? 'jpg' : 'pdf';
    const fileName = `${docId}_${crypto.randomUUID()}.${ext}`;
    const storageRef = ref(storage, `seasonal-pdfs/${fileName}`);

    const title = DOMPurify.sanitize(document.getElementById('pdf-title').value.trim());
    const docData = {
      title,
      order,
      permanent: !hasDates,
      status: 'draft',
      fileName,
      contentType: file.type,
      pdfUrl: 'pending',
      createdAt: serverTimestamp()
    };
    if (hasDates) { docData.startDate = startTs; docData.endDate = endTs; }

    const docRef = await addDoc(collection(db, 'seasonal_pdfs'), docData);

    progressWrap.hidden = false;
    const uploadTask = uploadBytesResumable(storageRef, file, { contentType: file.type });

    uploadTask.on('state_changed',
      (snapshot) => {
        const pct = Math.round(snapshot.bytesTransferred / snapshot.totalBytes * 100);
        progressFill.style.width = pct + '%';
        progressText.textContent = pct + ' %';
      },
      async (err) => {
        progressWrap.hidden = true;
        await deleteDoc(docRef);
        showError(errorEl, 'Upload fehlgeschlagen: ' + err.message);
      },
      async () => {
        const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
        await updateDoc(docRef, { status: 'active', pdfUrl: downloadURL });
        await writeAuditLog('upload', docRef.id, fileName);
        progressWrap.hidden = true;
        successEl.hidden = false;
        form.reset();
        await refreshPdfList(document.getElementById('pdf-tile-grid'));
      }
    );
  });
}

// ── PDF grid ─────────────────────────────────────────────────────────────────

async function refreshPdfList(gridEl) {
  const q = query(collection(db, 'seasonal_pdfs'), orderBy('order'), orderBy('createdAt'));
  const snap = await getDocs(q);

  const countEl = document.getElementById('pdf-count');
  if (!snap.empty && countEl) {
    countEl.textContent = snap.size;
    countEl.hidden = false;
  } else if (countEl) {
    countEl.hidden = true;
  }

  if (snap.empty) {
    gridEl.innerHTML = `<p class="pdf-list-empty pdf-tile-empty">${t('admin.list_empty')}</p>`;
    return;
  }
  gridEl.innerHTML = '';
  snap.forEach((docSnap) => {
    const d = docSnap.data();
    gridEl.appendChild(renderPdfTile(docSnap.id, d));
  });
}

function renderPdfTile(id, d) {
  const tile = document.createElement('div');
  tile.className = 'pdf-tile';

  const titleText = typeof d.title === 'string' ? d.title : (d.title?.[i18n.lang] || d.title?.de || id);
  const isImage = d.contentType && d.contentType.startsWith('image/');

  tile.innerHTML = `
    <div class="pdf-tile-thumb">
      ${isImage
        ? `<img src="${DOMPurify.sanitize(d.pdfUrl)}" alt="">`
        : `<canvas></canvas>`}
    </div>
    <div class="pdf-tile-info">
      <span class="pdf-tile-title">${DOMPurify.sanitize(titleText)}</span>
      <div class="pdf-tile-meta">
        <span class="pdf-tile-status ${d.status || 'draft'}">${d.status || 'draft'}</span>
      </div>
    </div>`;

  if (!isImage && d.pdfUrl && d.pdfUrl !== 'pending') {
    renderPdfThumb(d.pdfUrl, tile.querySelector('canvas'));
  }
  tile.addEventListener('click', () => openTilePanel(id, d));
  return tile;
}

async function deletePdf(docId, fileName) {
  if (!confirm(t('admin.delete_confirm'))) return;

  const docRef = doc(db, 'seasonal_pdfs', docId);
  await updateDoc(docRef, { status: 'deleting' });

  try {
    const fileRef = ref(storage, `seasonal-pdfs/${fileName}`);
    await deleteObject(fileRef);
  } catch (err) {
    if (err.code !== 'storage/object-not-found') {
      alert(t('admin.delete_storage_error') + err.message);
      await updateDoc(docRef, { status: 'active' });
      return;
    }
  }

  await deleteDoc(docRef);
  await writeAuditLog('delete', docId, fileName);
  await refreshPdfList(document.getElementById('pdf-tile-grid'));
}

// ── Tile detail panel (seasonal-only) ─────────────────────────────────────────

let tileDateRangePicker = null;

function ensureTileDateRangePicker() {
  if (tileDateRangePicker) return tileDateRangePicker;
  tileDateRangePicker = createDateRangePicker({
    triggerId: 'tile-daterange-trigger', pickerId: 'tile-daterange-picker', displayId: 'tile-daterange-display',
    gridId: 'tile-cal-grid', monthLabelId: 'tile-cal-month-label', hintId: 'tile-cal-hint', clearBtnId: 'tile-cal-clear',
    prevBtnId: 'tile-cal-prev', nextBtnId: 'tile-cal-next', startInputId: 'tile-pdf-start', endInputId: 'tile-pdf-end'
  });
  return tileDateRangePicker;
}

function openTilePanel(docId, d) {
  const panel   = document.getElementById('tile-panel');
  const title   = document.getElementById('tile-panel-title');
  const preview = document.getElementById('tile-panel-preview');

  const isImage = d.contentType && d.contentType.startsWith('image/');
  if (d.pdfUrl && d.pdfUrl !== 'pending') {
    renderLargePreview(preview, d.pdfUrl, isImage);
  } else {
    preview.innerHTML = '';
  }

  title.textContent = typeof d.title === 'string' ? d.title : (d.title?.[i18n.lang] || d.title?.de || docId);
  document.getElementById('tile-title').value = typeof d.title === 'string' ? d.title : '';
  document.getElementById('tile-order').value = d.order ?? 0;

  const startVal = d.startDate ? isoLocalFromTimestamp(d.startDate, false) : '';
  const endVal   = d.endDate   ? isoLocalFromTimestamp(d.endDate, true)    : '';
  ensureTileDateRangePicker().syncDates(startVal, endVal);
  document.getElementById('tile-seasonal-error').hidden = true;

  document.getElementById('tile-save-btn').onclick = () => saveSeasonalTile(docId, d);
  document.getElementById('tile-delete-btn').onclick = () => deleteTileAndClose(docId, d.fileName);

  panel.hidden = false;
  try { document.getElementById('tile-title').focus(); } catch { /* ignore focus errors */ }
}

function closeTilePanel() {
  document.getElementById('tile-panel').hidden = true;
  document.getElementById('tile-panel-preview').innerHTML = '';
}

document.getElementById('tile-panel-back').addEventListener('click', closeTilePanel);

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const panel = document.getElementById('tile-panel');
  if (panel && !panel.hidden) closeTilePanel();
});

function isoLocalFromTimestamp(ts, endOfDay) {
  const dt = ts.toDate();
  const pad = n => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${endOfDay ? '23:59' : '00:00'}`;
}

async function saveSeasonalTile(docId, d) {
  const errorEl = document.getElementById('tile-seasonal-error');
  errorEl.hidden = true;
  const saveBtn  = document.getElementById('tile-save-btn');

  const newTitle = DOMPurify.sanitize(document.getElementById('tile-title').value.trim());
  const newOrder = parseInt(document.getElementById('tile-order').value) || 0;
  const startLocal = document.getElementById('tile-pdf-start').value;
  const endLocal   = document.getElementById('tile-pdf-end').value;
  const hasDates   = startLocal && endLocal;

  let startTs, endTs;
  if (hasDates) {
    startTs = localBerlinToTimestamp(startLocal);
    endTs   = localBerlinToTimestamp(endLocal);
    if (endTs.toMillis() <= startTs.toMillis()) {
      errorEl.textContent = t('admin.err_date_order');
      errorEl.hidden = false;
      return;
    }
  }

  saveBtn.disabled = true;
  try {
    const updates = {
      title: newTitle,
      order: newOrder,
      permanent: !hasDates
    };
    if (hasDates) {
      updates.startDate = startTs;
      updates.endDate   = endTs;
    } else {
      updates.startDate = deleteField();
      updates.endDate   = deleteField();
    }
    await updateDoc(doc(db, 'seasonal_pdfs', docId), updates);
    await writeAuditLog('edit', docId, d.fileName || '');
    closeTilePanel();
    await refreshPdfList(document.getElementById('pdf-tile-grid'));
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.hidden = false;
  } finally {
    saveBtn.disabled = false;
  }
}

async function deleteTileAndClose(docId, fileName) {
  await deletePdf(docId, fileName);
  closeTilePanel();
}
```

- [ ] **Step 3: Verify syntax**

Run: `cd "/Users/tujiiprince/develop/Business/i2bit/srilanka_et_italy/srilanka-et-italy.github.io" && node -c js/admin-seasonal-pdfs.js`
Expected: no output.

- [ ] **Step 4: Manual verification**

With `npm run dev` running, open `http://localhost:3000/admin-seasonal-pdfs.html`, log in, and confirm: the upload form and tile grid render (upload 1-2 test files if empty), clicking a tile opens the fullscreen panel with title/date-range/order fields and a delete button, editing and saving works, deleting works, Escape and the back arrow both close the panel back to this grid (not to `admin.html`).

- [ ] **Step 5: Commit**

```bash
cd "/Users/tujiiprince/develop/Business/i2bit/srilanka_et_italy/srilanka-et-italy.github.io"
git add admin-seasonal-pdfs.html js/admin-seasonal-pdfs.js
git commit -m "$(cat <<'EOF'
Add dedicated admin-seasonal-pdfs.html page

Standalone page with the upload form, tile grid, and the fullscreen
edit panel (now seasonal-only, no more mainMenu/type branching).
Not yet linked from anywhere — admin.html still serves the old
combined layout until Task 5 cuts over.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Launcher CSS + i18n key

**Files:**
- Modify: `css/admin.css`
- Modify: `i18n/de.json`, `i18n/en.json`, `i18n/ta.json`

**Interfaces:**
- Produces: `.launcher-category`, `.launcher-grid`, `.launcher-tile`, `.launcher-tile-icon`, `.launcher-tile-label` CSS classes, plus a `text-decoration: none` rule for `.tile-panel-back` when used as an `<a>` (Tasks 2 and 3 already use it that way). Translation key `admin.launcher_category`. All consumed by Task 5's `admin.html` markup.
- Consumes: existing custom properties (`--ink`, `--spice`, `--muted`) already used elsewhere in this file.

- [ ] **Step 1: Add launcher styles to `css/admin.css`**

Add this new section (e.g. at the end of the file):

```css
/* ── Launcher (admin.html home) ── */

a.tile-panel-back { text-decoration: none; }

.launcher-category {
  margin-bottom: .85rem;
  font-size: .78rem;
  font-weight: 700;
  letter-spacing: .06em;
  text-transform: uppercase;
  color: var(--muted, #7A6E64);
}

.launcher-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  gap: 1.25rem;
}

.launcher-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: .6rem;
  text-decoration: none;
  cursor: pointer;
}

.launcher-tile-icon {
  width: 100%;
  aspect-ratio: 1;
  max-width: 92px;
  border-radius: 16px;
  background: var(--ink, #1C1410);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2.1rem;
  transition: background .15s, transform .15s;
}
.launcher-tile:hover .launcher-tile-icon {
  background: var(--spice, #C8651A);
  transform: translateY(-2px);
}

.launcher-tile-label {
  font-size: .82rem;
  font-weight: 600;
  color: var(--ink, #1C1410);
  text-align: center;
}
```

- [ ] **Step 2: Add `admin.launcher_category` to `i18n/de.json`**

Inside the existing `"admin": { ... }` object, add (e.g. right after `"header_badge"`):

```json
    "launcher_category": "Speisekarten",
```

- [ ] **Step 3: Add `admin.launcher_category` to `i18n/en.json`**

```json
    "launcher_category": "Menus",
```

- [ ] **Step 4: Add `admin.launcher_category` to `i18n/ta.json`**

```json
    "launcher_category": "உணவு பட்டியல்கள்",
```

- [ ] **Step 5: Validate JSON syntax**

Run: `cd "/Users/tujiiprince/develop/Business/i2bit/srilanka_et_italy/srilanka-et-italy.github.io" && python3 -c "import json; [json.load(open(f'i18n/{l}.json')) for l in ('de','en','ta')]; print('OK')"`
Expected: `OK`.

- [ ] **Step 6: Commit**

```bash
cd "/Users/tujiiprince/develop/Business/i2bit/srilanka_et_italy/srilanka-et-italy.github.io"
git add css/admin.css i18n/de.json i18n/en.json i18n/ta.json
git commit -m "$(cat <<'EOF'
Add launcher tile styles and category-heading translation key

Prep for Task 5's admin.html rewrite — additive only, no existing
selectors touched.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Cut over `admin.html` to the launcher; retire old files

**Files:**
- Modify: `admin.html`
- Create: `js/admin-home.js`
- Delete: `js/admin.js`
- Delete: `components/admin-panel.html`

**Interfaces:**
- Consumes: `initAuthGate` from `js/admin-shared.js` (Task 1); launcher CSS classes and `admin.launcher_category` key (Task 4); links to `admin-main-menu.html` (Task 2) and `admin-seasonal-pdfs.html` (Task 3).
- Produces: nothing — this is the final task.

This is the one task where the live site's behavior actually changes — do this last, and do the full manual verification pass (Step 4) before considering the plan complete.

- [ ] **Step 1: Replace `admin.html` in full**

```html
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Admin — Sri Lanka ET Italy</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=Outfit:wght@300;400;500;600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="css/main.css">
  <link rel="stylesheet" href="css/admin.css">
  <link rel="icon" type="image/x-icon" href="assets/favicon.ico">
  <meta name="robots" content="noindex, nofollow">
</head>
<body>

  <!-- Login Screen -->
  <div id="login-screen" class="admin-login-screen">
    <div class="admin-login-card">
      <p class="admin-login-eyebrow">Sri Lanka ET Italy</p>
      <h1 class="admin-login-title" data-i18n="admin.login_title">Admin Login</h1>

      <div class="admin-lang-switch">
        <button class="admin-lang-btn active" data-lang="de">DE</button>
        <button class="admin-lang-btn" data-lang="en">EN</button>
        <button class="admin-lang-btn" data-lang="ta">TA</button>
      </div>

      <form id="login-form" novalidate>
        <div class="admin-field">
          <label for="email" data-i18n="admin.email_label">E-Mail</label>
          <input type="email" id="email" autocomplete="email" required>
        </div>
        <div class="admin-field">
          <label for="password" data-i18n="admin.password_label">Passwort</label>
          <div class="admin-password-wrap">
            <input type="password" id="password" autocomplete="current-password" required>
            <button type="button" id="toggle-password" class="admin-pw-toggle" aria-label="Passwort anzeigen">👁</button>
          </div>
        </div>
        <p id="login-error" class="admin-error" hidden></p>
        <button type="submit" class="btn-dark admin-submit" data-i18n="admin.login_btn">Anmelden</button>
      </form>
    </div>
  </div>

  <!-- Admin Panel (hidden until authenticated) -->
  <div id="admin-panel" class="admin-panel" hidden>
    <header class="admin-header">
      <div class="admin-header-brand">
        <span class="admin-header-logo">Sri Lanka <em>ET</em> Italy</span>
        <span class="admin-header-badge" data-i18n="admin.header_badge">Admin</span>
      </div>
      <div class="admin-header-right">
        <div class="admin-header-langs">
          <button class="admin-lang-btn active" data-lang="de">DE</button>
          <button class="admin-lang-btn" data-lang="en">EN</button>
          <button class="admin-lang-btn" data-lang="ta">TA</button>
        </div>
        <button id="logout-btn" class="btn-outline" data-i18n="admin.logout_btn">Abmelden</button>
      </div>
    </header>
    <main class="admin-main">
      <div class="admin-panel-langs">
        <button class="admin-lang-btn active" data-lang="de">DE</button>
        <button class="admin-lang-btn" data-lang="en">EN</button>
        <button class="admin-lang-btn" data-lang="ta">TA</button>
      </div>

      <div class="launcher-category" data-i18n="admin.launcher_category">Speisekarten</div>
      <div class="launcher-grid">
        <a href="admin-main-menu.html" class="launcher-tile">
          <div class="launcher-tile-icon">🍽</div>
          <span class="launcher-tile-label" data-i18n="admin.main_menu_title">Hauptspeisekarte</span>
        </a>
        <a href="admin-seasonal-pdfs.html" class="launcher-tile">
          <div class="launcher-tile-icon">🗂</div>
          <span class="launcher-tile-label" data-i18n="admin.list_title">Aktive Dateien</span>
        </a>
      </div>
    </main>
  </div>

  <script src="https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.1.6/purify.min.js"></script>
  <script type="module" src="js/admin-home.js"></script>
</body>
</html>
```

Note `luxon` and `pdf.js` script tags are dropped — the launcher page has no date picker and no PDF preview, unlike the old combined page.

- [ ] **Step 2: Create `js/admin-home.js`**

```js
import { initAuthGate } from './admin-shared.js';

initAuthGate();
```

- [ ] **Step 3: Delete the retired files**

```bash
cd "/Users/tujiiprince/develop/Business/i2bit/srilanka_et_italy/srilanka-et-italy.github.io"
rm js/admin.js
rm components/admin-panel.html
```

- [ ] **Step 4: Full manual verification**

With `npm run dev` running:
1. Open `http://localhost:3000/admin.html`, log in.
2. Confirm the launcher shows the "Speisekarten" heading and two icon tiles ("Hauptspeisekarte", "Aktive Dateien").
3. Click "Hauptspeisekarte" → lands on `admin-main-menu.html` directly (no intermediate list), shows the current file or empty state, back arrow returns to `admin.html`.
4. Click "Aktive Dateien" → lands on `admin-seasonal-pdfs.html`, shows upload form + tile grid, clicking a tile opens the panel, back arrow/Escape return to the grid (not the launcher).
5. Directly load `admin-main-menu.html` and `admin-seasonal-pdfs.html` by URL (not via the launcher) while logged out — confirm each independently shows its own login screen and gates access.
6. Confirm browser back/forward between `admin.html` → `admin-seasonal-pdfs.html` works via normal history (no special handling needed since these are real page loads).

- [ ] **Step 5: Verify no dangling references to deleted files**

Run:

```bash
cd "/Users/tujiiprince/develop/Business/i2bit/srilanka_et_italy/srilanka-et-italy.github.io"
grep -rn "components/admin-panel.html\|js/admin\.js\b" --include="*.html" --include="*.js" . | grep -v node_modules
```

Expected: no output (empty).

- [ ] **Step 6: Commit**

```bash
cd "/Users/tujiiprince/develop/Business/i2bit/srilanka_et_italy/srilanka-et-italy.github.io"
git add -A admin.html js/admin-home.js
git rm js/admin.js components/admin-panel.html
git commit -m "$(cat <<'EOF'
Cut admin.html over to the icon launcher; retire the combined page

admin.html is now a pure launcher linking to admin-main-menu.html
and admin-seasonal-pdfs.html. The old fetch-and-inject mechanism
(components/admin-panel.html) and the monolithic js/admin.js are
removed — their logic now lives in js/admin-shared.js plus the two
page-specific modules added in prior tasks.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Post-plan deployment note

None of these 5 tasks deploy to production automatically — this is a frontend-only change (`admin.html`, two new HTML pages, `css/admin.css`, `i18n/*.json`, `js/*.js`), all served via Firebase Hosting. A real `firebase deploy --only hosting` (or the GitHub Actions merge workflow, if pushed) is a separate, production-affecting action requiring explicit user confirmation before running.
