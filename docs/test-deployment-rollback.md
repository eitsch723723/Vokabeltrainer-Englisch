# Testumgebung, Änderungen und Rückbau

Stand: 2026-11-14. Maßgeblicher Code: Repository `eitsch723723/Vokabeltrainer-Englisch`.

## Veröffentlichung

- Produktion: `https://eitsch723723.github.io/Vokabeltrainer-Englisch/`, Quelle `main`.
- Vorschau: `https://eitsch723723.github.io/Vokabeltrainer-Englisch/test/`, Quelle `feature/oral-vocabulary-quiz`.
- Ein gemeinsamer GitHub-Actions-Workflow `.github/workflows/pages.yml` kombiniert beide Quellbäume in **einem** Pages-Artefakt; es findet kein Merge des Features nach `main` statt.
- Der Deployment-Branch `feature/oral-vocabulary-quiz` dient als Vorschau-Quelle. Neue Funktionen werden zunächst auf einem **eigenen Feature-Branch** entwickelt, dann nach erfolgreichen Tests per Fast-Forward auf den Vorschau-Branch gespiegelt. `main` bleibt unverändert.
- Relative Pfade für CSV/JS/CSS/Manifest/Service Worker bleiben innerhalb ihrer jeweiligen Unterverzeichnisse.
- Unterschiedliche IndexedDB-Namen: `vokabeltrainer-englisch` (Produktion) und `vokabeltrainer-englisch-test` (Vorschau).
- Der Vorschau-Service-Worker löscht beim Aktivieren nur Caches mit Prefix `vokabeltrainer-test-`, niemals die Produktions-Caches.

## Reproduzierbarer Ausgangszustand

- Produktiver Pages-Workflow wurde ursprünglich auf `main` im Commit **0d7e8e8203f9ee6dfe6deff1488e59a1bf16ca48** umgestellt, davor galt Commit **b353723b7c6f0cd50f1c45b794792589cad98a2b**.
- Vor Beginn der Zehner-Runden-/Testarbeiten stand der Feature-Branch auf Commit **651bbb5da4a154c3250ee032fa73c3a24d00008a**.
- Das ursprüngliche Feature aus PR **#6** wurde am 14.11.2026 nach `main` übernommen. Zukünftige Funktionen erhalten separate PRs; kein weiterer Merge ohne Nutzerfreigabe.
- In dieser Überarbeitung: neue reine Sitzungslogik `src/services/oralQuizService.js`, geänderte `src/app.js`, Navigation in `styles.css`, Cache-Namespace in `sw.js`, neue Unit- und Browser-Tests, CI mit Chromium und WebKit, Dokumentation. Die CSV und das `main`-Vokabelverzeichnis wurden **nicht** verändert.

## Rückbau

**Nur die Testveröffentlichung abschalten, Produktivversion beibehalten:**

1. Vorher aktuelle Änderungen auf `main` prüfen.
2. Im Repository den Commit `0d7e8e8203f9ee6dfe6deff1488e59a1bf16ca48` auf `main` über einen separaten Branch und PR revertieren oder `.github/workflows/pages.yml` auf seine frühere Einzelveröffentlichung (nur `main`) zurückstellen.
3. Den betreffenden PR nach Freigabe mergen; GitHub Pages muss anschließend einmalig erfolgreich aus `main` neu deployen. Die Test-Unterseite fällt dann weg. Die Produktionsdateien und Lerndaten bleiben erhalten.

**Zehner-Runden-Änderung rückgängig machen, ohne `main` zu verändern:**

1. Feature-Branch-Ausgangscommit `651bbb5da4a154c3250ee032fa73c3a24d00008a` als neue Vergleichs-/Rollback-Branch sichern.
2. Auf dem bestehenden Feature-Branch die ab diesem Commit neu hinzugekommenen Änderungen per gezieltem `git revert` rückgängig machen (oder einen neuen PR aus einer auf dem Ausgangscommit basierenden Branch erstellen). Kein erzwungenes Zurücksetzen von `main`.
3. CI erneut ausführen und unter `/test/` prüfen. Die produktive Seite bleibt unberührt.

