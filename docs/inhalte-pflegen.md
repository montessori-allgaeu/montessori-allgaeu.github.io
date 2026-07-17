# Inhalte über Pages CMS pflegen

Pages CMS stellt für die regelmäßig wechselnden Website-Inhalte eine einfache Redaktionsoberfläche bereit. Die Inhalte bleiben als Dateien im GitHub-Repository gespeichert; es gibt keine zusätzliche CMS-Datenbank.

## Einmalige Einrichtung

1. Mit einem GitHub-Konto unter [app.pagescms.org](https://app.pagescms.org) anmelden.
2. Die GitHub-App von Pages CMS ausschließlich für `montessori-allgaeu/montessori-allgaeu.github.io` installieren.
3. Das Repository und den Branch `main` öffnen. Pages CMS liest die Konfiguration aus `.pages.yml` automatisch ein.
4. Nathanael in Pages CMS als Redakteur einladen. Redakteure können Inhalte und Medien pflegen, aber weder die CMS-Konfiguration noch andere Codebereiche verwalten.
5. Falls `main` durch GitHub-Regeln vor direkten Änderungen geschützt ist, muss die Pages-CMS-App für Inhaltsänderungen schreiben dürfen. Der vereinbarte Pflegeweg verwendet keine Pull Requests.

Die GitHub-App benötigt Schreibzugriff auf Repository-Inhalte. Vor der Installation deshalb prüfen, dass sie nur für dieses Repository freigegeben wird.

## So wird veröffentlicht

1. Den gewünschten Bereich in Pages CMS öffnen.
2. Inhalte ändern oder einen neuen Eintrag anlegen.
3. Pflichtfelder und den Schalter **Auf Website anzeigen** prüfen.
4. Speichern.

Pages CMS erzeugt dabei einen Git-Commit auf `main`. GitHub Actions prüft und baut die Website. Nur ein erfolgreicher Build wird über GitHub Pages veröffentlicht; bei einem Fehler bleibt die zuvor veröffentlichte Version online.

## Pflegebereiche

### Termine

Termine werden nach Datum sortiert. Die Uhrzeit ist absichtlich ein Textfeld und kann auch Angaben wie „Uhrzeit über die interne Einladung“ enthalten. Abgelaufene Termine werden nicht automatisch entfernt; sie müssen ausgeblendet oder gelöscht werden.

### Stellenangebote

Der Dateiname eines neuen Stellenangebots bildet die dauerhafte URL. Die Stellenbezeichnung darf danach geändert werden, die URL bleibt stabil. Über **Reihenfolge** wird die Darstellung gesteuert; sinnvoll sind Abstände wie `10`, `20`, `30`.

### Team

Teammitglieder werden zuerst nach Bereich und dann nach **Reihenfolge im Bereich** dargestellt. Fotos können als JPG, PNG oder WebP hochgeladen werden; Astro optimiert sie beim Build. Vor der Veröffentlichung müssen Name, Rolle und Fotofreigabe bestätigt sein.

### Downloads

Neue PDFs werden nach `public/downloads/` geladen. Stand und Dateigröße werden als sichtbarer Beschreibungstext manuell gepflegt. Ein ersetztes Dokument sollte einen nachvollziehbaren Dateinamen und einen aktualisierten Stand erhalten.

### Kontaktdaten, Zeiten und Kosten

Diese Maske aktualisiert dieselben Angaben überall auf der Website. Dazu gehören:

- E-Mail-Adressen, Telefonnummern und Anschrift
- Öffnungszeiten von Schulbüro und Kindergarten
- Ganztags- und Mittagessensangaben
- Schulgeld, Kindergartenbeiträge und Elterneinlage
- Elternarbeitsstunden und Vereinsbeiträge

Zeitbezogene Angaben müssen vor dem Speichern anhand der aktuellen Verträge oder verbindlichen Beschlüsse geprüft werden. Rechtliche Formulierungen und grundlegende Seitentexte sind nicht über das CMS editierbar.

## Ausblenden, Löschen und Wiederherstellen

**Auf Website anzeigen** ist der sichere Weg, einen Termin, eine Stelle, eine Person oder einen Download vorübergehend zu entfernen. Löschen entfernt auch die Inhaltsdatei aus dem Repository.

Jede Änderung bleibt in der Git-Historie nachvollziehbar. Falls etwas versehentlich veröffentlicht wurde, kann die technische Website-Verantwortung den betreffenden Commit über GitHub zurücksetzen.

## Technische Zuordnung

- CMS-Konfiguration: `.pages.yml`
- Validierung: `src/content.config.ts`
- Kontaktdaten, Zeiten und Kosten: `src/content/settings/website.yml`
- Termine: `src/content/events/`
- Stellen: `src/content/jobs/`
- Team: `src/content/team/`
- Downloads: `src/content/downloads/`
- Teamfotos: `src/assets/images/team/`
- PDF-Dateien: `public/downloads/`
