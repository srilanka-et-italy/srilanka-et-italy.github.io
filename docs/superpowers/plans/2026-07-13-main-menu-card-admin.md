# Main Menu Card Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the permanent main menu PDF (currently hard-coded in `components/menu.html`) replaceable via the admin panel, exposed at a stable public URL `/menu-card`.

**Architecture:** A new Firestore singleton doc `main_menu/current` holds the active file's metadata. A new Cloud Function `menuCard` (`functions/menuCard.js`) reads that doc and 302-redirects `/menu-card` to the current file's Storage download URL, protected by CDN caching + an IP-based Firestore rate limiter. The admin panel gets a new "Hauptspeisekarte" section (separate from the existing seasonal PDF section) that uploads a replacement file, updates the Firestore doc, and deletes the previous Storage file.

**Tech Stack:** Firebase Hosting + Cloud Functions (Node 20, `firebase-functions` v5 v1-style API, matching existing `functions/validatePDF.js` and `functions/scheduledCleanup.js`), Firestore, Firebase Storage, vanilla JS admin panel (no bundler/test framework currently in the repo — Node 20 ships `node:test`/`node:assert`, used here for the one pure-logic unit worth automated testing).

## Global Constraints

- Max file size for uploads: 2 MB (from spec, matches existing seasonal upload).
- Allowed file types: `application/pdf`, `image/png`, `image/jpeg` (from spec).
- No versioning/history: replacing a file deletes the old Storage object (from spec decision).
- `/menu-card` cache: `Cache-Control: public, max-age=120` (from spec).
- Rate limit: 60 requests / 60 seconds per hashed IP, stored in Firestore `rate_limits/{ipHash}` (from spec).
- No public Firestore read for `main_menu` or `rate_limits` — only `isAdmin()` (admin panel) and the Cloud Function (Admin SDK, bypasses rules) may access them (from spec).
- Follow existing code patterns: `functions/*.js` uses `require('firebase-functions')` v1-style API (`functions.https.onRequest`, `functions.pubsub.schedule`), not the v2 modular API.

---

### Task 1: Firestore & Storage security rules

**Files:**
- Modify: `firestore.rules`
- Modify: `storage.rules`

**Interfaces:**
- Produces: Firestore paths `main_menu/{doc}` (admin read/write only) and `rate_limits/{ip}` (no client access) become usable by later tasks. Storage path `main-menu/{fileName}` (authenticated read/write/delete, same size/type constraints as `seasonal-pdfs/{fileName}`) becomes usable by later tasks.

- [ ] **Step 1: Add `main_menu` and `rate_limits` rules to `firestore.rules`**

Current file (for reference, do not retype — just insert the two new `match` blocks shown below anywhere inside `service cloud.firestore { match /databases/{database}/documents { ... } }`, alongside the existing `seasonal_pdfs`, `admins`, `audit_logs` blocks):

```
    match /main_menu/{doc} {
      allow read: if isAdmin();
      allow create, update, delete: if isAdmin();
    }

    match /rate_limits/{ip} {
      allow read, write: if false;
    }
```

The full resulting file must read:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isAdmin() {
      return request.auth != null &&
             exists(/databases/$(database)/documents/admins/$(request.auth.uid));
    }

    match /seasonal_pdfs/{doc} {
      allow read: if true;
      allow create, update, delete: if isAdmin();
    }

    match /main_menu/{doc} {
      allow read: if isAdmin();
      allow create, update, delete: if isAdmin();
    }

    match /rate_limits/{ip} {
      allow read, write: if false;
    }

    match /admins/{userId} {
      // Only allow a user to read their own document — prevents admin enumeration
      allow read: if request.auth != null && request.auth.uid == userId;
      allow write: if false;
    }

    match /audit_logs/{log} {
      allow read: if isAdmin();
      allow create: if isAdmin() &&
                       request.resource.data.userId == request.auth.uid &&
                       request.resource.data.timestamp == request.time;
      allow update, delete: if false;
    }
  }
}
```

- [ ] **Step 2: Add `main-menu` rules to `storage.rules`**

The full resulting file must read:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /seasonal-pdfs/{fileName} {
      // Authenticated reads (admin panel); public access uses tokenised download URLs
      allow read: if request.auth != null;

      allow write: if request.auth != null &&
                      request.resource.size < 2 * 1024 * 1024 &&
                      request.resource.contentType in ['application/pdf', 'image/png', 'image/jpeg'];

      allow delete: if request.auth != null;
    }

    match /main-menu/{fileName} {
      // Authenticated reads (admin panel); public access uses tokenised download URLs
      allow read: if request.auth != null;

      allow write: if request.auth != null &&
                      request.resource.size < 2 * 1024 * 1024 &&
                      request.resource.contentType in ['application/pdf', 'image/png', 'image/jpeg'];

      allow delete: if request.auth != null;
    }
  }
}
```

