# Vokabeltrainer-Englisch

Statische Englisch–Deutsch-Vokabeltrainer-Web-App für GitHub Pages. Die Vokabelsammlung wird zentral als CSV-Datei im Repository gepflegt; der persönliche Lernstand bleibt ausschließlich lokal im Browser.

## Vokabelquelle

Die App lädt beim Start:

`data/vocabulary.csv`

Die CSV ist die maßgebliche Quelle für alle Vokabeltexte. In der App selbst können Vokabeln weder hinzugefügt noch bearbeitet, gelöscht oder per Foto importiert werden.

Schema:

```csv
id,english,german,english_alternatives,german_alternatives,added_at
v0001,house,Haus,,,
v0002,to begin,anfangen,,beginnen,2026-11-05
```

Regeln:

- `id` muss eindeutig und dauerhaft stabil sein.
- `english` und `german` sind Pflichtfelder.
- `added_at` ist das einmalige Hinzufügedatum im Format `YYYY-MM-DD`. Vorhandene Altvokabeln ohne bekanntes Datum lassen das Feld leer; neue Vokabeln erhalten beim Import das tatsächliche Datum. Korrekturen bestehender Einträge ändern das Datum nicht.
- Mehrere alternative korrekte Antworten werden innerhalb der jeweiligen Alternativspalte mit `|` getrennt.
- CSV-Felder mit Kommas müssen in doppelte Anführungszeichen gesetzt werden.
- Wird eine vorhandene Vokabel korrigiert, bleibt ihre ID unverändert. Dadurch bleibt der lokale Lernstand erhalten.
- Wird eine ID aus der CSV entfernt, verschwindet diese Vokabel beim nächsten Abgleich auch aus der App.

## Workflow für neue Vokabeln

Der vorgesehene Pflegeprozess ist:

1. Lehrbuchseite oder Vokabelliste als Bild in ChatGPT hochladen.
2. ChatGPT liest die englisch-deutschen Zuordnungen aus dem Bild aus.
3. Bereits im Bild vorhandene Zuordnungen gelten als maßgebliche Übersetzungen und dürfen nicht eigenständig durch andere Übersetzungen ersetzt werden.
4. Unsichere oder nicht eindeutig lesbare Einträge dürfen nicht stillschweigend geraten werden.
5. ChatGPT prüft die bestehende `data/vocabulary.csv`, vermeidet doppelte Einträge, vergibt für neue Vokabeln neue stabile IDs und setzt für sie `added_at` auf das Hinzufügedatum.
6. ChatGPT aktualisiert die CSV im GitHub-Repository.
7. Die App lädt die aktualisierte CSV beim nächsten Start oder über die Schaltfläche „Aktualisieren“.

Dieser Ablauf benötigt keine API-Schlüssel in der Web-App und hält Foto-/OCR-Logik vollständig aus dem ausgelieferten Client heraus.

## Architektur

Die Anwendung nutzt bewusst keinen Build-Schritt und keine Framework-Abhängigkeit.

- `data/vocabulary.csv`: zentrale Vokabelquelle
- `src/domain/`: versioniertes Vokabel-Datenmodell und Migrationen
- `src/repository/`: IndexedDB-Persistenz für lokalen Lernstand
- `src/services/csvVocabularyService.js`: CSV-Validierung und Synchronisierung mit lokalem Lernstand
- `src/services/progressBackupService.js`: Sicherung und Wiederherstellung ausschließlich des Lernstands
- `src/services/answerEvaluationService.js`: Antwortnormalisierung und Tippfehlertoleranz
- `src/services/learningEngine.js`: Spaced-Repetition-Lernstand und gewichtete Zufallsauswahl
- `src/services/oralQuizService.js`: sitzungsbezogene mündliche Abfrage in Zehner-Runden
- `src/services/multipleChoiceService.js`: Multiple-Choice-Antworten
- `src/services/speechService.js`: Aussprache über SpeechSynthesis
- `src/app.js`: UI- und Application-Orchestrierung
- `sw.js` / `manifest.webmanifest`: PWA-Grundstruktur mit relativen Pfaden

