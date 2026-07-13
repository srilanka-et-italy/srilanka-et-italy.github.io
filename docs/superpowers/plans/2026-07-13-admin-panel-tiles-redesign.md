# Admin Panel Tiles Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the admin panel's vertical PDF list and small centered edit modal with a shared tile-grid component and a full-screen right-side panel that combines a large preview with the edit/replace form, for both the main menu card and the seasonal PDFs.

**Architecture:** One `.pdf-tile` component renders both the single main-menu tile and each seasonal-PDF tile. Clicking any tile opens one shared full-screen panel (`#tile-panel`, always present in `admin.html`, not the dynamically-loaded fragment) whose body shows a large PDF/image preview plus a type-specific field set (`#tile-seasonal-fields` or `#tile-mainmenu-fields`, toggled by `hidden`). The panel reuses all existing Firestore/Storage read-write logic (upload, save, delete, audit log) — only the DOM structure and event wiring change. A small refactor extracts the existing (already duplicated twice) date-range-picker code into one factory function so the panel's date picker doesn't become a third copy.

**Tech Stack:** Vanilla JS admin panel, Firebase Firestore/Storage SDK (already in use), pdf.js for preview rendering (already in use), no test framework for this frontend code (matches the rest of this codebase — verification is manual via the Firebase emulator + browser).

## Global Constraints

- Max file size for uploads: 2 MB. Allowed types: `application/pdf`, `image/png`, `image/jpeg` (unchanged, from existing code).
- No versioning/history for the main menu card: replacing a file deletes the old Storage object (unchanged, from prior feature).
- Seasonal PDF fields (title, date range, order) keep their exact existing validation (`err_date_order` etc.) and Firestore field names (`title`, `order`, `permanent`, `startDate`, `endDate`).
- No new Firestore/Storage rules or schema changes — this is a frontend-only redesign.
- Reuse existing i18n keys wherever the same label is reused (`admin.title_label`, `admin.date_range_label`, `admin.order_label`, `admin.delete_btn`, `admin.delete_confirm`, `admin.edit_save`, `admin.main_menu_file_label`, `admin.main_menu_replace_btn`, `admin.main_menu_success`, `admin.err_*`) — no new i18n keys should be needed.

---

### Task 1: Extract shared date-range-picker factory

**Files:**
- Modify: `js/admin.js`

**Interfaces:**
- Produces: `createDateRangePicker(ids)` — a function taking an ids config object and returning `{ syncDates(startVal, endVal) }`. Called once per date-picker instance (the upload form's, and later the panel's in Task 4). `ids` shape: `{ triggerId, pickerId, displayId, gridId, monthLabelId, hintId, clearBtnId, prevBtnId, nextBtnId, startInputId, endInputId }`.
- Consumes: nothing new — reads/writes the same DOM elements the old `setupDateRangePicker`/`setupEditDateRangePicker` did, and the same `t()` helper already in this file.

This task only touches the **upload form's** date picker (ids unchanged: `daterange-trigger`, `daterange-picker`, etc.) — it proves the factory is behaviorally identical to the old `setupDateRangePicker()` before Task 4 also points the new panel's date picker at it. The old `setupEditDateRangePicker`/`syncEditDateRangeDisplay`/`openEditModal` (which used the factory's predecessor pattern for the now-removed edit modal) are deleted in Task 4 together with the modal markup they belong to — leave them untouched here to keep this task's diff small and single-purpose.

- [ ] **Step 1: Read the current `setupDateRangePicker` function**

It's at `js/admin.js` lines 472-612 (in the file as it stands before this task). Confirm the exact current content matches what's shown below before editing — if it has drifted, adapt the replacement accordingly rather than blindly overwriting.

- [ ] **Step 2: Replace `setupDateRangePicker` with the factory + a thin wrapper call**

Remove the entire existing `setupDateRangePicker` function (the ~140-line block starting `function setupDateRangePicker() {` and ending at its matching closing `}`), and replace it with:

```js
function createDateRangePicker({
  triggerId, pickerId, displayId, gridId, monthLabelId, hintId, clearBtnId,
  prevBtnId, nextBtnId, startInputId, endInputId
}) {
  const trigger  = document.getElementById(triggerId);
  const picker   = document.getElementById(pickerId);
  const display  = document.getElementById(displayId);
  const grid     = document.getElementById(gridId);
  const label    = document.getElementById(monthLabelId);
  const hint     = document.getElementById(hintId);
  const clearBtn = document.getElementById(clearBtnId);
  const startInput = document.getElementById(startInputId);
  const endInput   = document.getElementById(endInputId);
  if (!trigger) return { syncDates() {} };

  const MONTHS = ['Januar','Februar','März','April','Mai','Juni',
                  'Juli','August','September','Oktober','November','Dezember'];
  let viewYear  = new Date().getFullYear();
  let viewMonth = new Date().getMonth();
  let startDate = null;
  let endDate   = null;

  function fmt(d) {
    return d.toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric' });
  }

  function isoDate(d, endOfDay = false) {
    const pad = n => String(n).padStart(2,'0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${endOfDay ? '23:59' : '00:00'}`;
  }

  function sameDay(a, b) {
    return a && b && a.toDateString() === b.toDateString();
  }

  function updateDisplay() {
    if (startDate && endDate) {
      display.textContent = `${fmt(startDate)} – ${fmt(endDate)}`;
      display.className = 'daterange-value';
    } else if (startDate) {
      display.textContent = `${fmt(startDate)} – ?`;
      display.className = 'daterange-value';
    } else {
      display.textContent = t('admin.date_range_placeholder') || 'Zeitraum wählen';
      display.className = 'daterange-placeholder';
    }
    startInput.value = startDate ? isoDate(startDate, false) : '';
    endInput.value   = endDate   ? isoDate(endDate, true)    : '';
  }

  function renderGrid() {
    label.textContent = `${MONTHS[viewMonth]} ${viewYear}`;
    grid.innerHTML = '';
    const today = new Date(); today.setHours(0,0,0,0);
    const firstDay = new Date(viewYear, viewMonth, 1);
    let offset = (firstDay.getDay() + 6) % 7;
    const daysInMonth  = new Date(viewYear, viewMonth+1, 0).getDate();
    const daysInPrev   = new Date(viewYear, viewMonth, 0).getDate();

    for (let i = offset - 1; i >= 0; i--) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cal-day cal-day--other-month';
      btn.textContent = daysInPrev - i;
      grid.appendChild(btn);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(viewYear, viewMonth, d);
      const btn  = document.createElement('button');
      btn.type = 'button';
      btn.textContent = d;
      let cls = 'cal-day';
      if (date < today) cls += ' cal-day--disabled';
      if (sameDay(date, today)) cls += ' cal-day--today';
      if (sameDay(date, startDate) || sameDay(date, endDate)) cls += ' cal-day--selected';
      if (startDate && endDate && date > startDate && date < endDate) cls += ' cal-day--in-range';
      if (sameDay(date, startDate) && endDate && startDate < endDate) cls += ' cal-day--in-range cal-day--range-start';
      if (sameDay(date, endDate)   && startDate && startDate < endDate) cls += ' cal-day--in-range cal-day--range-end';
      btn.className = cls;
      if (!cls.includes('disabled')) {
        btn.addEventListener('click', (e) => { e.stopPropagation(); pickDay(date); });
      }
      grid.appendChild(btn);
    }

    const total = offset + daysInMonth;
    const remaining = total % 7 === 0 ? 0 : 7 - (total % 7);
    for (let i = 1; i <= remaining; i++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cal-day cal-day--other-month';
      btn.textContent = i;
      grid.appendChild(btn);
    }

    hint.textContent = startDate && !endDate
      ? (t('admin.date_pick_end') || 'Enddatum wählen')
      : (t('admin.date_pick_start') || 'Startdatum wählen');
  }

  function pickDay(date) {
    if (!startDate || (startDate && endDate)) {
      startDate = date; endDate = null;
    } else if (date < startDate) {
      endDate = startDate; startDate = date;
    } else {
      endDate = date;
      setTimeout(() => { picker.hidden = true; trigger.classList.remove('open'); }, 200);
    }
    updateDisplay();
    renderGrid();
  }

  document.getElementById(prevBtnId).addEventListener('click', () => {
    viewMonth--; if (viewMonth < 0) { viewMonth = 11; viewYear--; } renderGrid();
  });
  document.getElementById(nextBtnId).addEventListener('click', () => {
    viewMonth++; if (viewMonth > 11) { viewMonth = 0; viewYear++; } renderGrid();
  });
  clearBtn.addEventListener('click', () => {
    startDate = null; endDate = null; updateDisplay(); renderGrid();
  });

  trigger.addEventListener('click', () => {
    const open = picker.hidden;
    picker.hidden = !open;
    trigger.classList.toggle('open', open);
    if (open) renderGrid();
  });

  document.addEventListener('click', (e) => {
    if (!trigger.contains(e.target) && !picker.contains(e.target)) {
      picker.hidden = true;
      trigger.classList.remove('open');
    }
  });

  updateDisplay();

  return {
    syncDates(startVal, endVal) {
      startDate = startVal ? new Date(startVal) : null;
      endDate   = startVal && endVal ? new Date(endVal) : null;
      if (startDate) { viewYear = startDate.getFullYear(); viewMonth = startDate.getMonth(); }
      updateDisplay();
    }
  };
}
```

- [ ] **Step 3: Point `setupUploadForm` at the factory**

In `setupUploadForm()`, current line:

```js
  setupDateRangePicker();
