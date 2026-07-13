import { db } from './firebase-config.js';
import { doc, getDoc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { initAuthGate, showError, writeAuditLog } from './admin-shared.js';

setupLangTabs('hours-field', 'hours-lang-tabs');
setupLangTabs('address-field', 'address-lang-tabs');
document.getElementById('contact-save-btn').addEventListener('click', () => saveContact());

initAuthGate(async () => {
  await loadContact();
});

function setupLangTabs(fieldWrapperId, tabsId) {
  const wrapper = document.getElementById(fieldWrapperId);
  const tabs = document.querySelectorAll(`#${tabsId} .admin-lang-tab`);
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

async function loadContact() {
  try {
    const docSnap = await getDoc(doc(db, 'site_content', 'contact'));
    const data = docSnap.exists() ? docSnap.data() : null;
    if (!data) return;

    document.getElementById('contact-email').value  = data.email  || '';
    document.getElementById('contact-phone1').value = data.phone1 || '';
    document.getElementById('contact-phone2').value = data.phone2 || '';
    document.getElementById('hours-de').value   = data.hours?.de   || '';
    document.getElementById('hours-en').value   = data.hours?.en   || '';
    document.getElementById('hours-ta').value   = data.hours?.ta   || '';
    document.getElementById('address-de').value = data.address?.de || '';
    document.getElementById('address-en').value = data.address?.en || '';
    document.getElementById('address-ta').value = data.address?.ta || '';
  } catch (err) {
    console.warn('Could not load contact data:', err.message);
  }
}

async function saveContact() {
  const errorEl   = document.getElementById('contact-error');
  const successEl = document.getElementById('contact-success');
  const saveBtn   = document.getElementById('contact-save-btn');
  errorEl.hidden   = true;
  successEl.hidden = true;

  const payload = {
    email:  DOMPurify.sanitize(document.getElementById('contact-email').value.trim()),
    phone1: DOMPurify.sanitize(document.getElementById('contact-phone1').value.trim()),
    phone2: DOMPurify.sanitize(document.getElementById('contact-phone2').value.trim()),
    hours: {
      de: DOMPurify.sanitize(document.getElementById('hours-de').value),
      en: DOMPurify.sanitize(document.getElementById('hours-en').value),
      ta: DOMPurify.sanitize(document.getElementById('hours-ta').value)
    },
    address: {
      de: DOMPurify.sanitize(document.getElementById('address-de').value),
      en: DOMPurify.sanitize(document.getElementById('address-en').value),
      ta: DOMPurify.sanitize(document.getElementById('address-ta').value)
    },
    updatedAt: serverTimestamp()
  };

  saveBtn.disabled = true;
  try {
    await setDoc(doc(db, 'site_content', 'contact'), payload);
    await writeAuditLog('contact_update', 'contact', '');
    successEl.hidden = false;
  } catch (err) {
    showError(errorEl, err.message);
  } finally {
    saveBtn.disabled = false;
  }
}
