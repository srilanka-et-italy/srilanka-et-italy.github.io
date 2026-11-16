import { db } from './firebase-config.js';
import { doc, getDoc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { initAuthGate, showError, writeAuditLog } from './admin-shared.js';

const LANGS = ['de', 'en', 'ta'];
const enabledEl = document.getElementById('maintenance-enabled');
const hintEl    = document.getElementById('maintenance-hint');

setupLangTabs();
enabledEl.addEventListener('change', updateHint);
document.getElementById('maintenance-save-btn').addEventListener('click', () => saveMaintenance());

initAuthGate(async () => {
  await loadMaintenance();
});

function updateHint() {
  hintEl.hidden = !enabledEl.checked;
}

function setupLangTabs() {
  const wrapper = document.getElementById('maintenance-text-field');
  const tabs = document.querySelectorAll('#maintenance-lang-tabs .admin-lang-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      wrapper.querySelectorAll('.admin-title-pane').forEach(pane => {
        pane.classList.toggle('active', pane.dataset.langPane === tab.dataset.lang);
      });
    });
  });
}

async function loadMaintenance() {
  try {
    const snap = await getDoc(doc(db, 'site_content', 'maintenance'));
    const data = snap.exists() ? snap.data() : null;
    if (!data) return;
    enabledEl.checked = data.enabled === true;
    LANGS.forEach(l => {
      document.getElementById(`maintenance-text-${l}`).value = data.text?.[l] || '';
    });
    updateHint();
  } catch (err) {
    console.warn('Could not load maintenance data:', err.message);
  }
}

async function saveMaintenance() {
  const errorEl   = document.getElementById('maintenance-error');
  const successEl = document.getElementById('maintenance-success');
  const saveBtn   = document.getElementById('maintenance-save-btn');
  errorEl.hidden   = true;
  successEl.hidden = true;

  const text = {};
  LANGS.forEach(l => {
    // Plain text only: the public page renders it via textContent.
    text[l] = document.getElementById(`maintenance-text-${l}`).value.trim().slice(0, 500);
  });

  saveBtn.disabled = true;
  try {
    await setDoc(doc(db, 'site_content', 'maintenance'), {
      enabled: enabledEl.checked,
      text,
      updatedAt: serverTimestamp()
    });
    await writeAuditLog('maintenance_update', 'maintenance', enabledEl.checked ? 'on' : 'off');
    successEl.hidden = false;
  } catch (err) {
    showError(errorEl, err.message);
  } finally {
    saveBtn.disabled = false;
  }
}