```

Replace with:

```js
  createDateRangePicker({
    triggerId: 'daterange-trigger', pickerId: 'daterange-picker', displayId: 'daterange-display',
    gridId: 'cal-grid', monthLabelId: 'cal-month-label', hintId: 'cal-hint', clearBtnId: 'cal-clear',
    prevBtnId: 'cal-prev', nextBtnId: 'cal-next', startInputId: 'pdf-start', endInputId: 'pdf-end'
  });
```

- [ ] **Step 4: Manual verification**

Run `npm run dev` (browser-sync, serves against the real Firebase backend — no emulator needed for this UI-only check) from the repo root, open `http://localhost:3000/admin.html`, log in, go to the "PDF hochladen" section, and confirm: clicking the date-range field still opens the calendar, picking a start then end date still shows the range in the trigger, "Löschen" still clears it, and clicking outside still closes the picker. This must behave identically to before — it's a pure refactor.

- [ ] **Step 5: Commit**

```bash
cd "/Users/tujiiprince/develop/Business/i2bit/srilanka_et_italy/srilanka-et-italy.github.io"
git add js/admin.js
git commit -m "$(cat <<'EOF'
Extract date-range-picker into a reusable factory

The upload form and the (now-replaced) edit modal each had a full,
near-identical copy of this ~140-line widget. Extracting it into
createDateRangePicker() means the upcoming tile detail panel's date
picker is a third caller, not a third copy.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: HTML restructure — tile containers + full-screen panel skeleton

**Files:**
- Modify: `components/admin-panel.html`
- Modify: `admin.html`

**Interfaces:**
- Produces: container elements `#main-menu-tile-wrap` and `#pdf-tile-grid` (Task 3 renders tiles into these); panel elements `#tile-panel`, `#tile-panel-back`, `#tile-panel-title`, `#tile-panel-preview`, `#tile-seasonal-fields` (+ `#tile-title`, `#tile-daterange-trigger`, `#tile-daterange-picker`, `#tile-cal-prev`, `#tile-cal-month-label`, `#tile-cal-next`, `#tile-cal-grid`, `#tile-cal-hint`, `#tile-cal-clear`, `#tile-pdf-start`, `#tile-pdf-end`, `#tile-order`, `#tile-seasonal-error`), `#tile-mainmenu-fields` (+ `#tile-mainmenu-file`, `#tile-mainmenu-progress-wrap`/`-fill`/`-text`, `#tile-mainmenu-error`, `#tile-mainmenu-success`), `#tile-delete-btn`, `#tile-save-btn` — all consumed by Task 4's JS.
- Consumes: `createDateRangePicker` (Task 1) will be pointed at the `tile-*` ids above in Task 4 — this task only needs to produce matching ids, not wire any JS.

This task intentionally leaves the panel and new containers **inert** (no JS renders into them yet, no click handlers) — Task 3 (CSS) and Task 4 (JS) build on top of this markup. It is expected that after this task alone, the admin panel looks broken (empty containers, no tile grid content) — that's resolved by Task 4. Don't try to "fix" this within this task.

