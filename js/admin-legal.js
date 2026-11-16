import { db } from './firebase-config.js';
import { doc, getDoc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { initAuthGate, showError, writeAuditLog, t } from './admin-shared.js';

const LANGS = ['de', 'en', 'ta'];
const PAGES = ['impressum', 'datenschutz'];

const editor   = document.getElementById('legal-editor');
const source   = document.getElementById('legal-source');
const errorEl  = document.getElementById('legal-error');
const successEl = document.getElementById('legal-success');

// Working copy of all saved texts: state[page][lang] = html string
const state = { impressum: { de: '', en: '', ta: '' }, datenschutz: { de: '', en: '', ta: '' } };
let page = 'impressum';
let lang = 'de';
let sourceMode = false;

// ── Editor <-> state ────────────────────────────────────────────────────────
function currentHtml() {
  return sourceMode ? source.value : editor.innerHTML;
}
// Default (static) text per page+lang, cached once fetched.
const defaults = {};
let showToken = 0;

function clean(html) {
  return DOMPurify.sanitize(html).trim();
}
// Saves the editor content into state. Text identical to the default is
// stored as '' (= "no override": the website keeps using the default).
function stash() {
  const key = `${page}:${lang}`;
  const current = clean(currentHtml());
  state[page][lang] = (key in defaults && current === defaults[key]) ? '' : current;
}
// Shows the saved text, or the default text when nothing is saved.
async function show() {
  const token = ++showToken;
  let html = state[page][lang] || '';
  if (!html) {
    const key = `${page}:${lang}`;
    try {
      if (!(key in defaults)) defaults[key] = clean(await loadRendered());
      html = defaults[key];
    } catch (err) {
      showError(errorEl, err.message);
    }
  }
  if (token !== showToken) return; // a newer tab switch won
  editor.innerHTML = DOMPurify.sanitize(html);
  source.value = html;
}

// ── Tabs ────────────────────────────────────────────────────────────────────
function bindTabs(containerId, attr, onChange) {
  const tabs = document.querySelectorAll(`#${containerId} .admin-lang-tab`);
  tabs.forEach(tab => tab.addEventListener('click', () => {
    stash();
    tabs.forEach(x => x.classList.remove('active'));
    tab.classList.add('active');
    onChange(tab.dataset[attr]);
    successEl.hidden = true;
    show();
  }));
}
bindTabs('legal-page-tabs', 'page', v => { page = v; });
bindTabs('legal-lang-tabs', 'lang', v => { lang = v; });

// ── Toolbar ─────────────────────────────────────────────────────────────────
document.getElementById('legal-toolbar').addEventListener('click', e => {
  const btn = e.target.closest('button[data-cmd]');
  if (!btn || sourceMode) return;
  editor.focus();
  switch (btn.dataset.cmd) {
    case 'h2': document.execCommand('formatBlock', false, 'h2'); break;
    case 'h3': document.execCommand('formatBlock', false, 'h3'); break;
    case 'p':  document.execCommand('formatBlock', false, 'p'); break;
    case 'bold': document.execCommand('bold'); break;
    case 'italic': document.execCommand('italic'); break;
    case 'ul': document.execCommand('insertUnorderedList'); break;
    case 'ol': document.execCommand('insertOrderedList'); break;
    case 'undo': document.execCommand('undo'); break;
    case 'redo': document.execCommand('redo'); break;
    case 'link': {
      const url = window.prompt('Link (https://… oder mailto:…)');
      if (url && /^(https?:|mailto:|tel:)/i.test(url.trim())) {
        document.execCommand('createLink', false, url.trim());
      }
      break;
    }
  }
});

document.getElementById('legal-source-toggle').addEventListener('click', () => {
  if (sourceMode) {
    editor.innerHTML = DOMPurify.sanitize(source.value);
  } else {
    source.value = editor.innerHTML;
  }
  sourceMode = !sourceMode;
  editor.hidden = sourceMode;
  source.hidden = !sourceMode;
});

// Paste as plain text so pasted web/Word markup cannot bring in stray styles.
editor.addEventListener('paste', e => {
  e.preventDefault();
  const text = (e.clipboardData || window.clipboardData).getData('text/plain');
  document.execCommand('insertText', false, text);
});

// ── Load default (currently rendered text of the static page) ───────────────
async function loadRendered() {
  const [pageRes, trRes] = await Promise.all([
    fetch(`${page}.html`, { cache: 'no-store' }),
    fetch(`i18n/${lang}.json`, { cache: 'no-store' })
  ]);
  const doc_ = new DOMParser().parseFromString(await pageRes.text(), 'text/html');
  const tr = await trRes.json();
  doc_.querySelectorAll('[data-i18n]').forEach(el => {
    const value = el.getAttribute('data-i18n').split('.').reduce((o, k) => (o ? o[k] : null), tr);
    if (value) el.innerHTML = value;
    el.removeAttribute('data-i18n');
  });
  const container = doc_.querySelector('.legal-content');
  return container ? container.innerHTML : '';
}

document.getElementById('legal-load-btn').addEventListener('click', async () => {
  errorEl.hidden = true;
  try {
    // Copies the static default text (page + i18n) of the selected language.
    const key = `${page}:${lang}`;
    defaults[key] = clean(await loadRendered());
    state[page][lang] = '';
    await show();
  } catch (err) {
    showError(errorEl, err.message);
  }
});

document.getElementById('legal-reset-btn').addEventListener('click', () => {
  if (!window.confirm(t('admin.legal_reset_confirm'))) return;
  state[page][lang] = '';
  show();
});

// ── Save ────────────────────────────────────────────────────────────────────
document.getElementById('legal-save-btn').addEventListener('click', async () => {
  errorEl.hidden = true;
  successEl.hidden = true;
  stash();
  const btn = document.getElementById('legal-save-btn');
  btn.disabled = true;
  try {
    const html = {};
    LANGS.forEach(l => { html[l] = clean(state[page][l] || ''); });
    await setDoc(doc(db, 'site_content', `legal_${page}`), { html, updatedAt: serverTimestamp() });
    await writeAuditLog('legal_update', `legal_${page}`, lang);
    LANGS.forEach(l => { state[page][l] = html[l]; });
    show();
    successEl.hidden = false;
  } catch (err) {
    showError(errorEl, err.message);
  } finally {
    btn.disabled = false;
  }
});

// ── Init ────────────────────────────────────────────────────────────────────
initAuthGate(async () => {
  try {
    await Promise.all(PAGES.map(async p => {
      const snap = await getDoc(doc(db, 'site_content', `legal_${p}`));
      const html = snap.exists() ? snap.data().html || {} : {};
      LANGS.forEach(l => { state[p][l] = typeof html[l] === 'string' ? html[l] : ''; });
    }));
  } catch (err) {
    console.warn('Could not load legal texts:', err.message);
  }
  show();
});