- [ ] **Step 3: Validate rules syntax**

Run: `cd "/Users/tujiiprince/develop/Business/i2bit/srilanka_et_italy/srilanka-et-italy.github.io" && firebase deploy --only firestore:rules,storage --dry-run`
Expected: Output ends with something like `Dry run complete!` / `✔  Deploy complete!` for a dry run, with no rules-compilation errors. If the CLI complains "unknown option --dry-run" (older CLI versions), instead run `firebase deploy --only firestore:rules,storage` for real — this is a required deploy either way since rules changes only take effect once deployed.

- [ ] **Step 4: Commit**

```bash
cd "/Users/tujiiprince/develop/Business/i2bit/srilanka_et_italy/srilanka-et-italy.github.io"
git add firestore.rules storage.rules
git commit -m "$(cat <<'EOF'
Add Firestore/Storage rules for main_menu and rate_limits

Prepares access control for the upcoming admin-managed main menu
card feature: admin-only read/write on main_menu, no client access
to rate_limits (Cloud Function uses the Admin SDK, which bypasses
rules), and matching Storage rules for main-menu/* uploads.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Rate-limit helper with unit test

**Files:**
- Create: `functions/rateLimit.js`
- Test: `functions/rateLimit.test.js`

**Interfaces:**
- Produces: `createRateLimiter(db, opts)` → returns an async function `checkRateLimit(ipHash, now?)` that resolves to `{ allowed: boolean }`. `db` must expose `db.collection(name).doc(id).get()` (resolving `{ exists: boolean, data(): object|undefined }`) and `db.collection(name).doc(id).set(obj)` — i.e. the subset of the Firestore Admin SDK API used here. `opts` is `{ collection = 'rate_limits', windowMs = 60000, limit = 60 }`.
- Consumes: nothing from other tasks (pure module, only needs a Firestore-shaped `db`).

- [ ] **Step 1: Write the failing test**

Create `functions/rateLimit.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { createRateLimiter } = require('./rateLimit');

function fakeDb() {
  const store = new Map();
  return {
    collection(name) {
      return {
        doc(id) {
          const key = `${name}/${id}`;
          return {
            async get() {
              const data = store.get(key);
              return { exists: data !== undefined, data: () => data };
            },
            async set(val) {
              store.set(key, val);
            }
          };
        }
      };
    }
  };
}

test('allows requests under the limit', async () => {
  const db = fakeDb();
  const checkRateLimit = createRateLimiter(db, { windowMs: 60000, limit: 3 });

  const r1 = await checkRateLimit('ip-a', 1000);
  const r2 = await checkRateLimit('ip-a', 1000);
  const r3 = await checkRateLimit('ip-a', 1000);

  assert.equal(r1.allowed, true);
  assert.equal(r2.allowed, true);
  assert.equal(r3.allowed, true);
});

test('blocks requests once the limit is exceeded within the window', async () => {
  const db = fakeDb();
  const checkRateLimit = createRateLimiter(db, { windowMs: 60000, limit: 2 });

  await checkRateLimit('ip-b', 1000);
  await checkRateLimit('ip-b', 1000);
  const r3 = await checkRateLimit('ip-b', 1000);

  assert.equal(r3.allowed, false);
});