- [ ] **Step 1: Replace `components/admin-panel.html` in full**

Current file (90 lines) has three `.admin-section` blocks: "Hauptspeisekarte" (with `#main-menu-current` + a permanent `#main-menu-form` upload form), "PDF hochladen" (`#upload-form`, unchanged by this task), and "Aktive Dateien" (`#pdf-list`).

Replace the entire file with:

```html
<div class="admin-section">
  <div class="admin-section-header">
    <h2 class="admin-section-title" data-i18n="admin.main_menu_title">Hauptspeisekarte</h2>
  </div>
  <div id="main-menu-tile-wrap"></div>
</div>

<div class="admin-section">
  <div class="admin-section-header">
    <h2 class="admin-section-title" data-i18n="admin.upload_title">PDF hochladen</h2>
  </div>
  <form id="upload-form" class="admin-upload-form" novalidate>

    <div class="admin-field">
      <label for="pdf-title" data-i18n="admin.title_label">Titel</label>
      <input type="text" id="pdf-title" maxlength="80">
    </div>

    <div class="admin-field">
      <label data-i18n="admin.date_range_label">Zeitraum (Europe/Berlin)</label>
      <div class="daterange-trigger" id="daterange-trigger" tabindex="0" role="button">
        <span class="daterange-icon">📅</span>
        <span id="daterange-display" class="daterange-placeholder" data-i18n="admin.date_range_placeholder">Zeitraum wählen</span>
      </div>
      <div id="daterange-picker" class="daterange-picker" hidden>
        <div class="cal-header">
          <button type="button" class="cal-nav" id="cal-prev">‹</button>
          <span id="cal-month-label" class="cal-month-label"></span>
          <button type="button" class="cal-nav" id="cal-next">›</button>
        </div>
        <div class="cal-weekdays">
          <span>Mo</span><span>Di</span><span>Mi</span>
          <span>Do</span><span>Fr</span><span>Sa</span><span>So</span>
        </div>
        <div class="cal-grid" id="cal-grid"></div>
        <div class="cal-footer">
          <span id="cal-hint" class="cal-hint" data-i18n="admin.date_pick_start">Startdatum wählen</span>
          <button type="button" id="cal-clear" class="cal-clear" data-i18n="admin.date_clear">Löschen</button>
        </div>
      </div>
      <!-- Hidden inputs consumed by upload logic -->
      <input type="hidden" id="pdf-start">
      <input type="hidden" id="pdf-end">
    </div>

    <div class="admin-field">
      <label for="pdf-order" data-i18n="admin.order_label">Reihenfolge</label>
      <input type="number" id="pdf-order" value="0" min="0" max="99" style="max-width:120px">
    </div>

    <div class="admin-field">
      <label for="pdf-file" data-i18n="admin.file_label">PDF-Datei (max. 2 MB)</label>
      <input type="file" id="pdf-file" accept="application/pdf,image/png,image/jpeg" required>
    </div>

    <div id="upload-progress-wrap" class="upload-progress-wrap" hidden>
      <div class="upload-progress-bar"><div id="upload-progress-fill" class="upload-progress-fill"></div></div>
      <span id="upload-progress-text" class="upload-progress-label">0 %</span>
    </div>
    <p id="upload-error" class="admin-error" hidden></p>
    <p id="upload-success" class="admin-success" hidden data-i18n="admin.upload_success">PDF erfolgreich hochgeladen.</p>
    <button type="submit" class="btn-dark" data-i18n="admin.upload_btn">Hochladen</button>
  </form>
</div>

<div class="admin-section">
  <div class="admin-section-header">
    <h2 class="admin-section-title" data-i18n="admin.list_title">Aktive Dateien</h2>
    <span id="pdf-count" class="admin-section-count" hidden></span>
  </div>
  <div id="pdf-tile-grid" class="pdf-tile-grid">
    <p class="pdf-list-empty" data-i18n="admin.list_empty">Keine PDFs vorhanden.</p>
  </div>
</div>
```

Note what changed vs. the current file: the "Hauptspeisekarte" section's `#main-menu-current` div and the entire `#main-menu-form` (file input, progress bar, error/success messages, "Ersetzen" button) are gone — that upload control moves into the panel in Task 4. The "Aktive Dateien" section's `#pdf-list` div is renamed `#pdf-tile-grid` (same placeholder empty-state paragraph inside). The "PDF hochladen" section is untouched.

- [ ] **Step 2: Replace the edit-modal + lightbox blocks in `admin.html`**

Current `admin.html` has these two blocks (find them — they come after the `#admin-panel` div and before the closing `<script>` tags):

```html
  <!-- Edit modal -->
  <div id="edit-modal-backdrop" class="edit-modal-backdrop" hidden></div>
  <div id="edit-modal" class="edit-modal" hidden role="dialog" aria-modal="true">
    <div class="edit-modal-header">
      <h2 class="edit-modal-title" data-i18n="admin.edit_title">Bearbeiten</h2>
      <button class="edit-modal-close" id="edit-modal-close" aria-label="Schließen">✕</button>
    </div>
    <div class="edit-modal-body">
      <div class="admin-field">
        <label for="edit-title" data-i18n="admin.title_label">Titel</label>
        <input type="text" id="edit-title" maxlength="80">
      </div>
      <div class="admin-field">
        <label data-i18n="admin.date_range_label">Zeitraum (Europe/Berlin)</label>
        <div class="daterange-trigger" id="edit-daterange-trigger" tabindex="0" role="button">
          <span class="daterange-icon">📅</span>
          <span id="edit-daterange-display" class="daterange-placeholder" data-i18n="admin.date_range_placeholder">Zeitraum wählen</span>
        </div>
        <div id="edit-daterange-picker" class="daterange-picker" hidden>
          <div class="cal-header">
            <button type="button" class="cal-nav" id="edit-cal-prev">‹</button>
            <span id="edit-cal-month-label" class="cal-month-label"></span>
            <button type="button" class="cal-nav" id="edit-cal-next">›</button>
          </div>
          <div class="cal-weekdays">
            <span>Mo</span><span>Di</span><span>Mi</span>
            <span>Do</span><span>Fr</span><span>Sa</span><span>So</span>
          </div>
          <div class="cal-grid" id="edit-cal-grid"></div>
          <div class="cal-footer">
            <span id="edit-cal-hint" class="cal-hint" data-i18n="admin.date_pick_start">Startdatum wählen</span>
            <button type="button" id="edit-cal-clear" class="cal-clear" data-i18n="admin.date_clear">Löschen</button>
          </div>
        </div>
        <input type="hidden" id="edit-pdf-start">
        <input type="hidden" id="edit-pdf-end">
      </div>
      <div class="admin-field">
        <label for="edit-order" data-i18n="admin.order_label">Reihenfolge</label>
        <input type="number" id="edit-order" value="0" min="0" max="99" style="max-width:120px">
      </div>
      <p id="edit-error" class="admin-error" hidden></p>
    </div>
    <div class="edit-modal-footer">
      <button id="edit-cancel-btn" class="btn-outline" data-i18n="admin.edit_cancel">Abbrechen</button>
      <button id="edit-save-btn" class="btn-dark" data-i18n="admin.edit_save">Speichern</button>
    </div>
  </div>

  <!-- Preview lightbox -->
  <div id="admin-lightbox" class="admin-lightbox" hidden>
    <button class="admin-lightbox-close" id="admin-lightbox-close">✕</button>
    <div class="admin-lightbox-content" id="admin-lightbox-content"></div>
  </div>
```

