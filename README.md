# Montessori Allgäu – Website

Statische Website für Montessori-Kindergarten und Schule Allgäu. Gebaut mit Astro und für GitHub Pages vorbereitet.

## Strategische Grundlage

Die bestätigte Positionierung, Zielgruppenlogik, Content-Architektur und Designrichtung stehen in [`docs/positionierung-und-website-strategie.md`](docs/positionierung-und-website-strategie.md). Die verbindliche Web-Übersetzung des Corporate-Design-Manuals steht in [`docs/corporate-design-web.md`](docs/corporate-design-web.md). Hinweise für zukünftige Agenten und Mitwirkende stehen in [`AGENTS.md`](AGENTS.md).

## Lokal starten

```sh
npm install
npm run dev
```

Die Website läuft anschließend unter `http://localhost:4321/`.

Der Dev-Server baut den Astro-Content-Cache bei jedem Start neu auf. Nach Änderungen an der
Inhaltsstruktur oder an `src/content.config.ts` einen bereits laufenden Dev-Server neu starten.
Falls eine manuelle Aktualisierung nötig ist, steht zusätzlich `npm run content:refresh` zur
Verfügung.

## Qualitätschecks

```sh
npm run test:ci
```

Zusätzlich gibt es browserbasierte Tests:

```sh
npx playwright install chromium
npm run test:e2e
```

Für einen manuellen Mobil-Screenshot Chromium direkt über den vorbereiteten Befehl starten:

```sh
npm run screenshot:mobile -- --full-page http://127.0.0.1:4321/ /tmp/montessori-mobile.png
```

Nicht den eigenständigen Playwright-CLI-Schalter `--device "iPhone 13"` verwenden. Dieser wählt
unabhängig von `--browser chromium` WebKit und kann in einer eingeschränkten macOS-Umgebung schon
beim Start der Browser-App abbrechen. Die E2E-Projekte in `playwright.config.ts` laufen weiterhin
auf Chromium.

## Inhalte pflegen

- Redaktionsoberfläche: [Pages CMS](https://app.pagescms.org)
- Kurzanleitung für Nathanael: [`docs/redaktions-kurzanleitung.md`](docs/redaktions-kurzanleitung.md)
- Kontaktdaten, Aufnahme, Öffnungszeiten und Kosten: `src/content/settings/*.yml`
- Spendenseite und aktuelle Förderschwerpunkte: `src/content/donations/page.yml`
- Termine: `src/content/events/`
- Team: `src/content/team/` und `src/assets/images/team/`
- Elternbeirat: `src/content/parent-council/` und `src/assets/images/parent-council/`
- Stellenangebote: `src/content/jobs/`
- Nachmittagsangebote: `src/content/afternoon-offers/`
- Aktives Schuljahr und Rahmen der Kurswahl: `src/content/settings/afternoon-program.yml`
- Kindergartenjahr und Anmeldeschluss: `src/content/settings/kindergarten-admission.yml`
- Schuljahr und Anmeldeschluss: `src/content/settings/school-admission.yml`
- Download-Metadaten: `src/content/downloads/`
- Alte Weiterleitungen: `src/data/legacy.ts`
- Downloads: `public/downloads/`
- Navigation und Prinzipien: `src/data/site.ts`
- Globale SEO- und Social-Metadaten: `src/layouts/BaseLayout.astro`
- Social-Share-Grafik: `public/social-card-montessori-allgaeu.jpg`

Pages CMS stellt eine eingeschränkte Oberfläche für operative Inhalte und die freigegebenen Inhalte der Spendenseite bereit und speichert Änderungen direkt als Git-Commit auf `main`. Neue Termine, Stellen, Team- und Elternbeiratsmitglieder, Nachmittagsangebote und Downloads beginnen als Entwurf. Astro validiert die Inhalte beim Build; nur ein erfolgreicher Build wird automatisch veröffentlicht. Die Seite verwendet weiterhin keine CMS-Datenbank, keine Analyse und keine Formulare.

Die vollständige Anleitung für Einrichtung, Pflege und Wiederherstellung steht in [`docs/inhalte-pflegen.md`](docs/inhalte-pflegen.md).

## Veröffentlichung über GitHub Pages

Vorgesehen ist die GitHub-Organisation `montessori-allgaeu` mit dem Repository `montessori-allgaeu.github.io`. Der Workflow `.github/workflows/deploy.yml` baut den statischen Astro-Output und veröffentlicht das Verzeichnis `dist` über GitHub Pages.

Vor dem ersten Deployment:

1. GitHub-Organisation und Repository anlegen.
2. Unter **Settings → Pages → Source** „GitHub Actions“ wählen.
3. Custom Domain in den Pages-Einstellungen auf `montessori-allgaeu.de` setzen.
4. Domain in der Organisation verifizieren.
5. Erst danach DNS umstellen und HTTPS aktivieren.

## DNS-Cutover

Geplante Zielkonfiguration:

- `www` als `CNAME` auf `montessori-allgaeu.github.io`
- Apex-Domain mit den aktuell von GitHub dokumentierten `A`- und optional `AAAA`-Records
- Kein Wildcard-DNS
- Canonical Domain: `montessori-allgaeu.de`

GitHub leitet bei korrekt gesetzter Apex- und `www`-Konfiguration automatisch auf die in Pages hinterlegte Canonical Domain um. DNS-Werte immer unmittelbar vor dem Cutover mit der aktuellen GitHub-Dokumentation abgleichen.

## Weiterleitungen alter Adressen

In der aktuellen statischen GitHub-Pages-Konfiguration stehen keine individuellen serverseitigen
301- oder 308-Weiterleitungen zur Verfügung. Deshalb erzeugt Astro für jeden Eintrag in
`src/data/legacy.ts` eine statische Weiterleitungsseite. Sie verwendet einen sofortigen Meta-Refresh,
verweist per Canonical auf die Zielseite und leitet im Browser zusätzlich mit `location.replace`
weiter. [Google interpretiert einen sofortigen Meta-Refresh als permanente
Weiterleitung](https://developers.google.com/search/docs/crawling-indexing/301-redirects).

Falls später eine vorgeschaltete Redirect-Schicht eingesetzt wird, sollen dieselben Zuordnungen dort
als serverseitige 301- oder 308-Weiterleitungen abgebildet werden. Die alten Weiterleitungen sollten
nach dem Domain-Cutover stichprobenartig geprüft und dauerhaft beibehalten werden.

## Vor dem öffentlichen Launch bestätigen

- Alle Beiträge, Einlagen, Elternarbeitsstunden und Öffnungszeiten
- Kindergartenstaffel: insbesondere die korrigierte Stufe 5 bis unter 6 Stunden
- Aktive Stellenangebote und Bewerbungsadresse
- Aufnahmefristen und öffentliche Termine
- Team- und Elternbeiratsnamen, Rollen und Einwilligungen für Fotos
- Vorstand, Aufsichtsbehörden, Impressum und Datenschutzerklärung rechtlich prüfen
- Spendenkonto und Prozess für Zuwendungsbestätigungen
- Weiterleitungen der alten Jimdo-Adressen nach dem Domain-Cutover stichprobenartig prüfen