test('resets the count once the window has elapsed', async () => {
  const db = fakeDb();
  const checkRateLimit = createRateLimiter(db, { windowMs: 60000, limit: 1 });

  await checkRateLimit('ip-c', 1000);
  const blocked = await checkRateLimit('ip-c', 1000);
  const resetAllowed = await checkRateLimit('ip-c', 1000 + 60000);

  assert.equal(blocked.allowed, false);
  assert.equal(resetAllowed.allowed, true);
});

test('tracks different IPs independently', async () => {
  const db = fakeDb();
  const checkRateLimit = createRateLimiter(db, { windowMs: 60000, limit: 1 });

  const a1 = await checkRateLimit('ip-d', 1000);
  const b1 = await checkRateLimit('ip-e', 1000);

  assert.equal(a1.allowed, true);
  assert.equal(b1.allowed, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/Users/tujiiprince/develop/Business/i2bit/srilanka_et_italy/srilanka-et-italy.github.io/functions" && node --test rateLimit.test.js`
Expected: FAIL — `Error: Cannot find module './rateLimit'`

- [ ] **Step 3: Write minimal implementation**

Create `functions/rateLimit.js`:

```js
// Simple fixed-window rate limiter backed by a Firestore-shaped store.
// db must expose db.collection(name).doc(id).get()/.set() (Admin SDK subset).
function createRateLimiter(db, { collection = 'rate_limits', windowMs = 60000, limit = 60 } = {}) {
  return async function checkRateLimit(ipHash, now = Date.now()) {
    const ref = db.collection(collection).doc(ipHash);
    const snap = await ref.get();
    const data = snap.exists ? snap.data() : null;

    if (!data || now - data.windowStart >= windowMs) {
      await ref.set({ count: 1, windowStart: now });
      return { allowed: true };
    }

    if (data.count >= limit) {
      return { allowed: false };
    }

    await ref.set({ count: data.count + 1, windowStart: data.windowStart });
    return { allowed: true };
  };
}

module.exports = { createRateLimiter };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "/Users/tujiiprince/develop/Business/i2bit/srilanka_et_italy/srilanka-et-italy.github.io/functions" && node --test rateLimit.test.js`
Expected: PASS — `# pass 4`, `# fail 0`

- [ ] **Step 5: Commit**

```bash
cd "/Users/tujiiprince/develop/Business/i2bit/srilanka_et_italy/srilanka-et-italy.github.io"
git add functions/rateLimit.js functions/rateLimit.test.js
git commit -m "$(cat <<'EOF'
Add fixed-window rate limiter for menuCard function

Pure, Firestore-shaped-store logic so it's testable with node:test
without needing the Firebase emulator. Used by the /menu-card
redirect function to cap abusive traffic per hashed IP.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `menuCard` Cloud Function + hosting rewrite

**Files:**
- Create: `functions/menuCard.js`
- Modify: `functions/index.js`
- Modify: `firebase.json`

**Interfaces:**
- Consumes: `createRateLimiter` from `./rateLimit.js` (Task 2), Firestore doc `main_menu/current` (Task 1's rules; the doc itself is written by Task 6's admin upload flow — until then this function will correctly 404).
- Produces: An HTTPS Cloud Function `menuCard` exported from `functions/index.js`, reachable via Firebase Hosting at `/menu-card`.

- [ ] **Step 1: Write `functions/menuCard.js`**

```js
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const crypto = require('crypto');
const { createRateLimiter } = require('./rateLimit');

// Public, unauthenticated redirect to the current main menu PDF/image.
// Kept at a stable path so it can be linked externally (e.g. Google Business)
// without changing when the admin replaces the underlying file.
exports.menuCard = functions.https.onRequest(async (req, res) => {
  const db = admin.firestore();
  const checkRateLimit = createRateLimiter(db);

  const forwardedFor = req.headers['x-forwarded-for'];
  const ip = (typeof forwardedFor === 'string' ? forwardedFor.split(',')[0].trim() : null)
    || req.ip || 'unknown';
  const ipHash = crypto.createHash('sha256').update(ip).digest('hex');

  const { allowed } = await checkRateLimit(ipHash);
  if (!allowed) {
    res.status(429).send('Too Many Requests');
    return;
  }

  const docSnap = await db.collection('main_menu').doc('current').get();
  const data = docSnap.exists ? docSnap.data() : null;

  if (!data || !data.pdfUrl) {
    res.status(404).send('Menu not found');
    return;
  }

  res.set('Cache-Control', 'public, max-age=120');
  res.redirect(302, data.pdfUrl);
});
```

- [ ] **Step 2: Wire it into `functions/index.js`**

Current content:

```js
const admin = require('firebase-admin');
admin.initializeApp();

const { validatePDFUpload } = require('./validatePDF');
const { scheduledCleanup }  = require('./scheduledCleanup');

exports.validatePDFUpload = validatePDFUpload;
exports.scheduledCleanup  = scheduledCleanup;
```

New content:

```js
const admin = require('firebase-admin');
admin.initializeApp();

const { validatePDFUpload } = require('./validatePDF');
const { scheduledCleanup }  = require('./scheduledCleanup');
const { menuCard }          = require('./menuCard');

exports.validatePDFUpload = validatePDFUpload;
exports.scheduledCleanup  = scheduledCleanup;
exports.menuCard          = menuCard;
```

- [ ] **Step 3: Add the hosting rewrite in `firebase.json`**

Locate the `"rewrites"` array (currently):

```json
    "rewrites": [
      {
        "source": "/admin.html",
        "destination": "/admin.html"
      },
      {
        "source": "**",
        "destination": "/index.html"
      }
    ],
```

Replace with (new `/menu-card` entry inserted before the catch-all, since rewrite order matters and `**` would otherwise shadow it):

```json
    "rewrites": [
      {
        "source": "/admin.html",
        "destination": "/admin.html"
      },
      {
        "source": "/menu-card",
        "function": "menuCard"
      },
      {
        "source": "**",
        "destination": "/index.html"
      }
    ],
```

- [ ] **Step 4: Verify with the Firebase emulator**

Run: `cd "/Users/tujiiprince/develop/Business/i2bit/srilanka_et_italy/srilanka-et-italy.github.io" && firebase emulators:start --only functions,firestore,hosting`

In a second terminal, with the emulator running:

Run: `curl -i http://localhost:5000/menu-card`
Expected: `HTTP/1.1 404 Not Found` with body `Menu not found` (no `main_menu/current` doc exists yet — correct, since Task 6 is what writes it).

Then seed a doc via the Firestore emulator UI (printed in the emulator startup log, typically `http://localhost:4000/firestore`) — create collection `main_menu`, document ID `current`, field `pdfUrl` (string) = `https://example.com/test.pdf`.

Run: `curl -i http://localhost:5000/menu-card`
Expected: `HTTP/1.1 302 Found`, header `location: https://example.com/test.pdf`, header `cache-control: public, max-age=120`.

Stop the emulator (Ctrl+C) once both checks pass.

- [ ] **Step 5: Commit**

```bash
cd "/Users/tujiiprince/develop/Business/i2bit/srilanka_et_italy/srilanka-et-italy.github.io"
git add functions/menuCard.js functions/index.js firebase.json
git commit -m "$(cat <<'EOF'
Add /menu-card redirect Cloud Function

Public, rate-limited, cached 302 redirect to whatever file the admin
panel currently has set as the main menu, so external links (e.g.
Google Business) stay stable across future replacements.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: i18n translation keys

**Files:**
- Modify: `i18n/de.json`
- Modify: `i18n/en.json`
- Modify: `i18n/ta.json`

**Interfaces:**
- Produces: translation keys under `admin.*` consumed by Task 5's markup (`data-i18n="admin.main_menu_..."`) and Task 6's JS (`t('admin.main_menu_...')`).

- [ ] **Step 1: Add keys to `i18n/de.json`**

Inside the existing `"admin": { ... }` object, add these entries (e.g. right after `"upload_title"`):

```json
    "main_menu_title": "Hauptspeisekarte",
    "main_menu_empty": "Keine Hauptspeisekarte hinterlegt.",
    "main_menu_updated_label": "Zuletzt aktualisiert",
    "main_menu_file_label": "Neue Datei (max. 2 MB)",
    "main_menu_replace_btn": "Ersetzen",
    "main_menu_success": "Hauptspeisekarte aktualisiert.",
```

- [ ] **Step 2: Add keys to `i18n/en.json`**

Inside the existing `"admin": { ... }` object, add:

```json
    "main_menu_title": "Main Menu Card",
    "main_menu_empty": "No main menu card set.",
    "main_menu_updated_label": "Last updated",
    "main_menu_file_label": "New file (max. 2 MB)",
    "main_menu_replace_btn": "Replace",
    "main_menu_success": "Main menu card updated.",
```

- [ ] **Step 3: Add keys to `i18n/ta.json`**

Inside the existing `"admin": { ... }` object, add:

```json
    "main_menu_title": "முதன்மை உணவு பட்டியல்",
    "main_menu_empty": "முதன்மை உணவு பட்டியல் இதுவரை இல்லை.",
    "main_menu_updated_label": "கடைசியாக புதுப்பிக்கப்பட்டது",
    "main_menu_file_label": "புதிய கோப்பு (அதிகபட்சம் 2 MB)",
    "main_menu_replace_btn": "மாற்று",
    "main_menu_success": "முதன்மை உணவு பட்டியல் புதுப்பிக்கப்பட்டது.",
```

- [ ] **Step 4: Validate JSON syntax**

Run: `cd "/Users/tujiiprince/develop/Business/i2bit/srilanka_et_italy/srilanka-et-italy.github.io" && python3 -c "import json; [json.load(open(f'i18n/{l}.json')) for l in ('de','en','ta')]; print('OK')"`
Expected: `OK` (raises `json.decoder.JSONDecodeError` otherwise — fix trailing commas if so).

- [ ] **Step 5: Commit**

```bash
cd "/Users/tujiiprince/develop/Business/i2bit/srilanka_et_italy/srilanka-et-italy.github.io"
git add i18n/de.json i18n/en.json i18n/ta.json
git commit -m "$(cat <<'EOF'
Add main menu card translation keys (DE/EN/TA)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Admin panel UI markup

**Files:**
- Modify: `components/admin-panel.html`

**Interfaces:**
- Produces: DOM elements consumed by Task 6's JS — `#main-menu-current` (container the JS fills with either an empty-state `<p>` or a `.pdf-item`-shaped block), `#main-menu-form`, `#main-menu-file`, `#main-menu-progress-wrap`, `#main-menu-progress-fill`, `#main-menu-progress-text`, `#main-menu-error`, `#main-menu-success`.
- Consumes: existing CSS classes `.admin-section`, `.admin-section-header`, `.admin-section-title`, `.admin-field`, `.admin-upload-form`, `.upload-progress-wrap/-bar/-fill/-label`, `.admin-error`, `.admin-success`, `.pdf-item`, `.pdf-item-thumb`, `.pdf-thumb-canvas`, `.pdf-item-info`, `.pdf-item-title`, `.pdf-item-meta`, `.pdf-item-dates` (all already defined in `css/admin.css` — no new CSS needed, this section reuses the seasonal list's visual language).

- [ ] **Step 1: Insert the new section before the existing "PDF hochladen" section**

Current top of file:

```html
<div class="admin-section">
  <div class="admin-section-header">
    <h2 class="admin-section-title" data-i18n="admin.upload_title">PDF hochladen</h2>
  </div>
  <form id="upload-form" class="admin-upload-form" novalidate>
```

New content (insert this whole block immediately above that `<div class="admin-section">`):

```html
<div class="admin-section">
  <div class="admin-section-header">
    <h2 class="admin-section-title" data-i18n="admin.main_menu_title">Hauptspeisekarte</h2>
  </div>
  <div id="main-menu-current">
    <p class="pdf-list-empty" data-i18n="admin.main_menu_empty">Keine Hauptspeisekarte hinterlegt.</p>
  </div>
  <form id="main-menu-form" class="admin-upload-form" novalidate>
    <div class="admin-field">
      <label for="main-menu-file" data-i18n="admin.main_menu_file_label">Neue Datei (max. 2 MB)</label>
      <input type="file" id="main-menu-file" accept="application/pdf,image/png,image/jpeg" required>
    </div>
    <div id="main-menu-progress-wrap" class="upload-progress-wrap" hidden>
      <div class="upload-progress-bar"><div id="main-menu-progress-fill" class="upload-progress-fill"></div></div>
      <span id="main-menu-progress-text" class="upload-progress-label">0 %</span>
    </div>
    <p id="main-menu-error" class="admin-error" hidden></p>
    <p id="main-menu-success" class="admin-success" hidden data-i18n="admin.main_menu_success">Hauptspeisekarte aktualisiert.</p>
    <button type="submit" class="btn-dark" data-i18n="admin.main_menu_replace_btn">Ersetzen</button>
  </form>
</div>

```

- [ ] **Step 2: Verify the file is well-formed HTML**

Run: `cd "/Users/tujiiprince/develop/Business/i2bit/srilanka_et_italy/srilanka-et-italy.github.io" && python3 -c "
import re
html = open('components/admin-panel.html').read()
opens = re.findall(r'<div\b', html)
closes = re.findall(r'</div>', html)
print('div open:', len(opens), 'div close:', len(closes))
assert len(opens) == len(closes)
print('OK')
"`
Expected: `OK` (matching div counts).

- [ ] **Step 3: Commit**

```bash
cd "/Users/tujiiprince/develop/Business/i2bit/srilanka_et_italy/srilanka-et-italy.github.io"
git add components/admin-panel.html
git commit -m "$(cat <<'EOF'
Add main menu card section markup to admin panel

Reuses existing seasonal-list CSS classes (pdf-item, admin-section,
etc.) rather than introducing new styles.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Admin panel logic — display + upload/replace

**Files:**
- Modify: `js/admin.js`

**Interfaces:**
- Consumes: DOM elements from Task 5 (`#main-menu-current`, `#main-menu-form`, `#main-menu-file`, `#main-menu-progress-wrap`, `#main-menu-progress-fill`, `#main-menu-progress-text`, `#main-menu-error`, `#main-menu-success`); existing module-level `db`, `storage`, `i18n`, `t()`, `showError()`, `writeAuditLog()`, `renderPdfThumb()` already defined in this file; Firestore doc `main_menu/current` (Task 1's rules, Task 3's reader).
- Produces: `setupMainMenuSection()` — called once from `loadAdminPanel()` alongside the existing `setupUploadForm()` / `setupPdfList()` calls.

- [ ] **Step 1: Call the new setup function from `loadAdminPanel()`**

Current:

```js
  setupUploadForm();
  setupPdfList();
}
```

New:

```js
  setupUploadForm();
  setupPdfList();
  setupMainMenuSection();
}
```

- [ ] **Step 2: Add the display + upload/replace logic**

First, extend the existing Firestore import at the top of the file. Current:

```js
import {
  collection, doc, addDoc, updateDoc, deleteDoc, getDocs,
  query, orderBy, serverTimestamp, Timestamp, deleteField
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
```

New (adds `getDoc`, `setDoc`):

```js
import {
  collection, doc, addDoc, updateDoc, deleteDoc, deleteField, getDoc, getDocs, setDoc,
  query, orderBy, serverTimestamp, Timestamp
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
```

Then add the following new section anywhere after the existing `// ── PDF list ──...` block (e.g. right before `// ── Preview lightbox ──...`):

```js
// ── Main menu card ────────────────────────────────────────────────────────

async function setupMainMenuSection() {
  await refreshMainMenuCurrent();

  const form         = document.getElementById('main-menu-form');
  const progressWrap = document.getElementById('main-menu-progress-wrap');
  const progressFill = document.getElementById('main-menu-progress-fill');
  const progressText = document.getElementById('main-menu-progress-text');
  const errorEl      = document.getElementById('main-menu-error');
  const successEl    = document.getElementById('main-menu-success');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.hidden   = true;
    successEl.hidden = true;

    const file = document.getElementById('main-menu-file').files[0];
    if (!file) { showError(errorEl, t('admin.err_no_file')); return; }
    const allowed = ['application/pdf', 'image/png', 'image/jpeg'];
    if (!allowed.includes(file.type)) { showError(errorEl, t('admin.err_not_pdf')); return; }
    if (file.size > 2 * 1024 * 1024) { showError(errorEl, t('admin.err_too_large')); return; }

    const docRef  = doc(db, 'main_menu', 'current');
    const prevSnap = await getDoc(docRef);
    const prevData = prevSnap.exists() ? prevSnap.data() : null;

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
        form.reset();
        await refreshMainMenuCurrent();
      }
    );
  });
}

async function refreshMainMenuCurrent() {
  const container = document.getElementById('main-menu-current');
  const docSnap = await getDoc(doc(db, 'main_menu', 'current'));
  renderMainMenuCurrent(container, docSnap.exists() ? docSnap.data() : null);
}

function renderMainMenuCurrent(container, d) {
  if (!d || !d.pdfUrl) {
    container.innerHTML = `<p class="pdf-list-empty" data-i18n="admin.main_menu_empty">${t('admin.main_menu_empty')}</p>`;
    return;
  }

  const isImage = d.contentType && d.contentType.startsWith('image/');
  const updatedStr = d.updatedAt?.toDate
    ? d.updatedAt.toDate().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })
    : '';

  const item = document.createElement('div');
  item.className = 'pdf-item';
  item.innerHTML = `
    <div class="pdf-item-thumb">
      ${isImage
        ? `<img src="${DOMPurify.sanitize(d.pdfUrl)}" alt="" class="pdf-thumb-img">`
        : `<canvas class="pdf-thumb-canvas"></canvas>`}
    </div>
    <div class="pdf-item-info">
      <span class="pdf-item-title">${DOMPurify.sanitize(d.fileName || '')}</span>
      <div class="pdf-item-meta">
        <span class="pdf-item-dates">${t('admin.main_menu_updated_label')}: ${updatedStr}</span>
      </div>
    </div>`;

  container.innerHTML = '';
  container.appendChild(item);

  if (!isImage) {
    renderPdfThumb(d.pdfUrl, item.querySelector('.pdf-thumb-canvas'));
  }
  item.querySelector('.pdf-item-thumb').addEventListener('click', () => openPreview(d.pdfUrl, isImage));
}
```

- [ ] **Step 3: Manual verification against the Firebase emulator**

Run: `cd "/Users/tujiiprince/develop/Business/i2bit/srilanka_et_italy/srilanka-et-italy.github.io" && firebase emulators:start --only functions,firestore,storage,hosting,auth`

In a browser, go to `http://localhost:5000/admin.html`, log in with an admin account seeded in the auth emulator (or a real one if pointed at a real project — use the emulator to avoid touching production data), and confirm:
1. The "Hauptspeisekarte" section shows the empty state initially.
2. Uploading a small test PDF shows a progress bar, then the file appears with a thumbnail and an "updated" timestamp.
3. Uploading a second file replaces the first — check the Storage emulator UI (`http://localhost:4000/storage`) to confirm only the newest file remains under `main-menu/`.
4. Check the Firestore emulator UI (`http://localhost:4000/firestore`) — `main_menu/current` has the new `pdfUrl`/`fileName`/`contentType`/`updatedAt`, and `audit_logs` has a new entry with `action: 'main_menu_replace'`.

Stop the emulator (Ctrl+C) once all four checks pass.

- [ ] **Step 4: Commit**

```bash
cd "/Users/tujiiprince/develop/Business/i2bit/srilanka_et_italy/srilanka-et-italy.github.io"
git add js/admin.js
git commit -m "$(cat <<'EOF'
Add main menu card display + upload/replace logic to admin panel

Mirrors the seasonal upload flow (validation, progress bar, audit
log) but targets the main_menu/current singleton doc instead of the
seasonal_pdfs collection, and deletes the previous file on replace.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Point the public site at `/menu-card`

**Files:**
- Modify: `components/menu.html`
- Modify: `preview/components/menu.html`
- Modify: `preview/index.html`

**Interfaces:**
- Consumes: `/menu-card` route from Task 3 (works correctly once Task 6's upload flow populates `main_menu/current`; until then it 404s, same as any broken/missing menu link would).

- [ ] **Step 1: Update `components/menu.html`**

Current:

```html
        <a href="assets/srilanka%20et%20italy%20speisekarte.pdf" target="_blank" class="mc mc-pdf" rel="noopener">
```

New:

```html
        <a href="/menu-card" target="_blank" class="mc mc-pdf" rel="noopener">
```

- [ ] **Step 2: Update `preview/components/menu.html`**

Current (four occurrences of the same path):

```html
        <a href="../assets/srilanka%20et%20italy%20speisekarte.pdf" target="_blank" rel="noopener" data-i18n="menu.pdf_open">↗ Im neuen Tab öffnen</a>
        <a href="../assets/srilanka%20et%20italy%20speisekarte.pdf" download data-i18n="menu.pdf_download">↓ Herunterladen</a>
```
```html
        src="../assets/srilanka%20et%20italy%20speisekarte.pdf#toolbar=0&navpanes=0&scrollbar=1"
```
```html
      <a href="../assets/srilanka%20et%20italy%20speisekarte.pdf" target="_blank" rel="noopener" class="btn-glow" data-i18n="menu.pdf_open">Speisekarte öffnen</a>
```

Run this to replace all four at once:

```bash
cd "/Users/tujiiprince/develop/Business/i2bit/srilanka_et_italy/srilanka-et-italy.github.io/preview/components" && sed -i '' 's|\.\./assets/srilanka%20et%20italy%20speisekarte\.pdf|/menu-card|g' menu.html
```

Note the `download` attribute on the second occurrence no longer makes sense for a redirect target (the browser can't force a filename through a 302). Remove that attribute — after the `sed` above, find:

```html
        <a href="/menu-card" download data-i18n="menu.pdf_download">↓ Herunterladen</a>
```

Replace with:

```html
        <a href="/menu-card" target="_blank" rel="noopener" data-i18n="menu.pdf_download">↓ Herunterladen</a>
```

- [ ] **Step 3: Update `preview/index.html`**

Current:

```json
      "hasMenu": "https://srilanka-et-italy.github.io/assets/srilanka%20et%20italy%20speisekarte.pdf",
```

New:

```json
      "hasMenu": "https://srilanka-et-italy.github.io/menu-card",
```

- [ ] **Step 4: Verify no stale references remain**

Run: `cd "/Users/tujiiprince/develop/Business/i2bit/srilanka_et_italy/srilanka-et-italy.github.io" && grep -rn "srilanka%20et%20italy%20speisekarte" --include="*.html" .`
Expected: no output (empty — all references updated).

- [ ] **Step 5: Commit**

```bash
cd "/Users/tujiiprince/develop/Business/i2bit/srilanka_et_italy/srilanka-et-italy.github.io"
git add components/menu.html preview/components/menu.html preview/index.html
git commit -m "$(cat <<'EOF'
Point main menu links at the stable /menu-card redirect

Replaces the hard-coded asset path with the new admin-managed
redirect endpoint so future replacements need no code change.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Post-plan deployment note

None of these tasks deploy to production automatically. Once all 7 tasks are committed, a real deploy is needed for the feature to go live:

```bash
cd "/Users/tujiiprince/develop/Business/i2bit/srilanka_et_italy/srilanka-et-italy.github.io"
firebase deploy --only firestore:rules,storage,functions:menuCard,hosting
```

This is a production-affecting action — confirm with the user before running it.