Replace both blocks (together) with:

```html
  <!-- Tile detail panel (fullscreen, replaces the old edit modal + preview lightbox) -->
  <div id="tile-panel" class="tile-panel" hidden role="dialog" aria-modal="true">
    <div class="tile-panel-header">
      <button class="tile-panel-back" id="tile-panel-back" aria-label="Zurück">←</button>
      <h2 class="tile-panel-title" id="tile-panel-title"></h2>
    </div>
    <div class="tile-panel-body">
      <div class="tile-panel-preview" id="tile-panel-preview"></div>

      <div id="tile-seasonal-fields" hidden>
        <div class="admin-field">
          <label for="tile-title" data-i18n="admin.title_label">Titel</label>
          <input type="text" id="tile-title" maxlength="80">
        </div>
        <div class="admin-field">
          <label data-i18n="admin.date_range_label">Zeitraum (Europe/Berlin)</label>
          <div class="daterange-trigger" id="tile-daterange-trigger" tabindex="0" role="button">
            <span class="daterange-icon">📅</span>
            <span id="tile-daterange-display" class="daterange-placeholder" data-i18n="admin.date_range_placeholder">Zeitraum wählen</span>
          </div>
          <div id="tile-daterange-picker" class="daterange-picker" hidden>
            <div class="cal-header">
              <button type="button" class="cal-nav" id="tile-cal-prev">‹</button>
              <span id="tile-cal-month-label" class="cal-month-label"></span>
              <button type="button" class="cal-nav" id="tile-cal-next">›</button>
            </div>
            <div class="cal-weekdays">
              <span>Mo</span><span>Di</span><span>Mi</span>
              <span>Do</span><span>Fr</span><span>Sa</span><span>So</span>
            </div>
            <div class="cal-grid" id="tile-cal-grid"></div>
            <div class="cal-footer">
              <span id="tile-cal-hint" class="cal-hint" data-i18n="admin.date_pick_start">Startdatum wählen</span>
              <button type="button" id="tile-cal-clear" class="cal-clear" data-i18n="admin.date_clear">Löschen</button>
            </div>
          </div>
          <input type="hidden" id="tile-pdf-start">
          <input type="hidden" id="tile-pdf-end">
        </div>
        <div class="admin-field">
          <label for="tile-order" data-i18n="admin.order_label">Reihenfolge</label>
          <input type="number" id="tile-order" value="0" min="0" max="99" style="max-width:120px">
        </div>
        <p id="tile-seasonal-error" class="admin-error" hidden></p>
      </div>

      <div id="tile-mainmenu-fields" hidden>
        <div class="admin-field">
          <label for="tile-mainmenu-file" data-i18n="admin.main_menu_file_label">Neue Datei (max. 2 MB)</label>
          <input type="file" id="tile-mainmenu-file" accept="application/pdf,image/png,image/jpeg">
        </div>
        <div id="tile-mainmenu-progress-wrap" class="upload-progress-wrap" hidden>
          <div class="upload-progress-bar"><div id="tile-mainmenu-progress-fill" class="upload-progress-fill"></div></div>
          <span id="tile-mainmenu-progress-text" class="upload-progress-label">0 %</span>
        </div>
        <p id="tile-mainmenu-error" class="admin-error" hidden></p>
        <p id="tile-mainmenu-success" class="admin-success" hidden data-i18n="admin.main_menu_success">Hauptspeisekarte aktualisiert.</p>
      </div>
    </div>
    <div class="tile-panel-footer">
      <button id="tile-delete-btn" class="btn-outline" data-i18n="admin.delete_btn" hidden>Löschen</button>
      <button id="tile-save-btn" class="btn-dark" data-i18n="admin.edit_save">Speichern</button>
    </div>
  </div>
```

- [ ] **Step 3: Verify well-formed HTML**

Run:

```bash
cd "/Users/tujiiprince/develop/Business/i2bit/srilanka_et_italy/srilanka-et-italy.github.io"
python3 -c "
import re
for path in ['components/admin-panel.html', 'admin.html']:
    html = open(path).read()
    opens = len(re.findall(r'<div\b', html))
    closes = len(re.findall(r'</div>', html))
    print(path, 'div open:', opens, 'div close:', closes)
    assert opens == closes, f'{path} unbalanced'
print('OK')
"
```

Expected: `OK` (matching div counts for both files).

- [ ] **Step 4: Commit**

