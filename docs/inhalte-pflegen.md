# Inhalte in der Monte-Verwaltung pflegen

Die [Monte-Verwaltung](https://verwaltung.montessori-allgaeu.de) ersetzt Pages CMS vollständig. Die kurze Anleitung für das Team steht in [redaktions-kurzanleitung.md](redaktions-kurzanleitung.md); Einrichtung und Wiederherstellung sind in [verwaltung-betrieb.md](verwaltung-betrieb.md) beschrieben.

## Speichern und Veröffentlichung

Eine Änderung wird mit **Speichern** zur Prüfung und automatischen Veröffentlichung übergeben. Es gibt keine Entwürfe, Freigaben oder gesonderte Veröffentlichung. Einträge sind vorhanden oder gelöscht. **Löschen** entfernt einen Eintrag nach Bestätigung aus der Verwaltung und über denselben geprüften Veröffentlichungsweg von der Website. Es gibt kein Ausblenden oder Einblenden. Fest verknüpfte Pflichtunterlagen, Einstellungen und das letzte Angebot des aktiven Nachmittagsprogramms können nicht gelöscht werden. Frühere Inhalte bleiben in der Git-Historie wiederherstellbar; Medien werden beim Löschen eines Eintrags nicht automatisch entfernt.

Die Verwaltung zeigt getrennt an, ob eine Änderung geprüft wird, gespeichert ist oder bereits auf der Website sichtbar ist. Der Inhalt wird erst nach erfolgreichen Prüfungen nach `main` geschrieben. Die Website erhält anschließend das geprüfte Ergebnis. Bei Fehlern bleiben zuvor veröffentlichte Inhalte online; ein fehlgeschlagener Auftrag kann nach Behebung wiederholt werden. Gleichzeitige Änderungen derselben Datei führen zu einem sichtbaren Konflikt statt zu stillen Überschreibungen.

Die redaktionellen Daten und Medien bleiben im GitHub-Repository. Benutzer, Passkeys, Sitzungen und Einladungen liegen getrennt im privaten Verwaltungsbackend. Für das Team ist kein GitHub-Zugang erforderlich.

## Inhaltsbereiche und gemeinsame Verwendung

### Termine

Titel, Kategorie, Datum, Uhrzeit, Ort und Beschreibung werden zentral gepflegt. Die Uhrzeit bleibt ein Textfeld, beispielsweise „19:00 Uhr“ oder „Uhrzeit über die interne Einladung“. Vergangene Termine werden in der Verwaltung getrennt angezeigt; auf der vollständigen Terminseite bleiben sie bis zum Löschen vorhanden.

Der Hinweis auf **Kennenlernen** wählt beim Seitenaufruf den nächsten Termin der Kategorien **Kennenlernen** oder **Informationsabend**. Maßgeblich ist Europe/Berlin. Ein Termin bleibt am Veranstaltungstag berücksichtigt; bei gleichem Datum entscheidet der Titel. Ohne passenden Termin oder ohne JavaScript bleibt **Termine ansehen** erreichbar.

### Menschen

**Menschen** zeigt die Bereiche der Website als einzelne Listen: Leitung, Kindergarten, Primaria, Sekundaria, Tertia, weitere pädagogische Mitarbeiter, Verwaltung, Vorstand sowie Elternbeirat Kindergarten und Elternbeirat Schule. Teammitglieder können mehrere Rollen und Bereiche haben. Primaria und Sekundaria sind zusätzlich nach **Klassenleitungen** und **Pädagogischen Assistenzen** getrennt; jede Aufgabe benötigt dort die passende Untergruppe. Bei einem Bereichswechsel entfällt eine nicht mehr passende Untergruppe.

Über **Reihenfolge ändern** lässt sich jede Liste einzeln mit Pfeilen oder durch Ziehen sortieren. Jede Verschiebung wird direkt gespeichert und veröffentlicht. Bei Personen mit mehreren Aufgaben ändert sich nur die Position in der gewählten Liste. **Hinzufügen** füllt den jeweiligen Bereich und gegebenenfalls die Untergruppe vor. Namen, Fotos und weitere Aufgaben bleiben im gemeinsamen Personeneintrag; vorhandene Personen für zusätzliche Aufgaben deshalb öffnen statt neu anlegen.

Die Rolle **Vorstand** wird auch für Verein und Impressum verwendet. Personen deshalb nicht mehrfach anlegen. Fotos werden bei der Person ersetzt; ohne Foto erscheinen Initialen. Die Kontaktadressen des Elternbeirats werden zentral unter **Kontakt & Zeiten** geändert.

### Stellen

Die Kennung einer Stelle bildet ihre dauerhafte URL. Änderungen der Stellenbezeichnung verändern diese Kennung nicht. Bereich, Umfang, Beschäftigungsarten und gegebenenfalls Start und Bewerbungsende getrennt pflegen. Das ursprüngliche Veröffentlichungsdatum wird bei neuen Stellen vorausgefüllt und bei späteren Änderungen beibehalten. Jede Stelle benötigt dieses Datum.

Einleitung, Hintergrund, Aufgaben, Profil, Leistungen und Bewerbungsabschluss stammen aus der verbindlichen Anzeige. Aufgaben-, Profil- und Leistungslisten werden ohne abschließenden Punkt geschrieben. Sichtbarer Inhalt und strukturierte Stelleninformationen für Suchmaschinen verwenden dieselben Daten. Besetzte oder abgelaufene Stellen löschen; ein Bewerbungsende allein entfernt sie nicht automatisch.

### Downloads

Titel, Stand, Hinweis, Gruppe und Reihenfolge werden beim Dokument gepflegt. Dateityp und tatsächliche Dateigröße ergänzt die Website. Die Anmeldeunterlagen für Schule und Kindergarten sowie die Vereinsbeitrittserklärung sind zentral verknüpft. **Datei ersetzen** aktualisiert ihre Verwendung auf Aufnahme-, Kosten-, Vereins- und Spendenseiten. Diese drei Einträge können ersetzt, aber nicht gelöscht werden.

Die beiden bisher ausgeblendeten Kindergarten-Stellen und **Freiraum zur Entfaltung** ohne PDF wurden beim Entfernen des Sichtbarkeitsstatus gelöscht. Ihre früheren Inhalte bleiben in der Git-Historie erhalten.

### Ganztag & Essen

Jedes Angebot wird einmal gepflegt. Die Klassenstufen bestimmen automatisch, ob es unter Primaria, Sekundaria und Tertia oder in beiden Gruppen erscheint. Organisation, zusätzliche Kosten und externer Link bleiben optional.

**Programm für neues Schuljahr übernehmen** kopiert die Angebote zur Bearbeitung im geöffneten Browser. Ein gemeinsames Speichern übernimmt Angebote und aktives Schuljahr zusammen. Es gibt keine gespeicherten Entwürfe. Frühere Schuljahre bleiben erhalten. Für das aktive Schuljahr muss mindestens ein Angebot vorhanden sein.

Bei Essensangaben wird derzeit nur der Anbieter öffentlich verwendet. Die bisher vorhandenen Felder Liefertage, Richtpreis und Hinweis bleiben erhalten und sind als derzeit nicht angezeigt gekennzeichnet. Dasselbe gilt für das ältere Ganztags-Zeitfeld unter Öffnungszeiten. Diese Angaben werden nicht durch die Migration neu veröffentlicht.

### Kontakt & Zeiten, Aufnahme und Kosten

Kontaktdaten und Anschrift werden einmal gepflegt und auf Kontakt-, Aufnahme-, Karriere- und Rechtstextseiten sowie im Footer verwendet. Telefonlinks und die vollständige Ortszeile entstehen automatisch.

Aufnahmejahr und Anmeldeschluss werden für Schule und Kindergarten unabhängig gepflegt. Beim Kindergarten gilt die Schreibweise `2027/2028`, bei der Schule `2027/28`. Diese Jahresangaben werden nicht automatisch mit dem Ganztagsjahr gleichgesetzt.

Gebühren, Zuschüsse, Einlage, Elternarbeit und Vereinsbeiträge bleiben redaktionell bearbeitbar. Bei numerischen Eurobeträgen berechnet die Verwaltung den effektiven Kindergartenbeitrag aus Grundbeitrag und Zuschuss. Redaktionelle Sonderangaben bleiben möglich. Zeitbezogene Werte müssen durch aktuelle Verträge oder verbindliche Beschlüsse gedeckt sein.

### Spenden

Bearbeitbar sind die freigegebenen Texte der Spendenseite und des Startseitenhinweises, ein bis vier Förderschwerpunkte, Suchmaschinenangaben, Kontaktbeschriftungen und E-Mail-Betreffzeilen. Die Kontaktadresse stammt aus den zentralen Kontaktdaten. Startseitenhinweis und Seiteneinstieg sind bewusst verschiedene Texte.

Nur Admins ändern Empfänger, Bank, IBAN und BIC. Der Verwendungszweck bleibt redaktionell bearbeitbar. Kontodaten und Angaben zu Zuwendungsbestätigungen mit Geschäftsführung beziehungsweise Finanzvorstand abstimmen. Layout, Bildauswahl, Navigation, Prinzipien und grundlegende Seitentexte bleiben im Code.

## Technische Quellen

| Inhalt                                             | Quelle                                                                      |
| -------------------------------------------------- | --------------------------------------------------------------------------- |
| Felder, Beschriftungen, Defaults und Pfadfreigaben | `src/admin/content-model.ts`, `src/admin/content-fields.ts`                 |
| Gemeinsame Inhaltsvalidierung                      | `src/admin/content-schemas.ts`                                              |
| Astro-Anbindung                                    | `src/content.config.ts`, `src/data/content.ts`                              |
| Kontakt, Zeiten, Aufnahme, Gebühren und Beiträge   | `src/content/settings/*.yml`                                                |
| Spenden                                            | `src/content/donations/page.yml`                                            |
| Termine, Stellen, Nachmittagsangebote              | `src/content/events/`, `src/content/jobs/`, `src/content/afternoon-offers/` |
| Team und Elternbeirat                              | `src/content/team/`, `src/content/parent-council/`                          |
| PDF-Metadaten und Dateien                          | `src/content/downloads/`, `public/downloads/`                               |
| Porträts                                           | `src/assets/images/team/`, `src/assets/images/parent-council/`              |

Die bisherige Datei `.pages.yml` wird nicht mehr verwendet. Die gemeinsamen Schemas prüfen Inhalte in Verwaltung, Backend und Website. Der vollständige Kandidatenstand wird zusätzlich auf passende Medien, vollständige Einstellungen und ein gültiges aktives Nachmittagsprogramm geprüft.
