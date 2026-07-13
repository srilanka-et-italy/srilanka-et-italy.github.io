# Admin Panel: Icon Launcher + Separate Pages

## Problem

The admin panel currently combines "Hauptspeisekarte" and "Aktive Dateien" (seasonal PDFs) on one single page (`admin.html`), with a shared fullscreen slide-over panel for editing either. The user wants a dashboard-style launcher instead (reference: a grid of square icon tiles grouped under a category heading, similar to the "barto" farm-management dashboard screenshot), where clicking a tile navigates to a **real, separate HTML page** dedicated to that function — not a hash route, not an in-page panel switch.

## Goal

- `admin.html` becomes a pure launcher: login screen + (once authenticated) a category header with two icon tiles — "Hauptspeisekarte" and "Aktive Dateien" — each linking to its own page via a normal `<a href>`.
- `admin-main-menu.html` — new dedicated page for the main menu card. Clicking its launcher tile goes straight here (no intermediate tile-grid step, confirmed by the user — there's only one file to manage). Shows the current file's large preview plus a replace-file control, laid out directly on the page (no overlay panel needed, since the whole page is already this feature).
- `admin-seasonal-pdfs.html` — new dedicated page for seasonal PDFs. Keeps the existing "PDF hochladen" form and the tile grid; clicking a tile still opens the existing fullscreen slide-over panel (unchanged behavior) — its "back" arrow returns to this page (the grid), not to the launcher.
- Real browser navigation (full page loads, normal URLs) — browser back/forward and bookmarks work automatically, no client-side router needed.

## Architecture

### File structure

**New:**
- `admin-main-menu.html` — login screen (duplicated markup, same as today) + main menu card page content.
- `admin-seasonal-pdfs.html` — login screen (duplicated markup) + upload form + tile grid + the existing fullscreen panel (moved here from `admin.html`, seasonal-only now — no more `type` branching, since main-menu editing has its own page).
- `js/admin-shared.js` — extracts everything genuinely common across all three pages: `i18n` setup, `t()`, an `initAuthGate(onAuthed)` helper (wires the login form, logout button, language buttons, and `onAdminAuthStateChanged`, calling `onAuthed()` once a user is confirmed and the panel is shown), `showError`, `localBerlinToTimestamp`, `createDateRangePicker`, `writeAuditLog`, `renderLargePreview`, `renderPdfThumb`.
- `js/admin-home.js` — for `admin.html`: just calls `initAuthGate()` with an empty `onAuthed` (the launcher tiles are static links, nothing to fetch or render).
- `js/admin-main-menu.js` — for `admin-main-menu.html`: main-menu-specific rendering/upload logic (adapted from the current `renderMainMenuTile`/`refreshMainMenuTile`/`replaceMainMenuFile`, targeting this page's own element ids, not the old tile+panel pair).
- `js/admin-seasonal-pdfs.js` — for `admin-seasonal-pdfs.html`: seasonal-specific logic (adapted from the current `setupUploadForm`/`refreshPdfList`/`renderPdfTile`/`deletePdf`/`openTilePanel`/`saveSeasonalTile`/`deleteTileAndClose`, with `openTilePanel` simplified to seasonal-only — no more `type` parameter or `tile-mainmenu-fields` branch, since that case no longer exists here).

**Modified:**
- `admin.html` — strip out the old `#admin-content-placeholder` fetch-and-inject mechanism and the `#tile-panel` markup entirely. Replace the panel's `<main>` content with the launcher: one category heading + two icon tiles (reusing existing i18n keys `admin.main_menu_title` and `admin.list_title` as tile labels — no new translation keys needed for the labels themselves).
- `css/admin.css` — add launcher tile styles (square icon tile + label, category heading), matching the reference screenshot's visual language adapted to this site's existing color/type system (not a literal copy of "barto"'s colors). No existing styles need removal — the panel/tile-grid CSS stays valid since `admin-seasonal-pdfs.html` still uses it.

**Removed:**
- `components/admin-panel.html` — no longer needed; each page now has its own static markup instead of one page fetching and injecting a shared fragment.
- `js/admin.js` — replaced entirely by the shared module + three page-specific modules above.

### Navigation

Plain `<a href="admin-main-menu.html">` / `<a href="admin-seasonal-pdfs.html">` links from the launcher. Each of the two feature pages gets a "← " back link (reusing the existing `.tile-panel-back` button styling, but as an `<a>` to `admin.html` instead of a JS-driven panel-close) in its header.

### Auth

Each of the three pages independently runs the same login-gate flow via `initAuthGate()` from `js/admin-shared.js` — this is intentional duplication of *behavior*, not code (the logic itself lives once, in the shared module; each page's HTML still needs its own copy of the login-screen markup, since there's no shared-page-shell mechanism here). A user who is already authenticated in one tab and opens another admin page gets the same Firebase Auth session automatically (Firebase Auth persistence is origin-scoped, not page-scoped).

### Data flow

No Firestore/Storage schema changes. `admin-main-menu.js` reads/writes `main_menu/current` exactly as `replaceMainMenuFile`/`refreshMainMenuTile` do today, just targeting this page's own DOM ids instead of the old tile-panel's. `admin-seasonal-pdfs.js` reads/writes `seasonal_pdfs` exactly as today.

## Error handling

Unchanged from current behavior — same validation (file type/size, date order), same error message elements, same audit-log calls.

## Tests

No test framework for this frontend code, consistent with prior work on this repo. Verification is manual: log in on `admin.html`, click each launcher tile, confirm each dedicated page loads and behaves like the corresponding section did before the split, confirm the browser back button and directly-loading a page URL both work correctly (auth gate still applies on direct load).

## Not in scope

- No client-side router, no hash-based navigation.
- No change to the underlying Firestore/Storage schema, security rules, or the `/menu-card` Cloud Function.
- No additional launcher categories beyond the two described — the reference screenshot's multi-category layout is a visual reference only, not a request to add unrelated admin modules.