```bash
cd "/Users/tujiiprince/develop/Business/i2bit/srilanka_et_italy/srilanka-et-italy.github.io"
git add components/admin-panel.html admin.html
git commit -m "$(cat <<'EOF'
Restructure admin panel markup for tile grid + fullscreen panel

Replaces the main-menu info block + permanent replace-upload form,
the seasonal PDF list, the small edit modal, and the preview
lightbox with: two tile containers (#main-menu-tile-wrap,
#pdf-tile-grid) and one shared fullscreen detail panel (#tile-panel)
with type-specific field sets. No JS wiring yet — Task 3 adds
styling, Task 4 adds rendering and interaction.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: CSS — tile grid, tile card, full-screen panel; remove dead styles

**Files:**
- Modify: `css/admin.css`

**Interfaces:**
- Produces: `.pdf-tile-grid`, `.pdf-tile`, `.pdf-tile-thumb`, `.pdf-tile-info`, `.pdf-tile-title`, `.pdf-tile-meta`, `.pdf-tile-dates`, `.pdf-tile-status` (+ `.active`/`.draft`/`.deleting` modifiers), `.tile-panel`, `.tile-panel-header`, `.tile-panel-back`, `.tile-panel-title`, `.tile-panel-body`, `.tile-panel-preview` (+ `img`/`canvas` children), `.tile-panel-footer` — all consumed by Task 4's JS output and Task 2's markup.
- Consumes: existing CSS custom properties (`--ink`, `--spice`, `--muted`, `--border`, `--sand`, `--cream`, `--green`) and existing classes this task does not touch (`.admin-section`, `.admin-field`, `.admin-error`, `.admin-success`, `.btn-dark`, `.btn-outline`, `.upload-progress-*`, `.daterange-*`, `.cal-*`).

- [ ] **Step 1: Remove the dead list/item/lightbox/modal CSS**

Delete these blocks from `css/admin.css` in full (they style markup that Task 2 already removed):
- The `/* ── PDF List ── */` section's `.pdf-item`, `.pdf-item-thumb`, `.pdf-thumb-img`, `.pdf-thumb-canvas`, `.pdf-item-info`, `.pdf-item-title`, `.pdf-item-meta`, `.pdf-item-dates`, `.pdf-item-status` (+ modifiers), `.pdf-item-right`, `.btn-delete, .btn-edit` (+ hover rules) — i.e. everything under that heading except `.pdf-list` itself and `.pdf-list-empty` (keep both — `.pdf-list-empty` is still used as the empty-state message inside `#pdf-tile-grid`; `.pdf-list` is dead now that no element uses that class, remove it too).
- The `/* ── Preview Lightbox ── */` section in full (`.admin-lightbox`, `.admin-lightbox-close`, `.admin-lightbox-content` + children), including the later duplicate `.pdf-item-thumb { cursor: pointer; ... }` rule right after it.
- The `/* ── Edit modal ── */` section in full (`.edit-modal-backdrop`, `.edit-modal`, `.edit-modal-header`, `.edit-modal-title`, `.edit-modal-close`, `.edit-modal-body`, `.edit-modal-footer`).

After this step, `css/admin.css` should have no selector starting with `.pdf-item`, `.admin-lightbox`, or `.edit-modal`, and `.pdf-list` (bare) should also be gone (only `.pdf-list-empty` remains).

- [ ] **Step 2: Add the new tile grid + tile card styles**

Add this in place of the removed `/* ── PDF List ── */` item styles (keep the `.pdf-list-empty` rule where it was):

```css
/* ── PDF Tile Grid ── */

.pdf-tile-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: .9rem;
}

.pdf-tile-empty { grid-column: 1 / -1; }

.pdf-tile {
  display: flex;
  flex-direction: column;
  background: #fff;
  border: 1px solid var(--border, #E8DFD0);
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  transition: box-shadow .15s, transform .15s;
}
.pdf-tile:hover { box-shadow: 0 4px 18px rgba(0,0,0,.09); transform: translateY(-2px); }

.pdf-tile-thumb {
  aspect-ratio: 3 / 4;
  background: var(--sand, #F2EBD9);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.pdf-tile-thumb img,
.pdf-tile-thumb canvas {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.pdf-tile-info {
  padding: .75rem .85rem .9rem;
  display: flex;
  flex-direction: column;
  gap: .3rem;
}

.pdf-tile-title {
  font-weight: 600;
  font-size: .85rem;
  color: var(--ink, #1C1410);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pdf-tile-meta {
  display: flex;
  align-items: center;
  gap: .5rem;
  flex-wrap: wrap;
}

.pdf-tile-dates { font-size: .7rem; color: var(--muted, #7A6E64); }

.pdf-tile-status {
  font-size: .62rem;
  padding: .1rem .45rem;
  border-radius: 20px;
  font-weight: 700;
  letter-spacing: .03em;
  white-space: nowrap;
  text-transform: uppercase;
}
.pdf-tile-status.active   { background: #e6f4ea; color: #1a7a3c; }
.pdf-tile-status.draft    { background: #fff8e1; color: #8a6d0b; }
.pdf-tile-status.deleting { background: #fce8e8; color: #8b1c1c; }
```

- [ ] **Step 3: Add the full-screen panel styles**

Add this in place of the removed `/* ── Preview Lightbox ── */` and `/* ── Edit modal ── */` sections:

```css
/* ── Tile detail panel (fullscreen) ── */

.tile-panel {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: var(--cream, #FDFAF5);
  display: flex;
  flex-direction: column;
  transform: translateX(100%);
  transition: transform .25s ease;
}
.tile-panel:not([hidden]) { transform: translateX(0); }

.tile-panel-header {
  display: flex;
  align-items: center;
  gap: .75rem;
  padding: 1rem;
  border-bottom: 1px solid var(--border, #E8DFD0);
  background: #fff;
  flex-shrink: 0;
}

@media (min-width: 640px) {
  .tile-panel-header { padding: 1.25rem 2rem; }
}

.tile-panel-back {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 8px;
  border: 1px solid var(--border, #E8DFD0);
  background: transparent;
  font-size: 1.1rem;
  color: var(--ink, #1C1410);
  cursor: pointer;
  transition: background .15s, border-color .15s;
  flex-shrink: 0;
}
.tile-panel-back:hover { background: var(--sand, #F2EBD9); border-color: var(--spice, #C8651A); }

.tile-panel-title {
  font-size: 1.05rem;
  font-family: 'Libre Baskerville', serif;
  color: var(--ink, #1C1410);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tile-panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 1.25rem;
  max-width: 720px;
  width: 100%;
  margin: 0 auto;
}

@media (min-width: 640px) {
  .tile-panel-body { padding: 2rem; }
}

.tile-panel-preview {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--sand, #F2EBD9);
  border-radius: 12px;
  min-height: 240px;
  margin-bottom: 1.5rem;
  overflow: hidden;
  padding: 1rem;
}

.tile-panel-preview img,
.tile-panel-preview canvas {
  max-width: 100%;
  max-height: 60vh;
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(28,20,16,.12);
}

.tile-panel-footer {
  display: flex;
  justify-content: space-between;
  gap: .6rem;
  padding: 1rem 1.25rem;
  border-top: 1px solid var(--border, #E8DFD0);
  background: #fff;
  flex-shrink: 0;
}

@media (min-width: 640px) {
  .tile-panel-footer { padding: 1.1rem 2rem; }
}
```

