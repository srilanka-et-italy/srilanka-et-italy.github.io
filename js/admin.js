import { db, storage } from './firebase-config.js';
import { login, logout, onAdminAuthStateChanged } from './auth.js';
import { I18n } from './i18n.js';
import {
  collection, doc, addDoc, updateDoc, deleteDoc, getDocs,
  query, orderBy, serverTimestamp, Timestamp
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import {
  ref, uploadBytesResumable, getDownloadURL, deleteObject
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js';

const loginScreen  = document.getElementById('login-screen');
const adminPanel   = document.getElementById('admin-panel');
const loginForm    = document.getElementById('login-form');
const loginError   = document.getElementById('login-error');
const logoutBtn    = document.getElementById('logout-btn');

// ── i18n ────────────────────────────────────────────────────────────────────

const i18n = new I18n();
await i18n.init();

function t(key) {
  return i18n.getValueByPath(i18n.translations, key) || key;
}

function setupLangButtons() {
  document.querySelectorAll('.admin-lang-btn[data-lang]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await i18n.setLanguage(btn.getAttribute('data-lang'));
      // sync active state across all lang button groups
      document.querySelectorAll('.admin-lang-btn[data-lang]').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-lang') === i18n.lang);
      });
      // re-apply placeholders for dynamically-loaded panel
      applyPanelPlaceholders();
    });
  });
}

function applyPanelPlaceholders() {
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const val = t(el.getAttribute('data-i18n-placeholder'));
    if (val) el.placeholder = val;
  });
}

setupLangButtons();

// ── Auth state ──────────────────────────────────────────────────────────────

onAdminAuthStateChanged(async (user) => {
  if (user) {
    loginScreen.hidden  = true;
    adminPanel.hidden   = false;
    await loadAdminPanel();
  } else {
    loginScreen.hidden  = false;
    adminPanel.hidden   = true;
  }
});

document.getElementById('toggle-password').addEventListener('click', () => {
  const pw = document.getElementById('password');
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

// ── Load panel ──────────────────────────────────────────────────────────────

async function loadAdminPanel() {
  const placeholder = document.getElementById('admin-content-placeholder');
  const res  = await fetch('components/admin-panel.html');
  const html = await res.text();
  placeholder.innerHTML = DOMPurify.sanitize(html, {
    ADD_TAGS: ['form', 'input', 'label', 'button', 'select', 'option'],
    ADD_ATTR: ['for', 'type', 'id', 'name', 'value', 'accept', 'required',
               'min', 'max', 'maxlength', 'hidden', 'data-i18n', 'data-i18n-placeholder',
               'data-title-lang', 'style', 'tabindex', 'role']
  });

  // Apply i18n to the newly injected HTML
  i18n.updateDOM();
  applyPanelPlaceholders();

  setupTitleTabs();
  setupUploadForm();
  setupPdfList();
}

// ── Title language tabs ───────────────────────────────────────────────────

function setupTitleTabs() {
  document.querySelectorAll('.admin-lang-tab[data-title-lang]').forEach(tab => {
    tab.addEventListener('click', () => {
      const lang = tab.getAttribute('data-title-lang');
      document.querySelectorAll('.admin-lang-tab[data-title-lang]').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('.admin-title-pane').forEach(p => p.classList.remove('active'));
      document.getElementById('title-pane-' + lang).classList.add('active');
    });
  });
}

// ── Upload ───────────────────────────────────────────────────────────────────

function setupUploadForm() {
  const form        = document.getElementById('upload-form');
  const progressWrap = document.getElementById('upload-progress-wrap');
  const progressFill = document.getElementById('upload-progress-fill');
  const progressText = document.getElementById('upload-progress-text');
  const errorEl     = document.getElementById('upload-error');
  const successEl   = document.getElementById('upload-success');

  setupDateRangePicker();

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

    const titleDe = DOMPurify.sanitize(document.getElementById('pdf-title-de').value.trim());
    const docData = {
      title: {
        de: titleDe,
        en: DOMPurify.sanitize(document.getElementById('pdf-title-en').value.trim()),
        ta: DOMPurify.sanitize(document.getElementById('pdf-title-ta').value.trim())
      },
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
        // reset title tabs back to DE
        document.querySelectorAll('.admin-lang-tab[data-title-lang]').forEach(t => t.classList.remove('active'));
        const deTab = document.querySelector('.admin-lang-tab[data-title-lang="de"]');
        if (deTab) deTab.classList.add('active');
        document.querySelectorAll('.admin-title-pane').forEach(p => p.classList.remove('active'));
        const dePane = document.getElementById('title-pane-de');
        if (dePane) dePane.classList.add('active');
        await refreshPdfList(document.getElementById('pdf-list'));
      }
    );
  });
}