**Lokale Vorschau-Daten zurücksetzen:** Falls die Vorschau weiterhin veraltete Offline-Inhalte zeigt, ausschließlich Website-Daten bzw. Service-Worker-Cache der Vorschau löschen. Achtung: Safari kann Website-Daten für die gesamte `github.io`-Origin gemeinsam verwalten; vor dem Löschen eigener Produktiv-Lerndaten unbedingt den Lernstand als JSON exportieren. Nicht pauschal alle Daten der Origin löschen.

## Testumfang

- `npm test` – reine Logik einschließlich CSV, Prioritäten, Zehner-Runden, Fehlerbehandlung und Lernstand.
- `npm run check` – Syntaxprüfung.
- GitHub-Actions-Job `browser` – Chromium Desktop sowie WebKit-iPhone/iPad-Simulationen mit Navigation, neuen und vorhandenen Übungsarten, Fortschritts-Export/Import, DB-Trennung und Layout.
- **Nicht durchgeführt:** reale Hardwaretests auf iPhone/iPad/Safari; visuelle Endabnahme durch den Nutzer.


## Erweiterung: Upload-Batches vom 14.11.2026

- Vor Beginn stand `main` auf `95842af4a61917acf162d526f956e4ed34162a14`.
- **Vorheriger Vorschau-Branch-Stand:** `feature/oral-vocabulary-quiz` = `b889a77d2440c43ace4c846db18cab9050bdb69f`. Diese SHA ist die sichere Rückfallversion der bisherigen Testseite.
- Neuer Entwicklungsbranch: `feature/oral-quiz-batch-selection`, Draft-PR #8.
- Neue, optionale CSV-Spalte `batch_id` (`YYYY-MM-DD-NN`), die gemeinsam importierte Vokabeln gruppiert. Die 92 Vokabeln `v0243`–`v0334` erhalten `2026-11-05-01`; alte Vokabeln ohne bekanntes Datum bleiben ohne Batch-ID.
- Neue UI-Auswahl nur unter „Abfragen“: alle Vokabeln, letzter Upload oder nach Datum. Ein durch Datum gewählter Bestand enthält alle Uploads des Tages. Die Auswahl wird über Zehner-Runden beibehalten.
- Modell, CSV-Import, Auswahlservice, App, Service Worker, Unit-/Browsertests und Dokumentation wurden nur auf dem neuen Entwicklungsbranch geändert. Persönliche Lernstände und Produktionsdateien auf `main` bleiben unberührt.
- Nach erfolgreichem CI darf der bestehende Vorschau-Branch **ohne Merge nach `main`** per Fast-Forward auf den getesteten Commit des neuen Entwicklungsbranches gestellt werden. Dadurch veröffentlicht der bestehende Pages-Workflow die Testversion unter `/test/`. Vor dem Aktualisieren die tatsächliche neue SHA mit dem PR-Head abgleichen.

### Rückbau ausschließlich der neuen Testfunktion

1. Prüfen, dass der Vorschau-Branch tatsächlich auf dem neuen getesteten Commit steht, und seine aktuelle SHA notieren.
2. Den Vorschau-Branch mit einem abgesicherten `force-with-lease`-Update auf die frühere SHA `b889a77d2440c43ace4c846db18cab9050bdb69f` zurücksetzen (nur diesen Branch, niemals `main`).
3. Pages-Deployment erneut auslösen und seinen erfolgreichen Abschluss prüfen. `/test/` enthält danach wieder die vorherige Version.
4. Wurde die Erweiterung später nach `main` gemergt, nur über einen separaten Revert-PR mit erneuten Tests zurücknehmen. Niemals ungeprüft die CSV ersetzen, wenn nachfolgende Vokabel-Uploads hinzugekommen sind.
5. Bei Cache-Anomalien nicht alle Safari-Website-Daten der `github.io`-Origin pauschal löschen; die produktiven Lernstände vorher sichern.

### Testevidenz

PR #8 dokumentiert die CI-Ergebnisse zur Batch-Auswahl. Logik- und Browser-Simulation sind keine realen Tests auf iPhone- oder iPad-Hardware.
