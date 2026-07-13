# Admin Contact & Location Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new admin-managed "Kontakt & Öffnungszeiten" page so email, two phone numbers, opening hours (DE/EN/TA), and address (DE/EN/TA) can be edited without a code deploy, with the public homepage reading and displaying those values (falling back to the existing static i18n text until the admin saves for the first time).

**Architecture:** A new Firestore singleton doc `site_content/contact` holds the editable fields. A new admin page (`admin-contact.html` + `js/admin-contact.js`) reuses the existing (previously unused) `.admin-lang-tabs`/`.admin-title-pane` CSS for the two multi-language fields. The public site (`js/main.js`) fetches this doc once at load and overrides specific DOM text nodes in `#location` for the active language, re-applying on every language switch — no changes to the i18n JSON files themselves, which remain the day-one fallback content.

**Tech Stack:** Same as the rest of the admin panel — vanilla JS ES modules, Firebase Firestore SDK, no test framework (frontend, matches the rest of this codebase — verification is manual).

## Global Constraints

- `hours` and `address` are per-language objects (`{ de, en, ta }`); `email`, `phone1`, `phone2` are language-independent.
- No rich-text editor — plain `<textarea>`, admin types `<br>` manually for line breaks, matching the existing i18n text convention (e.g. `"Rötenbacher Str. 33<br>88364 Wolfegg..."`).
- Public site must never show a visible error or broken layout if the Firestore doc doesn't exist yet or a read fails — silently keep the existing static text.
- Reuse existing i18n keys where they already say the right thing (`admin.email_label` = "E-Mail" is reused as-is); only add new keys where nothing existing fits.

---

### Task 1: Firestore rules for `site_content`

**Files:**
- Modify: `firestore.rules`

**Interfaces:**
- Produces: Firestore path `site_content/{doc}` — public read (`allow read: if true`, needed since the homepage loads without login), admin-only write. Consumed by Task 4 (admin write) and Task 6 (public read).

- [ ] **Step 1: Add the `site_content` rule**

Current `firestore.rules` has these `match` blocks inside `service cloud.firestore { match /databases/{database}/documents { ... } }`: `seasonal_pdfs`, `main_menu`, `rate_limits`, `admins`, `audit_logs`. Add a new block (e.g. right after `main_menu`):

```
    match /site_content/{doc} {
      allow read: if true;
      allow create, update, delete: if isAdmin();
    }
```

- [ ] **Step 2: Validate rules syntax**

