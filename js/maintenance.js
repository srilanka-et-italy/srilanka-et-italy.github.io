import { db } from './firebase-config.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const TEXTS = {
  de: { title: 'Wartungsarbeiten', fallback: 'Unsere Website wird gerade gewartet. Bitte versuchen Sie es später erneut.', imprint: 'Impressum', privacy: 'Datenschutz' },
  en: { title: 'Maintenance', fallback: 'Our website is currently undergoing maintenance. Please try again later.', imprint: 'Legal notice', privacy: 'Privacy' },
  ta: { title: 'பராமரிப்பு', fallback: 'எங்கள் இணையதளம் தற்போது பராமரிப்பில் உள்ளது. பின்னர் மீண்டும் முயற்சிக்கவும்.', imprint: 'சட்ட அறிவிப்பு', privacy: 'தனியுரிமை' }
};

/** Shows a full-page maintenance overlay when Firestore site_content/maintenance has enabled=true (set in the admin). */
export async function checkMaintenance() {
  try {
    const snap = await getDoc(doc(db, 'site_content', 'maintenance'));
    const data = snap.exists() ? snap.data() : null;
    if (!data || data.enabled !== true) return;

    let lang = 'de';
    try { lang = localStorage.getItem('lang') || 'de'; } catch { /* ignore */ }
    if (!TEXTS[lang]) lang = 'de';
    const t = TEXTS[lang];
    const custom = typeof data.text?.[lang] === 'string' ? data.text[lang] : '';

    const overlay = document.createElement('div');
    overlay.id = 'maintenance-overlay';
    overlay.setAttribute('role', 'alert');

    const h = document.createElement('h1');
    h.textContent = t.title;
    const p = document.createElement('p');
    p.textContent = custom || t.fallback;
    const nav = document.createElement('p');
    nav.className = 'maintenance-links';
    [['impressum.html', t.imprint], ['datenschutz.html', t.privacy]].forEach(([href, label]) => {
      const a = document.createElement('a');
      a.href = href;
      a.textContent = label;
      nav.appendChild(a);
    });
    overlay.append(h, p, nav);
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
  } catch { /* fetch failure: site stays visible */ }
}
