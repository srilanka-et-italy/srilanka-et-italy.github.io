# Admin-Panel: Kachel-Ansicht + Vollbild-Seitenpanel

## Problem

Das Admin-Panel zeigt aktive Saison-PDFs aktuell als vertikale Liste (`.pdf-item`) mit Edit-/Löschen-Icons direkt in der Zeile, und die Hauptspeisekarte als separaten Info-Block mit permanent sichtbarem Upload-Formular darunter. Bearbeiten einer Saison-Datei öffnet ein kleines, zentriertes Modal ohne PDF-Vorschau. Das wirkt uneinheitlich (zwei verschiedene Darstellungsmuster für strukturell ähnliche Dinge) und das Edit-Modal ist zu klein, um Vorschau und Formular gemeinsam sinnvoll darzustellen.

## Ziel

Beide Bereiche (Hauptspeisekarte, Aktive Dateien) werden als Kacheln dargestellt. Klick auf eine Kachel öffnet ein Vollbild-Panel von rechts mit großer PDF-Vorschau und den passenden Bearbeiten-Feldern — ein einheitliches Interaktionsmuster für beide Bereiche.

## Architektur

### 1. Kachel-Komponente (`.pdf-tile`)

Eine gemeinsame Kachel-Komponente für beide Bereiche:
- Großflächiges Thumbnail (PDF-Vorschau via pdf.js, wie bisher, nur größer als das aktuelle 56px-Icon in der Liste).
- Titel darunter.
- Status-Badge nur bei Saison-Dateien (`active`/`draft`/`deleting`), bei Hauptspeisekarte stattdessen "Zuletzt aktualisiert"-Datum.
- Kein Edit-/Löschen-Icon auf der Kachel selbst — Klick irgendwo auf die Kachel öffnet das Panel.

**Aktive Dateien:** Kacheln in einem responsiven CSS-Grid (`.pdf-tile-grid`), ersetzt die aktuelle `.pdf-list`-Liste.
**Hauptspeisekarte:** Eine einzelne `.pdf-tile` (kein Grid nötig), ersetzt den aktuellen Info-Block. Der "Ersetzen"-Upload verschwindet von der Hauptseite und wandert ins Panel (siehe unten).

### 2. Vollbild-Seitenpanel

Ein Panel-Bauteil für beide Kachel-Typen, mit Slide-in-Animation von rechts, volle Breite/Höhe (eigene Ansicht, kein Overlay mit sichtbarem Seitenrest). Zurück-Pfeil oben links schließt das Panel.

Aufbau:
1. Große PDF/Bild-Vorschau oben (gleiche pdf.js-Logik wie die bestehende Lightbox-Vorschau, nur größer skaliert).
2. Formular-Bereich darunter, je nach Typ unterschiedlich:
   - **Saison-Datei:** Titel, Zeitraum-Picker (Start/Ende, Europe/Berlin), Reihenfolge — identische Felder/Validierung wie das bisherige Edit-Modal (`err_date_order` etc.), nur umplatziert. Speichern-Button. Löschen-Button (mit bestehendem Bestätigungsdialog `admin.delete_confirm`).
   - **Hauptspeisekarte:** kein Titel/Zeitraum/Reihenfolge. Stattdessen die bestehende "Neue Datei ersetzen"-Upload-Logik (Dateiauswahl + Ersetzen-Button), die aktuell permanent auf der Hauptseite sichtbar ist.

Ein Panel-Bauteil, das je nach `type` (`'seasonal'` oder `'mainMenu'`) die passenden Formularfelder ein-/ausblendet, keine zwei getrennten Panel-Implementierungen.

### 3. Datenfluss

Keine Änderungen an Firestore-Schema (`seasonal_pdfs`, `main_menu/current`) oder Storage-Struktur. Reine Frontend-Umgestaltung:
- `js/admin.js`: Rendering-Funktionen (`renderPdfItem`, `renderMainMenuCurrent`, `refreshPdfList`, `openEditModal`) werden zu Kachel-Rendering + einem gemeinsamen Panel-Öffnen/Schließen-Mechanismus umgebaut. Bestehende Firestore-/Storage-Logik (Upload, Save, Delete, Audit-Log) bleibt inhaltlich unverändert, nur die UI-Anbindung ändert sich.
- `components/admin-panel.html`: Neues Markup für Kachel-Grid + Panel (ersetzt `.pdf-list` und `#edit-modal`/`#edit-modal-backdrop`).
- `css/admin.css`: Neues Kachel-/Panel-Styling. Altes Listen-CSS (`.pdf-item`, `.pdf-item-*`) und Modal-CSS (`.edit-modal*`) werden entfernt, soweit nicht wiederverwendet.

### 4. Fehlerbehandlung

Gleiche Validierungsregeln wie bisher: Dateityp (`application/pdf`, `image/png`, `image/jpeg`), Dateigröße (max. 2 MB), Enddatum muss nach Startdatum liegen. Fehleranzeige weiterhin inline im Panel (analog zu `#edit-error`/`#upload-error` heute).

### 5. Tests

Wie bei bisherigen Frontend-Tasks in diesem Projekt: kein automatisiertes UI-Test-Framework vorhanden. Verifikation über Firebase-Emulator + manuelles Durchklicken im Browser (Kachel-Klick öffnet Panel, Bearbeiten/Speichern/Löschen funktioniert, Hauptspeisekarte-Ersetzen im Panel funktioniert).

## Nicht im Scope

- Keine Änderung am öffentlichen Webseiten-Design (nur das Admin-Panel betroffen).
- Keine Änderung an Firestore-Schema, Storage-Pfaden oder der `/menu-card`-Funktion.
- Keine Drag-and-Drop-Sortierung der Kacheln (Reihenfolge bleibt ein Zahlenfeld wie bisher).
- Keine Mehrfachauswahl/Bulk-Aktionen auf Kacheln.

## Betroffene Dateien

- `js/admin.js` (Kachel-Rendering, Panel-Logik, Wiederverwendung bestehender Upload/Save/Delete-Funktionen)
- `components/admin-panel.html` (Kachel-Grid-Markup, Panel-Markup statt Edit-Modal)
- `css/admin.css` (Kachel-/Panel-Styling, Entfernen von totem Listen-/Modal-CSS)
