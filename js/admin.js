import { db, storage } from './firebase-config.js';
import { login, logout, onAdminAuthStateChanged } from './auth.js';
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
      ? 'Ungültige Anmeldedaten oder fehlende Berechtigung.'
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
  placeholder.innerHTML = DOMPurify.sanitize(html, { ADD_TAGS: ['form', 'input', 'label', 'button', 'select', 'option'], ADD_ATTR: ['for', 'type', 'id', 'name', 'value', 'accept', 'required', 'min', 'max', 'maxlength', 'hidden'] });

  setupUploadForm();
  setupPdfList();
}

// ── Upload ───────────────────────────────────────────────────────────────────

function setupUploadForm() {
  const form        = document.getElementById('upload-form');
  const progressWrap = document.getElementById('upload-progress-wrap');
  const progressFill = document.getElementById('upload-progress-fill');
  const progressText = document.getElementById('upload-progress-text');
  const errorEl     = document.getElementById('upload-error');
  const successEl   = document.getElementById('upload-success');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.hidden   = true;
    successEl.hidden = true;

    const file = document.getElementById('pdf-file').files[0];
    if (!file) { showError(errorEl, 'Bitte wähle eine PDF-Datei.'); return; }
    if (file.type !== 'application/pdf') { showError(errorEl, 'Nur PDF-Dateien erlaubt.'); return; }
    if (file.size > 2 * 1024 * 1024) { showError(errorEl, 'Datei zu groß (max. 2 MB).'); return; }

    const titleDe = DOMPurify.sanitize(document.getElementById('pdf-title-de').value.trim());
    if (!titleDe) { showError(errorEl, 'Titel (DE) ist erforderlich.'); return; }

    // Convert local Berlin time to UTC Timestamp
    const startLocal = document.getElementById('pdf-start').value;
    const endLocal   = document.getElementById('pdf-end').value;
    if (!startLocal || !endLocal) { showError(errorEl, 'Start- und Enddatum sind erforderlich.'); return; }

    const startTs = localBerlinToTimestamp(startLocal);
    const endTs   = localBerlinToTimestamp(endLocal);
    if (endTs.toMillis() <= startTs.toMillis()) { showError(errorEl, 'Enddatum muss nach Startdatum liegen.'); return; }

    const order = parseInt(document.getElementById('pdf-order').value) || 0;
    const docId = Date.now().toString();
    const fileName = `${docId}_${crypto.randomUUID()}.pdf`;
    const storageRef = ref(storage, `seasonal-pdfs/${fileName}`);

    // Create Firestore doc with status 'draft' first (prevents public visibility during upload)
    const docRef = await addDoc(collection(db, 'seasonal_pdfs'), {
      title: { de: titleDe, en: DOMPurify.sanitize(document.getElementById('pdf-title-en').value.trim()), ta: DOMPurify.sanitize(document.getElementById('pdf-title-ta').value.trim()) },
      startDate: startTs,
      endDate: endTs,
      order,
      status: 'draft',
      fileName,
      pdfUrl: 'pending',
      createdAt: serverTimestamp()
    });

    // Upload with progress
    progressWrap.hidden = false;
    const uploadTask = uploadBytesResumable(storageRef, file, { contentType: 'application/pdf' });

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
  if (snap.empty) {
    listEl.innerHTML = '<p class="pdf-list-empty">Keine PDFs vorhanden.</p>';
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

  item.innerHTML = `
    <div class="pdf-item-info">
      <span class="pdf-item-title">${DOMPurify.sanitize(d.title?.de || id)}</span>
      <span class="pdf-item-dates">${startStr} – ${endStr}</span>
    </div>
    <div style="display:flex;align-items:center;gap:.75rem">
      <span class="pdf-item-status ${d.status}">${d.status}</span>
      <div class="pdf-item-actions">
        <button class="btn-delete" data-id="${id}" data-filename="${d.fileName}">Löschen</button>
      </div>
    </div>`;

  item.querySelector('.btn-delete').addEventListener('click', () => deletePdf(id, d.fileName));
  return item;
}

async function deletePdf(docId, fileName) {
  if (!confirm('PDF wirklich löschen?')) return;

  // Mark as deleting first
  const docRef = doc(db, 'seasonal_pdfs', docId);
  await updateDoc(docRef, { status: 'deleting' });

  try {
    const fileRef = ref(storage, `seasonal-pdfs/${fileName}`);
    await deleteObject(fileRef);
  } catch (err) {
    if (err.code !== 'storage/object-not-found') {
      alert('Storage-Löschen fehlgeschlagen: ' + err.message);
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
  // localDatetimeStr = "YYYY-MM-DDTHH:mm" interpreted as Europe/Berlin
  // Luxon is loaded globally via CDN in admin.html
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