// ── PDF list ─────────────────────────────────────────────────────────────────

async function setupPdfList() {
  const listEl = document.getElementById('pdf-list');
  await refreshPdfList(listEl);
}

async function refreshPdfList(listEl) {
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
    listEl.innerHTML = `<p class="pdf-list-empty">${t('admin.list_empty')}</p>`;
    return;
  }
  listEl.innerHTML = '';
  snap.forEach((docSnap) => {
    const d = docSnap.data();
    listEl.appendChild(renderPdfItem(docSnap.id, d));
  });
}

function renderPdfItem(id, d) {
  const item = document.createElement('div');
  item.className = 'pdf-item';

  const startStr = d.startDate ? d.startDate.toDate().toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' }) : null;
  const endStr   = d.endDate   ? d.endDate.toDate().toLocaleDateString('de-DE',   { timeZone: 'Europe/Berlin' }) : null;
  const dateStr  = startStr && endStr ? `${startStr} – ${endStr}` : '∞ immer aktiv';
  const titleText = d.title?.[i18n.lang] || d.title?.de || id;

  const isImage = d.contentType && d.contentType.startsWith('image/');

  item.innerHTML = `
    <div class="pdf-item-thumb">
      ${isImage
        ? `<img src="${DOMPurify.sanitize(d.pdfUrl)}" alt="" class="pdf-thumb-img">`
        : `<canvas class="pdf-thumb-canvas"></canvas>`}
    </div>
    <div class="pdf-item-info">
      <span class="pdf-item-title">${DOMPurify.sanitize(titleText)}</span>
      <span class="pdf-item-dates">${dateStr}</span>
    </div>
    <div class="pdf-item-right">
      <span class="pdf-item-status ${d.status}">${d.status}</span>
      <button class="btn-delete">${t('admin.delete_btn')}</button>
    </div>`;

  if (!isImage && d.pdfUrl && d.pdfUrl !== 'pending') {
    renderPdfThumb(d.pdfUrl, item.querySelector('.pdf-thumb-canvas'));
  }
  item.querySelector('.btn-delete').addEventListener('click', () => deletePdf(id, d.fileName));
  return item;
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
  await refreshPdfList(document.getElementById('pdf-list'));
}

// ── PDF thumbnail ─────────────────────────────────────────────────────────────

async function renderPdfThumb(url, canvas) {
  if (!canvas || typeof pdfjsLib === 'undefined') return;
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const pdf  = await pdfjsLib.getDocument({ url }).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 1 });
    const scale = 56 / viewport.width;
    const vp = page.getViewport({ scale });
    canvas.width  = vp.width;
    canvas.height = vp.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
  } catch { /* show nothing on error */ }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function showError(el, msg) {
  el.textContent = msg;
  el.hidden = false;
}

function localBerlinToTimestamp(localDatetimeStr) {
  const dt = luxon.DateTime.fromISO(localDatetimeStr, { zone: 'Europe/Berlin' });
  return Timestamp.fromMillis(dt.toMillis());
}

function setupDateRangePicker() {
  const trigger  = document.getElementById('daterange-trigger');
  const picker   = document.getElementById('daterange-picker');
  const display  = document.getElementById('daterange-display');
  const grid     = document.getElementById('cal-grid');
  const label    = document.getElementById('cal-month-label');
  const hint     = document.getElementById('cal-hint');
  const clearBtn = document.getElementById('cal-clear');
  const startInput = document.getElementById('pdf-start');
  const endInput   = document.getElementById('pdf-end');
  if (!trigger) return;

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
    // Mon=0 offset
    let offset = (firstDay.getDay() + 6) % 7;
    const daysInMonth  = new Date(viewYear, viewMonth+1, 0).getDate();
    const daysInPrev   = new Date(viewYear, viewMonth, 0).getDate();

    // Prev month padding
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

    // Next month padding
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

  document.getElementById('cal-prev').addEventListener('click', () => {
    viewMonth--; if (viewMonth < 0) { viewMonth = 11; viewYear--; } renderGrid();
  });
  document.getElementById('cal-next').addEventListener('click', () => {
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

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (!trigger.contains(e.target) && !picker.contains(e.target)) {
      picker.hidden = true;
      trigger.classList.remove('open');
    }
  });

  updateDisplay();
}

async function writeAuditLog(action, docId, fileName) {
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