Run: `cd "/Users/tujiiprince/develop/Business/i2bit/srilanka_et_italy/srilanka-et-italy.github.io" && firebase deploy --only firestore:rules --dry-run`
Expected: `✔ cloud.firestore: rules file firestore.rules compiled successfully` (or run a real deploy if the installed CLI doesn't support `--dry-run` — rules changes only take effect once actually deployed, which is a separate, later, user-confirmed step, not part of this task).

- [ ] **Step 3: Commit**

```bash
cd "/Users/tujiiprince/develop/Business/i2bit/srilanka_et_italy/srilanka-et-italy.github.io"
git add firestore.rules
git commit -m "$(cat <<'EOF'
Add Firestore rule for site_content (public read, admin write)

Prepares access control for the upcoming admin-managed contact and
opening-hours feature: publicly readable (the homepage loads without
auth), admin-only write.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: i18n keys

**Files:**
- Modify: `i18n/de.json`, `i18n/en.json`, `i18n/ta.json`

**Interfaces:**
- Produces: new keys under `admin.*` consumed by Task 4's markup (`data-i18n="admin.contact_title"` etc.) and Task 5's launcher markup (`data-i18n="admin.launcher_category_contact"`).
- Consumes: existing key `admin.email_label` (reused as-is, no change needed).

- [ ] **Step 1: Add keys to `i18n/de.json`**

Inside the existing `"admin": { ... }` object, add (e.g. right after `"launcher_category"`):

```json
    "launcher_category_contact": "Kontakt & Standort",
    "contact_title": "Kontakt & Öffnungszeiten",
    "phone1_label": "Telefon 1",
    "phone2_label": "Telefon 2",
    "hours_field_label": "Öffnungszeiten",
    "address_field_label": "Adresse",
    "contact_save_btn": "Speichern",
    "contact_success": "Kontaktdaten gespeichert.",
```

- [ ] **Step 2: Add keys to `i18n/en.json`**

```json
    "launcher_category_contact": "Contact & Location",
    "contact_title": "Contact & Opening Hours",
    "phone1_label": "Phone 1",
    "phone2_label": "Phone 2",
    "hours_field_label": "Opening Hours",
    "address_field_label": "Address",
    "contact_save_btn": "Save",
    "contact_success": "Contact details saved.",
```

- [ ] **Step 3: Add keys to `i18n/ta.json`**

```json
    "launcher_category_contact": "தொடர்பு & இருப்பிடம்",
    "contact_title": "தொடர்பு & திறக்கும் நேரம்",
    "phone1_label": "தொலைபேசி 1",
    "phone2_label": "தொலைபேசி 2",
    "hours_field_label": "திறக்கும் நேரம்",
    "address_field_label": "முகவரி",
    "contact_save_btn": "சேமி",
    "contact_success": "தொடர்பு விவரங்கள் சேமிக்கப்பட்டன.",
```

- [ ] **Step 4: Validate JSON syntax**

Run: `cd "/Users/tujiiprince/develop/Business/i2bit/srilanka_et_italy/srilanka-et-italy.github.io" && python3 -c "import json; [json.load(open(f'i18n/{l}.json')) for l in ('de','en','ta')]; print('OK')"`
Expected: `OK`.

- [ ] **Step 5: Commit**

```bash
cd "/Users/tujiiprince/develop/Business/i2bit/srilanka_et_italy/srilanka-et-italy.github.io"
git add i18n/de.json i18n/en.json i18n/ta.json
git commit -m "$(cat <<'EOF'
Add admin contact-page translation keys (DE/EN/TA)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: CSS — textarea styling + multi-category launcher spacing

**Files:**
- Modify: `css/admin.css`

**Interfaces:**
- Produces: `.admin-field textarea` styling (matching existing `.admin-field input`); a `.launcher-wrap` spacing rule so a second stacked category doesn't visually collide with the first.
- Consumes: existing `.admin-field`, `.launcher-category`, `.launcher-grid` rules already in the file (read them first — don't guess at exact current values).

- [ ] **Step 1: Add textarea styling**

Find the existing rule:

```css
.admin-field input,
.admin-field select {
  padding: .75rem 1rem;
  border: 1.5px solid var(--border, #E8DFD0);
  ...
}
```

Change the selector to also include `textarea`:

```css
.admin-field input,
.admin-field select,
.admin-field textarea {
```

(Only change the selector line — leave the rest of that rule block's declarations untouched.) Then find the matching `:focus` rule:

```css
.admin-field input:focus,
.admin-field select:focus {
```

and change it the same way:

```css
.admin-field input:focus,
.admin-field select:focus,
.admin-field textarea:focus {
```

Then add a new rule right after (for textarea-specific sizing, since inputs use `min-height: 48px` which is too short for multi-line text):

```css
.admin-field textarea {
  min-height: 90px;
  resize: vertical;
  font-family: 'Outfit', sans-serif;
  line-height: 1.5;
}
```

- [ ] **Step 2: Add spacing for a second stacked launcher category**

Read the current `.launcher-wrap` rule (it currently centers a single category vertically via `min-height` + flex). Since `admin.html` will gain a second `.launcher-category` + `.launcher-grid` pair in Task 5, add a gap between repeated category blocks:

```css
.launcher-wrap .launcher-category:not(:first-child) {
  margin-top: 2.5rem;
}
```

- [ ] **Step 3: Verify no syntax errors**

Run: `cd "/Users/tujiiprince/develop/Business/i2bit/srilanka_et_italy/srilanka-et-italy.github.io" && python3 -c "
css = open('css/admin.css').read()
assert css.count('{') == css.count('}')
print('OK')
"`
Expected: `OK`.

- [ ] **Step 4: Commit**

```bash
cd "/Users/tujiiprince/develop/Business/i2bit/srilanka_et_italy/srilanka-et-italy.github.io"
git add css/admin.css
git commit -m "$(cat <<'EOF'
Add textarea styling and multi-category launcher spacing

Prep for the contact-page form (multi-line hours/address fields)
and the launcher's second category, added in later tasks.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `admin-contact.html` + `js/admin-contact.js`

**Files:**
- Create: `admin-contact.html`
- Create: `js/admin-contact.js`

**Interfaces:**
- Consumes: `t`, `initAuthGate`, `showError`, `writeAuditLog` from `js/admin-shared.js`; `admin.contact_title`, `admin.phone1_label`, `admin.phone2_label`, `admin.hours_field_label`, `admin.address_field_label`, `admin.contact_save_btn`, `admin.contact_success` (Task 2); `admin.email_label`, `admin.title_label` — wait, do NOT use `title_label`, use plain field labels as specified below (reused key is only `admin.email_label`); `.admin-lang-tabs`/`.admin-lang-tab`/`.admin-title-pane` CSS (already exists in `css/admin.css`, unused until now) and the textarea styling from Task 3.
- Produces: nothing consumed by later tasks except being a valid link target for Task 5.

This page is not yet linked from anywhere — it's reachable only by its own URL until Task 5 adds the launcher tile. It cannot break the live site.

- [ ] **Step 1: Create `admin-contact.html`**

```html
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Kontakt &amp; Öffnungszeiten — Admin — Sri Lanka ET Italy</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=Outfit:wght@300;400;500;600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="css/main.css">
  <link rel="stylesheet" href="css/admin.css">
  <link rel="icon" type="image/x-icon" href="assets/favicon.ico">
  <meta name="robots" content="noindex, nofollow">
</head>
<body>

  <!-- Login Screen -->
  <div id="login-screen" class="admin-login-screen">
    <div class="admin-login-card">
      <p class="admin-login-eyebrow">Sri Lanka ET Italy</p>
      <h1 class="admin-login-title" data-i18n="admin.login_title">Admin Login</h1>

      <div class="admin-lang-switch">
        <button class="admin-lang-btn active" data-lang="de">DE</button>
        <button class="admin-lang-btn" data-lang="en">EN</button>
        <button class="admin-lang-btn" data-lang="ta">TA</button>
      </div>

      <form id="login-form" novalidate>
        <div class="admin-field">
          <label for="email" data-i18n="admin.email_label">E-Mail</label>
          <input type="email" id="email" autocomplete="email" required>
        </div>
        <div class="admin-field">
          <label for="password" data-i18n="admin.password_label">Passwort</label>
          <div class="admin-password-wrap">
            <input type="password" id="password" autocomplete="current-password" required>
            <button type="button" id="toggle-password" class="admin-pw-toggle" aria-label="Passwort anzeigen">👁</button>
          </div>
        </div>
        <p id="login-error" class="admin-error" hidden></p>
        <button type="submit" class="btn-dark admin-submit" data-i18n="admin.login_btn">Anmelden</button>
      </form>
    </div>
  </div>

  <!-- Admin Panel (hidden until authenticated) -->
  <div id="admin-panel" class="admin-panel" hidden>
    <header class="admin-header">
      <div class="admin-header-brand">
        <a href="admin.html" class="tile-panel-back" aria-label="Zurück">←</a>
        <span class="admin-header-logo">Sri Lanka <em>ET</em> Italy</span>
        <span class="admin-header-badge" data-i18n="admin.header_badge">Admin</span>
      </div>
      <div class="admin-header-right">
        <div class="admin-header-langs">
          <button class="admin-lang-btn active" data-lang="de">DE</button>
          <button class="admin-lang-btn" data-lang="en">EN</button>
          <button class="admin-lang-btn" data-lang="ta">TA</button>
        </div>
        <button id="logout-btn" class="btn-outline" data-i18n="admin.logout_btn">Abmelden</button>
      </div>
    </header>
    <main class="admin-main">
      <div class="admin-panel-langs">
        <button class="admin-lang-btn active" data-lang="de">DE</button>
        <button class="admin-lang-btn" data-lang="en">EN</button>
        <button class="admin-lang-btn" data-lang="ta">TA</button>
      </div>

      <div class="admin-section">
        <div class="admin-section-header">
          <h2 class="admin-section-title" data-i18n="admin.contact_title">Kontakt &amp; Öffnungszeiten</h2>
        </div>

        <div class="admin-field">
          <label for="contact-email" data-i18n="admin.email_label">E-Mail</label>
          <input type="email" id="contact-email">
        </div>
        <div class="admin-field">
          <label for="contact-phone1" data-i18n="admin.phone1_label">Telefon 1</label>
          <input type="tel" id="contact-phone1">
        </div>
        <div class="admin-field">
          <label for="contact-phone2" data-i18n="admin.phone2_label">Telefon 2</label>
          <input type="tel" id="contact-phone2">
        </div>

        <div class="admin-field" id="hours-field">
          <label data-i18n="admin.hours_field_label">Öffnungszeiten</label>
          <div class="admin-lang-tabs" id="hours-lang-tabs">
            <button type="button" class="admin-lang-tab active" data-lang="de">DE</button>
            <button type="button" class="admin-lang-tab" data-lang="en">EN</button>
            <button type="button" class="admin-lang-tab" data-lang="ta">TA</button>
          </div>
          <div class="admin-title-pane active" data-lang-pane="de"><textarea id="hours-de" rows="3"></textarea></div>
          <div class="admin-title-pane" data-lang-pane="en"><textarea id="hours-en" rows="3"></textarea></div>
          <div class="admin-title-pane" data-lang-pane="ta"><textarea id="hours-ta" rows="3"></textarea></div>
        </div>

        <div class="admin-field" id="address-field">
          <label data-i18n="admin.address_field_label">Adresse</label>
          <div class="admin-lang-tabs" id="address-lang-tabs">
            <button type="button" class="admin-lang-tab active" data-lang="de">DE</button>
            <button type="button" class="admin-lang-tab" data-lang="en">EN</button>
            <button type="button" class="admin-lang-tab" data-lang="ta">TA</button>
          </div>
          <div class="admin-title-pane active" data-lang-pane="de"><textarea id="address-de" rows="3"></textarea></div>
          <div class="admin-title-pane" data-lang-pane="en"><textarea id="address-en" rows="3"></textarea></div>
          <div class="admin-title-pane" data-lang-pane="ta"><textarea id="address-ta" rows="3"></textarea></div>
        </div>

        <p id="contact-error" class="admin-error" hidden></p>
        <p id="contact-success" class="admin-success" hidden data-i18n="admin.contact_success">Kontaktdaten gespeichert.</p>
        <button id="contact-save-btn" type="button" class="btn-dark" data-i18n="admin.contact_save_btn">Speichern</button>
      </div>
    </main>
  </div>

  <script src="https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.1.6/purify.min.js"></script>
  <script type="module" src="js/admin-contact.js"></script>
</body>
</html>
```

Note: no `luxon` or `pdf.js` script tags — this page has no date picker and no PDF preview.

- [ ] **Step 2: Create `js/admin-contact.js`**

```js
import { db } from './firebase-config.js';
import { doc, getDoc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { t, initAuthGate, showError, writeAuditLog } from './admin-shared.js';

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
    errorEl.textContent = err.message;
    errorEl.hidden = false;
  } finally {
    saveBtn.disabled = false;
  }
}
```

Note: `DOMPurify.sanitize` on the `hours`/`address` textarea values will strip any tags DOMPurify doesn't allow by default — its default config permits common safe inline tags including `<br>`, so the existing `<br>`-based line-break convention keeps working. Do not add extra `ADD_TAGS` config here; the default allowlist is sufficient for `<br>`.

- [ ] **Step 3: Verify syntax**

Run: `cd "/Users/tujiiprince/develop/Business/i2bit/srilanka_et_italy/srilanka-et-italy.github.io" && node -c js/admin-contact.js`
Expected: no output.

- [ ] **Step 4: Manual verification**

With `npm run dev` running, open `http://localhost:3000/admin-contact.html` directly (not linked yet), log in, and confirm: the language tabs for "Öffnungszeiten" and "Adresse" switch independently of each other (clicking an EN tab in one field must not affect the other field's active tab), saving shows a success message, and reloading the page shows the previously-saved values pre-filled.

- [ ] **Step 5: Commit**

```bash
cd "/Users/tujiiprince/develop/Business/i2bit/srilanka_et_italy/srilanka-et-italy.github.io"
git add admin-contact.html js/admin-contact.js
git commit -m "$(cat <<'EOF'
Add dedicated admin-contact.html page

Standalone page for managing email/phone/hours/address, reusing the
previously-unused admin-lang-tabs CSS for the two multi-language
fields. Not yet linked from the launcher — Task 5 adds that tile.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Add the launcher tile

**Files:**
- Modify: `admin.html`

**Interfaces:**
- Consumes: `admin.launcher_category_contact`, `admin.contact_title` (Task 2); links to `admin-contact.html` (Task 4); `.launcher-category`/`.launcher-grid`/`.launcher-tile`/`.launcher-tile-icon`/`.launcher-tile-label` CSS (already exists, including the Task 3 spacing addition for a second category block).

- [ ] **Step 1: Add the second category + tile**

Find the existing single `.launcher-category` + `.launcher-grid` block inside `.launcher-wrap` in `admin.html` (added by a prior plan, holding "Hauptspeisekarte"/"Header-Flyer"). Add a second category block immediately after the closing `</div>` of the existing `.launcher-grid`, still inside `.launcher-wrap`:

```html
        <div class="launcher-category" data-i18n="admin.launcher_category_contact">Kontakt &amp; Standort</div>
        <div class="launcher-grid">
          <a href="admin-contact.html" class="launcher-tile">
            <div class="launcher-tile-icon">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 21s7-6.1 7-11a7 7 0 10-14 0c0 4.9 7 11 7 11z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
                <circle cx="12" cy="10" r="2.25" stroke="currentColor" stroke-width="1.4"/>
              </svg>
            </div>
            <span class="launcher-tile-label" data-i18n="admin.contact_title">Kontakt &amp; Öffnungszeiten</span>
          </a>
        </div>
```

This new tile uses the plain (non-`--custom`) icon style — a simple stroke-based map-pin, consistent with how the launcher looked before the two illustrated icons were added; it does not need the `launcher-tile-icon--custom` modifier since it's simple line art on the standard dark square, not a self-contained illustration.

- [ ] **Step 2: Verify well-formed HTML**

Run: `cd "/Users/tujiiprince/develop/Business/i2bit/srilanka_et_italy/srilanka-et-italy.github.io" && python3 -c "
import re
html = open('admin.html').read()
opens = len(re.findall(r'<div\b', html))
closes = len(re.findall(r'</div>', html))
print('div open:', opens, 'div close:', closes)
assert opens == closes
print('OK')
"`
Expected: `OK`.

- [ ] **Step 3: Manual verification**

With `npm run dev` running, open `http://localhost:3000/admin.html`, log in, confirm both categories now show ("Speisekarten" with its two existing tiles, then "Kontakt & Standort" with the new tile below it, with visible spacing between the two groups), and clicking the new tile navigates to `admin-contact.html`.

- [ ] **Step 4: Commit**

```bash
cd "/Users/tujiiprince/develop/Business/i2bit/srilanka_et_italy/srilanka-et-italy.github.io"
git add admin.html
git commit -m "$(cat <<'EOF'
Add "Kontakt & Standort" category to the launcher

Links the new admin-contact.html page from admin.html.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Public site reads admin-managed contact data

**Files:**
- Modify: `js/main.js`

**Interfaces:**
- Consumes: Firestore doc `site_content/contact` (Task 1's rules, Task 4's writer); existing `db` import, existing `i18n`/`App` class structure in this file.
- Produces: nothing consumed by later tasks — this is the last task.

- [ ] **Step 1: Extend the Firestore import**

Current:

```js
import {
  collection, query, where, orderBy, getDocs, Timestamp
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
```

New (adds `doc`, `getDoc`):

```js
import {
  collection, query, where, orderBy, getDocs, doc, getDoc, Timestamp
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
```

- [ ] **Step 2: Add a `contactData` field and load it in parallel with components**

Current `App` constructor and `init()`:

```js
class App {
    constructor() {
        this.i18n = new I18n();
        this.components = [
            { id: 'nav-placeholder',      file: 'components/nav.html' },
            { id: 'hero-placeholder',     file: 'components/hero.html' },
            { id: 'about-placeholder',    file: 'components/about.html' },
            { id: 'club-placeholder',     file: 'components/club.html' },
            { id: 'menu-placeholder',     file: 'components/menu.html' },
            { id: 'location-placeholder', file: 'components/location.html' },
            { id: 'footer-placeholder',   file: 'components/footer.html' }
        ];
        this._carouselTimer = null;
    }

    async init() {
        await Promise.all(this.components.map(c => this.loadComponent(c.id, c.file)));
        await this.i18n.init();
        this.setupAnimations();
        this.setupEventListeners();
        await this.setupSeasonalCarousel();
    }
```

New:

```js
class App {
    constructor() {
        this.i18n = new I18n();
        this.contactData = null;
        this.components = [
            { id: 'nav-placeholder',      file: 'components/nav.html' },
            { id: 'hero-placeholder',     file: 'components/hero.html' },
            { id: 'about-placeholder',    file: 'components/about.html' },
            { id: 'club-placeholder',     file: 'components/club.html' },
            { id: 'menu-placeholder',     file: 'components/menu.html' },
            { id: 'location-placeholder', file: 'components/location.html' },
            { id: 'footer-placeholder',   file: 'components/footer.html' }
        ];
        this._carouselTimer = null;
    }

    async init() {
        await Promise.all([
            Promise.all(this.components.map(c => this.loadComponent(c.id, c.file))),
            this.loadContactData()
        ]);
        await this.i18n.init();
        this.applyContactOverrides();
        this.setupAnimations();
        this.setupEventListeners();
        await this.setupSeasonalCarousel();
    }

    async loadContactData() {
        try {
            const snap = await getDoc(doc(db, 'site_content', 'contact'));
            this.contactData = snap.exists() ? snap.data() : null;
        } catch (err) {
            console.warn('Could not load contact data:', err);
            this.contactData = null;
        }
    }

    applyContactOverrides() {
        const data = this.contactData;
        if (!data) return;
        const lang = this.i18n.lang;

        const hoursEl = document.querySelector('[data-i18n="location.hours_desc"]');
        if (hoursEl && data.hours?.[lang]) hoursEl.innerHTML = data.hours[lang];

        document.querySelectorAll('[data-i18n="location.address_desc"]').forEach(el => {
            if (data.address?.[lang]) el.innerHTML = data.address[lang];
        });

        const emailLink = document.querySelector('#location a[href^="mailto:"]');
        if (emailLink && data.email) {
            emailLink.textContent = data.email;
            emailLink.href = `mailto:${data.email}`;
        }

        const telLinks = document.querySelectorAll('#location a[href^="tel:"]');
        if (telLinks[0] && data.phone1) {
            telLinks[0].textContent = data.phone1;
            telLinks[0].href = `tel:${data.phone1.replace(/\s+/g, '')}`;
        }
        if (telLinks[1] && data.phone2) {
            telLinks[1].textContent = data.phone2;
            telLinks[1].href = `tel:${data.phone2.replace(/\s+/g, '')}`;
        }
    }
```

Note: `#location a[href^="mailto:"]`/`#location a[href^="tel:"]` select by the ORIGINAL static `href` prefix, which still matches after `loadComponent`'s `outerHTML` swap (that swap happens before this runs, so `#location` exists with its original static links at the time these selectors run) — this works whether or not `applyContactOverrides` has already rewritten the `href` on a later call (language switch), since a `tel:`/`mailto:`-prefixed href stays prefixed after being rewritten to a new number/address.

- [ ] **Step 3: Re-apply on language switch**

Current (in `setupEventListeners`):

```js
    setupEventListeners() {
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('lang-btn')) {
                const lang = e.target.getAttribute('data-lang');
                this.i18n.setLanguage(lang);
            }
        });
```

New:

```js
    setupEventListeners() {
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('lang-btn')) {
                const lang = e.target.getAttribute('data-lang');
                this.i18n.setLanguage(lang).then(() => this.applyContactOverrides());
            }
        });
```

- [ ] **Step 4: Verify syntax**

Run: `cd "/Users/tujiiprince/develop/Business/i2bit/srilanka_et_italy/srilanka-et-italy.github.io" && node -c js/main.js`
Expected: no output.

- [ ] **Step 5: Manual verification**

1. With no `site_content/contact` doc yet (fresh state): load the homepage (`npm run dev`, `http://localhost:3000`), confirm the "Öffnungszeiten"/"Adresse"/contact section looks exactly as before (static fallback text, unchanged).
2. Save some contact data via `admin-contact.html` (all three languages for hours/address, plus email/phone1/phone2).
3. Reload the homepage — confirm the new values now appear for the default language.
4. Switch languages via the site's language switcher — confirm hours/address text updates to the corresponding language's saved value, and the switch doesn't require a page reload.
5. Confirm the email/phone links' `href` attributes actually point at the saved values (inspect the rendered link, not just its visible text).

- [ ] **Step 6: Commit**

```bash
cd "/Users/tujiiprince/develop/Business/i2bit/srilanka_et_italy/srilanka-et-italy.github.io"
git add js/main.js
git commit -m "$(cat <<'EOF'
Read admin-managed contact/hours/address on the public site

Loads site_content/contact once at init and overrides the relevant
#location text/links for the active language, re-applying on every
language switch. Falls back silently to the existing static i18n
text if the doc doesn't exist yet or the read fails.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Post-plan deployment note

None of these 6 tasks deploy to production automatically. Once all tasks are committed, a real deploy is needed: `firebase deploy --only firestore:rules,hosting` (rules changed in Task 1, everything else is Hosting-served static content). This is a production-affecting action requiring explicit user confirmation before running.