- [ ] **Step 4: Verify no leftover references to removed classes**

Run:

```bash
cd "/Users/tujiiprince/develop/Business/i2bit/srilanka_et_italy/srilanka-et-italy.github.io"
grep -n "\.pdf-item\|\.admin-lightbox\|\.edit-modal" css/admin.css
```

Expected: no output (empty — confirms Step 1's removals were complete and nothing new reintroduced those class names).

- [ ] **Step 5: Commit**

```bash
cd "/Users/tujiiprince/develop/Business/i2bit/srilanka_et_italy/srilanka-et-italy.github.io"
git add css/admin.css
git commit -m "$(cat <<'EOF'
Add tile grid/card and fullscreen panel styles; remove dead CSS

Removes .pdf-item*, .admin-lightbox*, .edit-modal* (styled markup
Task 2 already removed) and adds .pdf-tile-grid/.pdf-tile* and
.tile-panel* to match.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: JS — tile rendering + unified panel logic

**Files:**
- Modify: `js/admin.js`

**Interfaces:**
- Consumes: `createDateRangePicker` (Task 1); DOM elements from Task 2 (`#main-menu-tile-wrap`, `#pdf-tile-grid`, `#tile-panel`, `#tile-panel-back`, `#tile-panel-title`, `#tile-panel-preview`, `#tile-seasonal-fields` + its inputs, `#tile-mainmenu-fields` + its inputs, `#tile-delete-btn`, `#tile-save-btn`); existing module-level `db`, `storage`, `i18n`, `t()`, `showError()`, `writeAuditLog()`, `deletePdf()`, `localBerlinToTimestamp()` already defined in this file; existing Firestore/Storage imports (`doc`, `getDoc`, `setDoc`, `updateDoc`, `deleteField`, `collection`, `getDocs`, `query`, `orderBy`, `serverTimestamp`, `Timestamp`, `ref`, `uploadBytesResumable`, `getDownloadURL`, `deleteObject`).
- Produces: nothing consumed by later tasks — this is the last task.

This task removes: `renderPdfItem`, `renderMainMenuCurrent`, `openPreview`, `openEditModal`, `syncEditDateRangeDisplay`, `setupEditDateRangePicker`, the module-level `editDateRangeReady` flag, and the permanent-upload-form event wiring inside `setupMainMenuSection`. It adds: `renderPdfTile`, `renderMainMenuTile`, `renderLargePreview`, `openTilePanel`, `closeTilePanel`, and updates `refreshPdfList`, `refreshMainMenuCurrent`, `setupMainMenuSection`, `renderPdfThumb`.

- [ ] **Step 1: Add an optional `targetWidth` param to `renderPdfThumb`**

Current:

```js
async function renderPdfThumb(url, canvas) {
  if (!canvas || typeof pdfjsLib === 'undefined') return;
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const pdf  = await pdfjsLib.getDocument({ url }).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 1 });
    const scale = 56 / viewport.width;
    const vp = page.getViewport({ scale });
    canvas.width  = vp.width;
    canvas.height = vp.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
  } catch { /* show nothing on error */ }
}
```

New (the tile grid needs a sharper render than the old 56px list icon — the CSS scales the canvas down via `object-fit: cover`, but rendering at a higher native resolution keeps it crisp):

```js
async function renderPdfThumb(url, canvas, targetWidth = 220) {
  if (!canvas || typeof pdfjsLib === 'undefined') return;
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const pdf  = await pdfjsLib.getDocument({ url }).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 1 });
    const scale = targetWidth / viewport.width;
    const vp = page.getViewport({ scale });
    canvas.width  = vp.width;
    canvas.height = vp.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
  } catch { /* show nothing on error */ }
}
```

- [ ] **Step 2: Add `renderLargePreview`, extracted from the old `openPreview`**

Add this new function near `renderPdfThumb` (e.g. directly above it):

```js
async function renderLargePreview(container, url, isImage) {
  container.innerHTML = '';
  if (isImage) {
    const img = document.createElement('img');
    img.src = url;
    container.appendChild(img);
    return;
  }
  const canvas = document.createElement('canvas');
  container.appendChild(canvas);
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const pdf  = await pdfjsLib.getDocument({ url }).promise;
    const page = await pdf.getPage(1);
    const scale = Math.min(window.innerWidth * .8, 680) / page.getViewport({ scale: 1 }).width;
    const vp = page.getViewport({ scale });
    canvas.width  = vp.width;
    canvas.height = vp.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
  } catch {
    container.innerHTML = `<p style="color:var(--muted,#7A6E64)">Vorschau nicht verfügbar</p>`;
  }
}
```

- [ ] **Step 3: Delete `openPreview`**

Remove the entire `// ── Preview lightbox ──...` section (the `openPreview` function) — its logic now lives in `renderLargePreview` (Step 2), and the panel replaces the lightbox as the only preview surface.

- [ ] **Step 4: Replace `renderPdfItem` with `renderPdfTile`, and update `refreshPdfList`**

Current `refreshPdfList`:

```js
async function refreshPdfList(listEl) {
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
    listEl.innerHTML = `<p class="pdf-list-empty">${t('admin.list_empty')}</p>`;
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

  const startStr = d.startDate ? d.startDate.toDate().toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' }) : null;
  const endStr   = d.endDate   ? d.endDate.toDate().toLocaleDateString('de-DE',   { timeZone: 'Europe/Berlin' }) : null;
  const dateStr  = startStr && endStr ? `${startStr} – ${endStr}` : '∞ immer aktiv';
  const titleText = typeof d.title === 'string' ? d.title : (d.title?.[i18n.lang] || d.title?.de || id);

  const isImage = d.contentType && d.contentType.startsWith('image/');

  item.innerHTML = `
    <div class="pdf-item-thumb">
      ${isImage
        ? `<img src="${DOMPurify.sanitize(d.pdfUrl)}" alt="" class="pdf-thumb-img">`
        : `<canvas class="pdf-thumb-canvas"></canvas>`}
    </div>
    <div class="pdf-item-info">
      <span class="pdf-item-title">${DOMPurify.sanitize(titleText)}</span>
      <div class="pdf-item-meta">
        <span class="pdf-item-dates">${dateStr}</span>
        <span class="pdf-item-status ${d.status}">${d.status}</span>
      </div>
    </div>
    <div class="pdf-item-right">
      <button class="btn-edit" aria-label="Bearbeiten">✎</button>
      <button class="btn-delete" aria-label="${t('admin.delete_btn')}">✕</button>
    </div>`;

  const thumb = item.querySelector('.pdf-item-thumb');
  if (!isImage && d.pdfUrl && d.pdfUrl !== 'pending') {
    renderPdfThumb(d.pdfUrl, item.querySelector('.pdf-thumb-canvas'));
  }
  if (d.pdfUrl && d.pdfUrl !== 'pending') {
    thumb.addEventListener('click', () => openPreview(d.pdfUrl, isImage));
  }
  item.querySelector('.btn-edit').addEventListener('click', () => openEditModal(id, d));
  item.querySelector('.btn-delete').addEventListener('click', () => deletePdf(id, d.fileName));
  return item;
}
```

Replace both functions with:

```js
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
        <span class="pdf-tile-status ${d.status}">${d.status}</span>
      </div>
    </div>`;

  if (!isImage && d.pdfUrl && d.pdfUrl !== 'pending') {
    renderPdfThumb(d.pdfUrl, tile.querySelector('canvas'));
  }
  tile.addEventListener('click', () => openTilePanel('seasonal', id, d));
  return tile;
}
```

Note: the date range (`dateStr`) that used to show in the list is dropped from the tile face — it's still fully editable inside the panel; the tile itself only needs title + status to stay scannable at grid size, matching the design's "large thumbnail dominates" intent.

- [ ] **Step 5: Replace `renderMainMenuCurrent` with `renderMainMenuTile`, and update `refreshMainMenuCurrent`/`setupMainMenuSection`**

Current:

```js
async function setupMainMenuSection() {
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

  await refreshMainMenuCurrent();
}

