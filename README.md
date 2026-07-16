# Montessori Allgäu – Website

Statische Website für Montessori-Kindergarten und Schule Allgäu. Gebaut mit Astro und für GitHub Pages vorbereitet.

## Strategische Grundlage

Die bestätigte Positionierung, Zielgruppenlogik, Content-Architektur und Designrichtung stehen in [`docs/positionierung-und-website-strategie.md`](docs/positionierung-und-website-strategie.md). Hinweise für zukünftige Agenten und Mitwirkende stehen in [`AGENTS.md`](AGENTS.md).

## Lokal starten

```sh
npm install
npm run dev
```

Die Website läuft anschließend unter `http://localhost:4321/`.

## Qualitätschecks

```sh
npm run test:ci
```

Zusätzlich gibt es browserbasierte Tests:

```sh
npx playwright install chromium
npm run test:e2e
```

## Inhalte pflegen

- Kontaktdaten, Navigation und Prinzipien: `src/data/site.ts`
- Team: `src/data/team.ts` und `src/assets/images/team/`
- Stellenangebote: `src/data/jobs.ts`
- Alte Weiterleitungen: `src/data/legacy.ts`
- Termine: `src/pages/termine.astro`
- Downloads: `public/downloads/`
- Globale SEO- und Social-Metadaten: `src/layouts/BaseLayout.astro`
- Social-Share-Grafik: `public/social-card-montessori-allgaeu.jpg`

Die Seite verwendet kein CMS, keine Analyse und keine Formulare. Änderungen werden im Repository vorgenommen und nach einem Push auf `main` automatisch veröffentlicht, sobald die Qualitätschecks erfolgreich abgeschlossen sind.

## Veröffentlichung über GitHub Pages

Vorgesehen ist die GitHub-Organisation `montessori-allgaeu` mit dem Repository `montessori-allgaeu.github.io`. Der Workflow `.github/workflows/deploy.yml` baut den statischen Astro-Output und veröffentlicht das Verzeichnis `dist` über GitHub Pages.

Vor dem ersten Deployment:

1. GitHub-Organisation und Repository anlegen.
2. Unter **Settings → Pages → Source** „GitHub Actions“ wählen.
3. Custom Domain in den Pages-Einstellungen auf `www.montessori-allgaeu.de` setzen.
4. Domain in der Organisation verifizieren.
5. Erst danach DNS umstellen und HTTPS aktivieren.

## DNS-Cutover

Geplante Zielkonfiguration:

- `www` als `CNAME` auf `montessori-allgaeu.github.io`
- Apex-Domain mit den aktuell von GitHub dokumentierten `A`- und optional `AAAA`-Records
- Kein Wildcard-DNS
- Canonical Domain: `www.montessori-allgaeu.de`

GitHub leitet bei korrekt gesetzter Apex- und `www`-Konfiguration automatisch auf die in Pages hinterlegte Canonical Domain um. DNS-Werte immer unmittelbar vor dem Cutover mit der aktuellen GitHub-Dokumentation abgleichen.

## Vor dem öffentlichen Launch bestätigen

- Alle Beiträge, Einlagen, Elternarbeitsstunden und Öffnungszeiten
- Kindergartenstaffel: insbesondere die korrigierte Stufe 5 bis unter 6 Stunden
- Aktive Stellenangebote und Bewerbungsadresse
- Aufnahmefristen und öffentliche Termine
- Teamnamen, Rollen und Einwilligungen für Fotos
- Vorstand, Aufsichtsbehörden, Impressum und Datenschutzerklärung rechtlich prüfen
- Spendenkonto und Prozess für Zuwendungsbestätigungen
- Weiterleitungen der wichtigsten alten Jimdo-Adressen
