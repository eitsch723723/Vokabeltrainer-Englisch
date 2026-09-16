# Vokabeltrainer-Englisch

Statische Englisch–Deutsch-Vokabeltrainer-Web-App für GitHub Pages. Alle Nutzerdaten werden ausschließlich lokal im Browser gespeichert.

## Architektur

Die Anwendung nutzt bewusst keinen Build-Schritt und keine Framework-Abhängigkeit. Das reduziert Fehlerquellen auf GitHub Pages und in Safari.

- `src/domain/`: versioniertes Vokabel-Datenmodell und Migrationen
- `src/repository/`: IndexedDB-Persistenz hinter einer Repository-Schicht
- `src/services/`: Antwortbewertung, Lernalgorithmus, Duplikate, Übersetzungsvorschläge, OCR, Aussprache und Backup
- `src/app.js`: UI- und Application-Orchestrierung
- `tests/`: deterministische Tests der fachlichen Logik
- `sw.js` / `manifest.webmanifest`: PWA-Grundstruktur mit relativen Pfaden

## Datenmodell und Lernlogik

Jede Vokabel besitzt getrennte Lernstände für Englisch → Deutsch und Deutsch → Englisch. Gespeichert werden Abfragen, richtige/nahezu richtige/falsche Antworten, Serie, letzte Abfrage, nächste Wiederholung und Wiederholungsintervall. Der Spaced-Repetition-Algorithmus ist bewusst einfach und deterministisch.

Antworten werden normalisiert. Groß-/Kleinschreibung und überflüssige Leerzeichen werden ignoriert. Explizit hinterlegte Alternativen werden als korrekt akzeptiert. Kleine Levenshtein-Abstände werden abhängig von der Wortlänge als „fast richtig“ bewertet; sehr kurze Wörter werden nicht großzügig toleriert.

## Fotoimport

Die OCR läuft lokal im Browser mit Tesseract.js 5.1.1. Die Bibliothek und Sprachmodelle werden beim ersten OCR-Einsatz über ein CDN geladen. Es gibt keinen API-Schlüssel und kein eigenes Backend. Nach OCR wird immer eine Prüfansicht angezeigt; erkannte Paare werden erst nach Nutzerbestätigung gespeichert.

Da OCR bei Fotos, Tabellen und Handschrift nie vollständig zuverlässig ist, ist die Prüfansicht Bestandteil des Datenintegritätskonzepts. Wenn OCR nicht verfügbar ist, kann dieselbe Prüftabelle manuell verwendet werden.

## Übersetzungsvorschläge

Version 1 nutzt bewusst nur einen kleinen lokalen Grundwortschatz sowie bereits gespeicherte Vokabeln. So werden keine geheimen API-Schlüssel benötigt und kein unsicherer Übersetzungsdienst aus dem Browser aufgerufen. Vorschläge sind sichtbar gekennzeichnet und werden erst nach Bestätigung gespeichert.

## Backup

Der Export erzeugt versioniertes JSON mit Vokabeln und Lernständen. Beim Import werden Format und Datenschema validiert. „Sicher zusammenführen“ ergänzt standardmäßig nur neue IDs. Ein vollständiges Ersetzen lokaler Daten erfordert eine separate explizite Bestätigung.

## Tests

```bash
npm test
npm run check
```

Die Tests decken Antwortnormalisierung, Tippfehlertoleranz, Alternativübersetzungen, getrennte Lernrichtungen, Wiederholungsplanung und -priorisierung, Duplikaterkennung, Multiple Choice, OCR-Parsing, Migrationen und Backup-Validierung ab.

## GitHub Pages

Die App verwendet ausschließlich relative Pfade und benötigt keine serverseitigen Routen. Für GitHub Pages kann der Repository-Root des `main`-Branches als Quelle verwendet werden. Ein Reload auf der Startseite funktioniert ohne Server-Routing-Fallback.

## Teststatus

Vor dem Commit wurden 14 automatisierte Logiktests und Syntaxprüfungen erfolgreich ausgeführt. Ein versuchter Headless-Chromium-Smoke-Test konnte in der verfügbaren Ausführungsumgebung nicht gestartet werden und gilt daher nicht als bestandener Browser-Test. Reale iPhone-/iPad-Tests wurden nicht durchgeführt.