async function refreshMainMenuCurrent() {
  const container = document.getElementById('main-menu-current');
  try {
    const docSnap = await getDoc(doc(db, 'main_menu', 'current'));
    renderMainMenuCurrent(container, docSnap.exists() ? docSnap.data() : null);
  } catch (err) {
    console.warn('Could not load main menu card:', err.message);
    container.innerHTML = `<p class="pdf-list-empty">${t('admin.main_menu_empty')}</p>`;
  }
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

Replace all three functions (`setupMainMenuSection`, `refreshMainMenuCurrent`, `renderMainMenuCurrent`) with:

```js
async function setupMainMenuSection() {
  await refreshMainMenuTile();
}

async function refreshMainMenuTile() {
  const container = document.getElementById('main-menu-tile-wrap');
  try {
    const docSnap = await getDoc(doc(db, 'main_menu', 'current'));
    renderMainMenuTile(container, docSnap.exists() ? docSnap.data() : null);
  } catch (err) {
    console.warn('Could not load main menu card:', err.message);
    container.innerHTML = `<p class="pdf-list-empty">${t('admin.main_menu_empty')}</p>`;
  }
}

function renderMainMenuTile(container, d) {
  if (!d || !d.pdfUrl) {
    container.innerHTML = `<p class="pdf-list-empty" data-i18n="admin.main_menu_empty">${t('admin.main_menu_empty')}</p>`;
    container.querySelector('p').addEventListener('click', () => openTilePanel('mainMenu', 'current', d || {}));
    container.querySelector('p').style.cursor = 'pointer';
    return;
  }

  const isImage = d.contentType && d.contentType.startsWith('image/');
  const updatedStr = d.updatedAt?.toDate
    ? d.updatedAt.toDate().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })
    : '';

  const tile = document.createElement('div');
  tile.className = 'pdf-tile';
  tile.style.maxWidth = '220px';
  tile.innerHTML = `
    <div class="pdf-tile-thumb">
      ${isImage
        ? `<img src="${DOMPurify.sanitize(d.pdfUrl)}" alt="">`
        : `<canvas></canvas>`}
    </div>
    <div class="pdf-tile-info">
      <span class="pdf-tile-title">${DOMPurify.sanitize(d.fileName || '')}</span>
      <div class="pdf-tile-meta">
        <span class="pdf-tile-dates">${t('admin.main_menu_updated_label')}: ${updatedStr}</span>
      </div>
    </div>`;

  container.innerHTML = '';
  container.appendChild(tile);

  if (!isImage) {
    renderPdfThumb(d.pdfUrl, tile.querySelector('canvas'));
  }
  tile.addEventListener('click', () => openTilePanel('mainMenu', 'current', d));
}
```

Note the empty-state case is now also clickable (so an admin with no main menu yet can still open the panel to upload the first one) — this is the only behavior addition beyond a straight refactor, and it's required: previously the upload form was always visible; now it only exists inside the panel, so there must be a way to reach it before any file exists.

- [ ] **Step 6: Delete the old edit-modal functions**

Remove `openEditModal`, `syncEditDateRangeDisplay`, `setupEditDateRangePicker`, and the `let editDateRangeReady = false;` line — the entire `// ── Edit modal ──...` section down to (but not including) the `async function writeAuditLog(...)` function at the end of the file.

- [ ] **Step 7: Add the unified panel logic**

Add this new section in place of the deleted edit-modal section (i.e. after `renderLargePreview`/`renderPdfThumb`, before `writeAuditLog`):

```js
// ── Tile detail panel ──────────────────────────────────────────────────────

let tileDateRangePicker = null;
let tilePanelState = null; // { type: 'seasonal'|'mainMenu', docId, data }

function ensureTileDateRangePicker() {
  if (tileDateRangePicker) return tileDateRangePicker;
  tileDateRangePicker = createDateRangePicker({
    triggerId: 'tile-daterange-trigger', pickerId: 'tile-daterange-picker', displayId: 'tile-daterange-display',
    gridId: 'tile-cal-grid', monthLabelId: 'tile-cal-month-label', hintId: 'tile-cal-hint', clearBtnId: 'tile-cal-clear',
    prevBtnId: 'tile-cal-prev', nextBtnId: 'tile-cal-next', startInputId: 'tile-pdf-start', endInputId: 'tile-pdf-end'
  });
  return tileDateRangePicker;
}

async function openTilePanel(type, docId, d) {
  tilePanelState = { type, docId, data: d };

  const panel        = document.getElementById('tile-panel');
  const title         = document.getElementById('tile-panel-title');
  const preview       = document.getElementById('tile-panel-preview');
  const seasonalFields = document.getElementById('tile-seasonal-fields');
  const mainMenuFields  = document.getElementById('tile-mainmenu-fields');
  const deleteBtn     = document.getElementById('tile-delete-btn');
  const saveBtn       = document.getElementById('tile-save-btn');

  const isImage = d.contentType && d.contentType.startsWith('image/');
  if (d.pdfUrl && d.pdfUrl !== 'pending') {
    renderLargePreview(preview, d.pdfUrl, isImage);
  } else {
    preview.innerHTML = `<p style="color:var(--muted,#7A6E64)">${t('admin.main_menu_empty')}</p>`;
  }

  if (type === 'seasonal') {
    title.textContent = typeof d.title === 'string' ? d.title : (d.title?.[i18n.lang] || d.title?.de || docId);
    seasonalFields.hidden = false;
    mainMenuFields.hidden = true;
    deleteBtn.hidden = false;
    saveBtn.textContent = t('admin.edit_save');

    document.getElementById('tile-title').value = typeof d.title === 'string' ? d.title : '';
    document.getElementById('tile-order').value = d.order ?? 0;

    const startVal = d.startDate ? isoLocalFromTimestamp(d.startDate, false) : '';
    const endVal   = d.endDate   ? isoLocalFromTimestamp(d.endDate, true)    : '';
    ensureTileDateRangePicker().syncDates(startVal, endVal);
    document.getElementById('tile-seasonal-error').hidden = true;

    saveBtn.onclick = () => saveSeasonalTile(docId, d);
    deleteBtn.onclick = () => deleteTileAndClose(docId, d.fileName);
  } else {
    title.textContent = t('admin.main_menu_title');
    seasonalFields.hidden = true;
    mainMenuFields.hidden = false;
    deleteBtn.hidden = true;
    saveBtn.textContent = t('admin.main_menu_replace_btn');

    document.getElementById('tile-mainmenu-file').value = '';
    document.getElementById('tile-mainmenu-error').hidden = true;
    document.getElementById('tile-mainmenu-success').hidden = true;
    document.getElementById('tile-mainmenu-progress-wrap').hidden = true;

    saveBtn.onclick = () => replaceMainMenuFile(d);
  }

  panel.hidden = false;
}

function closeTilePanel() {
  document.getElementById('tile-panel').hidden = true;
  document.getElementById('tile-panel-preview').innerHTML = '';
  tilePanelState = null;
}

document.getElementById('tile-panel-back').addEventListener('click', closeTilePanel);

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

async function replaceMainMenuFile(prevData) {
  const errorEl      = document.getElementById('tile-mainmenu-error');
  const successEl    = document.getElementById('tile-mainmenu-success');
  const progressWrap = document.getElementById('tile-mainmenu-progress-wrap');
  const progressFill = document.getElementById('tile-mainmenu-progress-fill');
  const progressText = document.getElementById('tile-mainmenu-progress-text');
  errorEl.hidden   = true;
  successEl.hidden = true;

  const file = document.getElementById('tile-mainmenu-file').files[0];
  if (!file) { showError(errorEl, t('admin.err_no_file')); return; }
  const allowed = ['application/pdf', 'image/png', 'image/jpeg'];
  if (!allowed.includes(file.type)) { showError(errorEl, t('admin.err_not_pdf')); return; }
  if (file.size > 2 * 1024 * 1024) { showError(errorEl, t('admin.err_too_large')); return; }

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
      await refreshMainMenuTile();
      const refreshedDoc = await getDoc(docRef);
      renderLargePreview(
        document.getElementById('tile-panel-preview'),
        downloadURL,
        file.type.startsWith('image/')
      );
      tilePanelState = { type: 'mainMenu', docId: 'current', data: refreshedDoc.data() };
    }
  );
}
```

- [ ] **Step 8: Manual verification against the Firebase emulator**

Run: `cd "/Users/tujiiprince/develop/Business/i2bit/srilanka_et_italy/srilanka-et-italy.github.io" && firebase emulators:start --only functions,firestore,storage,hosting,auth`

In a browser, go to `http://localhost:5000/admin.html`, log in, and confirm:
1. "Hauptspeisekarte" shows a single tile (or the clickable empty-state text if nothing uploaded yet in the emulator).
2. Clicking the main-menu tile opens the full-screen panel sliding in from the right, showing the large preview and the file-replace control (no title/date/order fields, no delete button).
3. Uploading a file in the panel shows a progress bar, then success message, then the panel's preview updates to the new file; closing the panel (back arrow) shows the tile updated too.
4. "Aktive Dateien" shows a grid of tiles (upload 2-3 test PDFs via the existing "PDF hochladen" form first if the emulator is empty).
5. Clicking a seasonal tile opens the panel with the large preview, title/date-range/order fields populated, and a visible delete button.
6. Editing the title/order and saving closes the panel and the grid reflects the change.
7. Deleting from the panel closes the panel and removes the tile from the grid; check the Storage emulator UI to confirm the file was removed.

Stop the emulator (Ctrl+C) once all seven checks pass.

- [ ] **Step 9: Commit**

```bash
cd "/Users/tujiiprince/develop/Business/i2bit/srilanka_et_italy/srilanka-et-italy.github.io"
git add js/admin.js
git commit -m "$(cat <<'EOF'
Render tiles and wire the unified fullscreen detail panel

Replaces renderPdfItem/renderMainMenuCurrent (list-row rendering)
with renderPdfTile/renderMainMenuTile (tile-grid rendering), and the
small edit modal + preview lightbox with one openTilePanel() that
handles both seasonal-PDF editing/deleting and main-menu file
replacement, reusing all existing Firestore/Storage read-write logic
unchanged.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Post-plan deployment note

None of these 4 tasks deploy to production automatically — this is a frontend-only change (`components/admin-panel.html`, `admin.html`, `css/admin.css`, `js/admin.js`), all served via Firebase Hosting. A real `firebase deploy --only hosting` is a separate, production-affecting action requiring explicit user confirmation before running.
