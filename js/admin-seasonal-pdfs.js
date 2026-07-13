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