## Datenintegrität

Bei jedem erfolgreichen CSV-Abgleich wird die lokale Vokabelkopie an die Repository-Datei angeglichen. Nur Lernstand und Lernhistorie werden anhand der stabilen ID übernommen. Text, Übersetzungen und Alternativen stammen immer aus der aktuellen CSV.

Kann die CSV vorübergehend nicht geladen werden, verwendet die App die zuletzt erfolgreich synchronisierte lokale Kopie. Die CSV wird im Service Worker gezielt network-first behandelt, damit Änderungen im Repository nicht durch einen alten Cache verdeckt werden.

## Lernstand sichern

Die App kann den lokalen Lernstand als JSON exportieren und später wiederherstellen. Diese Datei enthält nur Vokabel-IDs, Lernstände und Lernhistorie. Sie enthält keine Vokabeltexte und kann die Repository-Vokabeln weder anlegen noch verändern. Beim Wiederherstellen werden nur IDs übernommen, die auch in der aktuellen Repository-CSV vorhanden sind.

## Lernlogik

Englisch → Deutsch und Deutsch → Englisch besitzen getrennte Lernstände. Gespeichert werden Abfragen, richtige/nahezu richtige/falsche Antworten, Serie, letzte Abfrage, nächste Wiederholung und Wiederholungsintervall.

Groß-/Kleinschreibung und überflüssige Leerzeichen werden ignoriert. Explizit in der CSV hinterlegte Alternativen werden akzeptiert. Kleine Tippfehler können als „fast richtig“ bewertet werden.

## Mündlich abfragen

Unter „Abfragen“ startet eine zweite Person eine Runde mit zehn Vokabeln. Frage und alle hinterlegten Übersetzungen sind gleichzeitig sichtbar, die andere Person bewertet die mündliche Antwort mit „Richtig“ oder „Falsch“. Die Richtung Englisch ↔ Deutsch wird bei jeder Frage zufällig bestimmt.

Nach genau zehn Bewertungen wird gestoppt und die Wahl „Abfragen beenden“ oder „Weitere 10 Vokabeln“ angezeigt. Innerhalb einer Runde werden nach Möglichkeit zehn unterschiedliche Vokabeln gefragt. Einmal richtig beantwortete Vokabeln kommen in derselben Sitzung nicht mehr vor; falsch beantwortete werden in späteren Runden bevorzugt. Bei einer vollständig durchgearbeiteten kleinen Sammlung endet die Sitzung gegebenenfalls vor zehn Fragen. Die mündlichen Bewertungen beeinflussen **nicht** den gespeicherten Lernstand. Ein erneuter Start beginnt eine neue Sitzung.

Die gewichtete Auswahl berücksichtigt weiterhin frühere gespeicherte Lernschwierigkeiten und Wiederholungsfälligkeit. Vokabeln mit `added_at` erhalten während der ersten 14 Tage einen linear abnehmenden Neuheitsbonus. Der Vokabelsatz v0243–v0334 wurde mit dem 5. November 2026 als neu erfasst.

## Tests

```bash
npm test
npm run check
# Browsertests laufen in GitHub Actions mit Chromium und WebKit.
```

Die Logiktests decken Antwortnormalisierung, Tippfehlertoleranz, Alternativübersetzungen, getrennte Lernrichtungen, Wiederholungsplanung, Multiple Choice, CSV-Parsing einschließlich Hinzufügedatum, doppelte IDs, Synchronisierung mit Lernstanderhalt, Löschungen, Backup, Datenmigrationen und Zehner-Runden der mündlichen Abfrage ab. GitHub Actions führt ergänzend Playwright-Browsertests für Navigation, die drei Lernmodi, Rundenablauf, Lernstand-Sicherung und getrennte Datenbanken in Chromium sowie WebKit mit iPhone-/iPad-Profilen aus. Das sind **simulierte** Browser-/Gerätetests, keine Tests auf realer Apple-Hardware.

