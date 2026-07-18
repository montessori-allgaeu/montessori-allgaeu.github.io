# Inhalte über Pages CMS pflegen

Pages CMS stellt für die regelmäßig wechselnden Website-Inhalte eine einfache Redaktionsoberfläche bereit. Die Inhalte bleiben als Dateien im GitHub-Repository gespeichert; es gibt keine zusätzliche CMS-Datenbank.

## Einmalige Einrichtung

1. Den direkten Favoriten [Website-Inhalte bearbeiten](https://app.pagescms.org/montessori-allgaeu/montessori-allgaeu.github.io/main) öffnen.
2. Die GitHub-App von Pages CMS ausschließlich für `montessori-allgaeu/montessori-allgaeu.github.io` installieren.
3. Das Repository und den Branch `main` öffnen. Pages CMS liest die Konfiguration aus `.pages.yml` automatisch ein.
4. Nathanael in Pages CMS als Redakteur einladen. Redakteure können Inhalte und Medien pflegen, aber weder die CMS-Konfiguration noch andere Codebereiche verwalten.
5. Falls `main` durch GitHub-Regeln vor direkten Änderungen geschützt ist, muss die Pages-CMS-App für Inhaltsänderungen schreiben dürfen. Der vereinbarte Pflegeweg verwendet keine Pull Requests.

Die GitHub-App benötigt Schreibzugriff auf Repository-Inhalte. Vor der Installation deshalb prüfen, dass sie nur für dieses Repository freigegeben wird.

## So wird veröffentlicht

1. Den gewünschten Bereich in Pages CMS öffnen.
2. Inhalte ändern oder einen neuen Eintrag anlegen.
3. Neue Termine, Stellen, Personen und Downloads zuerst mit dem Status **Entwurf – nicht auf Website** speichern.
4. Die Angaben prüfen.
5. Wenn alles stimmt, den Status auf **Veröffentlicht – auf Website** setzen und erneut speichern.

Pages CMS erzeugt dabei einen Git-Commit auf `main`. GitHub Actions prüft und baut die Website. Nur ein erfolgreicher Build wird über GitHub Pages veröffentlicht; bei einem Fehler bleibt die zuvor veröffentlichte Version online.

## Pflegebereiche

### Termine

Termine werden nach Datum sortiert. Bei einem neuen Termin bleibt das Datum bewusst leer und die Kategorie wird aus einer festen Liste gewählt. Die Uhrzeit ist absichtlich ein Textfeld und kann auch Angaben wie „Uhrzeit über die interne Einladung“ enthalten. Abgelaufene Termine werden nicht automatisch entfernt; sie müssen auf **Entwurf** gesetzt oder gelöscht werden.

### Stellenangebote

Der Dateiname eines neuen Stellenangebots bildet die dauerhafte URL. Die Stellenbezeichnung darf danach geändert werden, die URL bleibt stabil. Bereich, Beschäftigungsumfang und optionaler Start werden getrennt gepflegt. Einleitung, Hintergrund, Aufgaben, Profil, konkrete Vorteile und die Einladung zur Bewerbung werden je Stelle aus der verbindlichen Anzeige übernommen. Über **Position in der Stellenliste** wird die Darstellung gesteuert; `10` steht weiter oben als `20`.

### Team

Für jedes Teammitglied werden unter **Rollen und Bereiche** ein oder mehrere Einsätze gepflegt. So können Leitungen sowohl im Bereich **Leitung** als auch in ihrer pädagogischen Rolle erscheinen. Primaria und Sekundaria werden zusätzlich in **Klassenleitungen** und **Pädagogische Assistenzen** gegliedert. Die Position wird je Einsatz vergeben; `10` steht weiter oben als `20`. Fotos können als JPG, PNG oder WebP über das jeweilige Teammitglied ausgewählt werden; Astro optimiert sie beim Build. Ohne Foto zeigt die Website vorübergehend die Initialen.

### Downloads

Neue PDFs werden im Bereich **Downloads** ausgewählt und nach `public/downloads/` geladen. Nathanael pflegt nur den optionalen Dokumentstand und einen optionalen kurzen Hinweis. `PDF` und die tatsächliche Dateigröße ergänzt die Website beim Build automatisch. Ein ersetztes Dokument sollte einen nachvollziehbaren Dateinamen und einen aktualisierten Stand erhalten.

### Stammdaten

Die früher gemeinsame Großmaske ist in sechs kurze Seiten aufgeteilt:

- **Kontakt & Anschrift**
- **Öffnungszeiten**
- **Mittagessen**
- **Schulgeld**
- **Kindergartenbeiträge**
- **Einlage, Elternarbeit & Verein**

Telefonlinks, die vollständige sichtbare Ortszeile sowie Dateityp und Dateigröße von PDFs erzeugt die Website automatisch. Diese Angaben müssen nicht doppelt gepflegt werden.

Zeitbezogene Angaben müssen vor dem Speichern anhand der aktuellen Verträge oder verbindlichen Beschlüsse geprüft werden. Rechtliche Formulierungen und grundlegende Seitentexte außerhalb des freigegebenen Spendenbereichs sind nicht über das CMS editierbar.

### Spendenseite

Die Maske **Spendenseite** pflegt den vollständigen sichtbaren Inhalt der Seite sowie den ruhigen Unterstützerhinweis auf der Startseite. Dazu gehören:

- Seitentitel, Seitenbeschreibung, Einstieg und Wirkungsbeschreibung
- ein bis vier aktuelle Förderschwerpunkte samt Reihenfolge
- Empfänger, Bank, IBAN, BIC und Verwendungszweck
- Ansprache von Firmen und größeren Förderpersonen
- Ablauf und E-Mail-Betreff für Zuwendungsbestätigungen
- Texte und Linkbeschriftungen für weitere Unterstützung

Layout, Bildauswahl, Navigation und feste Zielseiten bleiben im Code geschützt. Die Kontaktadresse der E-Mail-Links kommt aus **Kontaktdaten, Zeiten und Kosten** und muss deshalb nicht doppelt gepflegt werden.

Vor jeder Änderung der Kontodaten, Förderschwerpunkte oder Bescheinigungsangaben den aktuellen Stand mit Geschäftsführung beziehungsweise Finanzvorstand bestätigen. Nur Vorhaben veröffentlichen, deren Bedarf, Zuständigkeit und Verwendung intern geklärt sind. Bei zweckgebundenen, größeren sowie Sach- oder Leistungsspenden soll die persönliche Abstimmung bestehen bleiben.

## Ausblenden, Löschen und Wiederherstellen

Der Status **Entwurf – nicht auf Website** ist der sichere Weg, einen Termin, eine Stelle, eine Person oder einen Download vorübergehend zu entfernen. Löschen entfernt auch die Inhaltsdatei aus dem Repository.

Jede Änderung bleibt in der Git-Historie nachvollziehbar. Falls etwas versehentlich veröffentlicht wurde, kann die technische Website-Verantwortung den betreffenden Commit über GitHub zurücksetzen.

## Technische Zuordnung

- CMS-Konfiguration: `.pages.yml`
- Validierung: `src/content.config.ts`
- Kontakt & Anschrift: `src/content/settings/contact.yml`
- Öffnungszeiten: `src/content/settings/opening-hours.yml`
- Mittagessen: `src/content/settings/meals.yml`
- Schulgeld: `src/content/settings/school-fees.yml`
- Kindergartenbeiträge: `src/content/settings/kindergarten-fees.yml`
- Einlage, Elternarbeit & Verein: `src/content/settings/community-contributions.yml`
- Spendenseite: `src/content/donations/page.yml`
- Termine: `src/content/events/`
- Stellen: `src/content/jobs/`
- Team: `src/content/team/`
- Downloads: `src/content/downloads/`
- Teamfotos: `src/assets/images/team/`
- PDF-Dateien: `public/downloads/`
