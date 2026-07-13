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