## GitHub Pages

Die App verwendet ausschließlich relative Pfade und benötigt keine serverseitigen Routen. Die Veröffentlichung erfolgt über `.github/workflows/pages.yml`. Der Workflow stellt `main` unter dem Projektstamm (Produktivversion) und `feature/oral-vocabulary-quiz` unter `/test/` (Testversion) bereit. Die Vorschau verwendet eine separate IndexedDB und eigene Service-Worker-Caches. Der Ablauf und die Rückgängigmachung sind in `docs/test-deployment-rollback.md` dokumentiert.

Reale iPhone-/iPad-Tests werden nur dann als durchgeführt dokumentiert, wenn sie tatsächlich auf den Geräten ausgeführt wurden.

## Lernmodus Lückentexte

Unter „Lernen“ den Modus „Lückentexte“ auswählen. Ein einfacher englischer Satz enthält eine Lücke am Anfang, in der Mitte oder am Ende. Bei Wortschatzaufgaben bezeichnet der deutsche Hinweis die gesuchte Vokabel. Bei Satzbauaufgaben hilft er beim Erkennen des Satzmusters. Die Antwort wird aus genau vier verschiedenen englischen Einträgen der aktuellen Repository-Vokabelliste gewählt. Nach der Antwort erscheint der vollständige Satz, der auch vorgelesen werden kann.

Die Satzvorlagen in `src/services/clozeService.js` sind auf passende Vokabeln abgestimmt. Nur vorhandene Vokabeln mit passender Vorlage und mindestens drei eindeutigen Ablenkantworten werden abgefragt. Neue Vokabeln können dort um eine Vorlage mit genau einem `{}` ergänzt werden. Bei Wortschatzaufgaben werden Synonyme und Einträge mit gleicher deutscher Bedeutung als Ablenkantworten ausgeschlossen. Bei Satzbauaufgaben stammen die Optionen aus der passenden Grammatikgruppe; der Satzkontext bestimmt die eindeutige Lösung. Die Antwortreihenfolge wird für jede Aufgabe gemischt und bleibt während der Aufgabe stabil.

Lückentexte üben Englisch; der Lernstand fließt in die bestehende Richtung Deutsch → Englisch ein. Falsche Auswahl wird als falsch bewertet, ohne Tippfehlertoleranz. Die Satzvorlagen funktionieren auch offline.

### Satzbau und gezielte Wiederholung

Lückentexte mischen zwei Satzbauaufgaben mit einer Wortschatzaufgabe. Satzbauaufgaben üben die Personalpronomen I/you/he/she/it/we/they sowie Aussagen und Fragen mit there is / there are / is there / are there. Jede Struktur hat mehrere Kontexte und eine kurze Erklärung nach der Antwort. Die vier grammatischen Wendungen sind als stabile Einträge v0239–v0242 in der Repository-CSV ergänzt. Die Satzbauvorlagen stehen in `src/services/grammarClozeService.js`.

Innerhalb jeder Aufgabengruppe erfolgt eine gewichtete Zufallsauswahl anhand des dauerhaft gespeicherten Deutsch-Englisch-Lernstands. Zuletzt falsch beantwortete Inhalte erhalten zusätzliches Gewicht, auch wenn noch neue Inhalte vorhanden sind. Mehrere erfolgreiche Antworten senken das Gewicht wieder; fällige Wiederholungen erhalten einen Bonus. Die unmittelbar vorherige Vokabel wird nach Möglichkeit ausgeschlossen. Die Mischung bleibt erhalten, damit schwierige Grammatikaufgaben die Wortschatzübungen nicht vollständig verdrängen. Fehlt eine Aufgabengruppe in der aktuellen Vokabelliste, wird die verfügbare Gruppe genutzt. CSV-Aktualisierung und Lernstand-Backup erhalten diese Lernstände wie bisher.
