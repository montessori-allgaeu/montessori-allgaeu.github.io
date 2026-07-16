# AGENTS.md

## Strategische Grundlage zuerst lesen

Vor Änderungen an Positionierung, Informationsarchitektur, Texten, Design oder Nutzerführung muss [`docs/positionierung-und-website-strategie.md`](docs/positionierung-und-website-strategie.md) vollständig gelesen werden.

Dieses Dokument ist die verbindliche Zusammenfassung der bestätigten Zielgruppen, Fit-Kriterien, pädagogischen Aussagen, Arbeitgeberpositionierung, Designrichtung und offenen Entscheidungen. Bei Widersprüchen nicht stillschweigend neu interpretieren, sondern die Abweichung sichtbar machen und klären.

## Unverrückbare Leitplanken

- Das Kind und seine eigenständige Entwicklung stehen im Mittelpunkt.
- Kindergarten und Schule bilden einen gemeinsamen Weg bis zur 10. Klasse.
- Die Gemeinschaftsprinzipien gehören unter **Gemeinschaft**, nicht unter **Montessori**.
- Prinzipien sind Entscheidungsprinzipien für Menschen mit Verantwortung, keine allgemeinen Markenwerte.
- Die Website optimiert auf passende Familien und Pädagog:innen, nicht auf maximale Anfragezahl.
- Montessori wird als Freiheit innerhalb klarer, liebevoller Grenzen erklärt.
- Hohe pädagogische Qualität und Anspruch dürfen sichtbar sein; keine Luxus- oder Statuspositionierung.
- Keine abwertenden oder pauschal ausschließenden Aussagen über Kinder, Behinderung, Lerntempo oder Unterstützungsbedarf.
- Quereinstieg nicht prominent bewerben.
- Keine Allgäu-Tourismusästhetik.
- Authentische Monte-Bilder haben Vorrang vor generischen Stock- oder KI-Bildern.

## Content und Fakten

- Zeitbezogene Angaben vor Veröffentlichung prüfen: Kosten, Stunden, Termine, Stellen, Rollen, Fotofreigaben, Kontakt- und Rechtstexte.
- Unsichere Angaben klar markieren; keine Lücken durch plausible Annahmen füllen.
- Änderungen an grundlegender Positionierung oder bestätigten Entscheidungen auch im Strategiedokument nachführen.
- Prinzipienänderungen nicht nur in Website-Texten vornehmen. Zuerst den aktuellen beschlossenen Stand und die gewünschte Versionierung klären.

Wichtige Content-Pfade:

- `src/data/site.ts`: Navigation, Kontaktdaten, Prinzipien
- `src/data/jobs.ts`: Stellenangebote
- `src/data/team.ts`: Team und Rollen
- `src/pages/termine.astro`: Termine
- `src/pages/kennenlernen/kosten.astro`: Beiträge und Elternarbeit
- `public/downloads/`: veröffentlichte Dokumente
- `src/data/legacy.ts`: alte Weiterleitungen

## Design

- Designrichtung 1 fortführen: warm, ruhig, redaktionell, hochwertig und montessorisch.
- Bestehende Tokens und Komponenten verwenden, bevor neue Muster eingeführt werden.
- Newsreader für emotionale Headlines, Manrope für UI und Fließtext.
- Creme, Waldgrün, Terrakotta und Ocker bilden die Kernpalette.
- Keine unnötigen Rundungen, App-Karten, lauten Animationen oder dekorativen Effekte.
- Responsive Verhalten und echte Inhalte gemeinsam prüfen; Desktop-Screenshots allein reichen nicht.
- Designreferenz und QA: [`design-qa.md`](design-qa.md) und `artifacts/design-qa/`.

## Technik und Veröffentlichung

- Astro, statischer Output, GitHub Pages.
- Kein CMS, keine Analyse und keine Formulare in V1, sofern nicht ausdrücklich neu entschieden.
- Canonical Domain: `https://www.montessori-allgaeu.de`.
- Pushes auf `main` lösen CI und Pages-Deployment aus.
- Vor Übergabe mindestens ausführen:

```sh
npm run test:ci
git diff --check
```

- Für relevante UI-Änderungen zusätzlich Kernpfade auf Desktop und Mobil im Browser prüfen.
- Nur auf ausdrücklichen Wunsch committen oder pushen.

## Dokumentation aktuell halten

- Technische Betriebsinformationen gehören in [`README.md`](README.md).
- Strategische Entscheidungen gehören in [`docs/positionierung-und-website-strategie.md`](docs/positionierung-und-website-strategie.md).
- Visuelle Vergleichsergebnisse gehören in [`design-qa.md`](design-qa.md).
- Wenn eine Änderung Architektur, Content-Ownership oder den Veröffentlichungsweg verändert, die betroffenen Dokumente im selben Change aktualisieren.
