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
               'data-title-lang', 'style']
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

  // Auto-open end date picker after start date is chosen
  document.getElementById('pdf-start').addEventListener('change', () => {
    const endInput = document.getElementById('pdf-end');
    if (!endInput) return;
    setTimeout(() => {
      try { endInput.showPicker(); } catch { endInput.focus(); }
    }, 150);
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

    const titleDe = DOMPurify.sanitize(document.getElementById('pdf-title-de').value.trim());
    if (!titleDe) { showError(errorEl, t('admin.err_no_title')); return; }

    const startLocal = document.getElementById('pdf-start').value;
    const endLocal   = document.getElementById('pdf-end').value;
    if (!startLocal || !endLocal) { showError(errorEl, t('admin.err_no_dates')); return; }

    const startTs = localBerlinToTimestamp(startLocal);
    const endTs   = localBerlinToTimestamp(endLocal);
    if (endTs.toMillis() <= startTs.toMillis()) { showError(errorEl, t('admin.err_date_order')); return; }

    const order = parseInt(document.getElementById('pdf-order').value) || 0;
    const docId = Date.now().toString();
    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/jpeg' ? 'jpg' : 'pdf';
    const fileName = `${docId}_${crypto.randomUUID()}.${ext}`;
    const storageRef = ref(storage, `seasonal-pdfs/${fileName}`);

    const docRef = await addDoc(collection(db, 'seasonal_pdfs'), {
      title: {
        de: titleDe,
        en: DOMPurify.sanitize(document.getElementById('pdf-title-en').value.trim()),
        ta: DOMPurify.sanitize(document.getElementById('pdf-title-ta').value.trim())
      },
      startDate: startTs,
      endDate: endTs,
      order,
      status: 'draft',
      fileName,
      contentType: file.type,
      pdfUrl: 'pending',
      createdAt: serverTimestamp()
    });

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

  const startStr = d.startDate ? d.startDate.toDate().toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' }) : '?';
  const endStr   = d.endDate   ? d.endDate.toDate().toLocaleDateString('de-DE',   { timeZone: 'Europe/Berlin' }) : '?';
  const titleText = d.title?.[i18n.lang] || d.title?.de || id;

  item.innerHTML = `
    <div class="pdf-item-icon">📄</div>
    <div class="pdf-item-info">
      <span class="pdf-item-title">${DOMPurify.sanitize(titleText)}</span>
      <span class="pdf-item-dates">${startStr} – ${endStr}</span>
    </div>
    <div class="pdf-item-right">
      <span class="pdf-item-status ${d.status}">${d.status}</span>
      <button class="btn-delete" data-id="${id}" data-filename="${d.fileName}">${t('admin.delete_btn')}</button>
    </div>`;

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function showError(el, msg) {
  el.textContent = msg;
  el.hidden = false;
}

function localBerlinToTimestamp(localDatetimeStr) {
  const dt = luxon.DateTime.fromISO(localDatetimeStr, { zone: 'Europe/Berlin' });
  return Timestamp.fromMillis(dt.toMillis());
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
