import { db } from './firebase-config.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

/**
 * Replaces the static legal text with the version saved in the admin
 * (Firestore site_content/legal_<page>, html.<lang>). Falls back silently to
 * the static text when nothing is saved or Firestore is unreachable.
 */
export async function applyLegalOverride(page, lang) {
  try {
    const snap = await getDoc(doc(db, 'site_content', `legal_${page}`));
    const html = snap.exists() ? snap.data()?.html?.[lang] : '';
    if (typeof html !== 'string' || !html.trim()) return;
    const container = document.querySelector('.legal-content');
    if (!container) return;
    container.innerHTML = DOMPurify.sanitize(html);
  } catch { /* keep static text */ }
}
