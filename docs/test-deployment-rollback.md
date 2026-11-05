# Testumgebung, Änderungen und Rückbau

Stand: 2026-11-05. Maßgeblicher Code: Repository `eitsch723723/Vokabeltrainer-Englisch`.

## Veröffentlichung

- Produktion: `https://eitsch723723.github.io/Vokabeltrainer-Englisch/`, Quelle `main`.
- Vorschau: `https://eitsch723723.github.io/Vokabeltrainer-Englisch/test/`, Quelle `feature/oral-vocabulary-quiz`.
- Ein gemeinsamer GitHub-Actions-Workflow `.github/workflows/pages.yml` kombiniert beide Quellbäume in **einem** Pages-Artefakt; es findet kein Merge des Features nach `main` statt.
- Änderungen am Feature-Branch sollen die Testversion aktualisieren; Änderungen an `main` die Produktionsversion.
- Relative Pfade für CSV/JS/CSS/Manifest/Service Worker bleiben innerhalb ihrer jeweiligen Unterverzeichnisse.
- Unterschiedliche IndexedDB-Namen: `vokabeltrainer-englisch` (Produktion) und `vokabeltrainer-englisch-test` (Vorschau).
- Der Vorschau-Service-Worker löscht beim Aktivieren nur Caches mit Prefix `vokabeltrainer-test-`, niemals die Produktions-Caches.

## Reproduzierbarer Ausgangszustand

- Produktiver Pages-Workflow wurde ursprünglich auf `main` im Commit **0d7e8e8203f9ee6dfe6deff1488e59a1bf16ca48** umgestellt, davor galt Commit **b353723b7c6f0cd50f1c45b794792589cad98a2b**.
- Vor Beginn der Zehner-Runden-/Testarbeiten stand der Feature-Branch auf Commit **651bbb5da4a154c3250ee032fa73c3a24d00008a**.
- Das Feature bleibt in Draft-PR **#6**; kein Merge ohne separate Nutzerfreigabe.
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
