# AGENTS.md

## Arbeitsweise und strategische Grundlage

- Nur die für die Änderung relevanten Dateien und Dokumente lesen. Bestehende Muster dort prüfen, wo neue Struktur, neues Verhalten oder neue Gestaltung eingeführt wird.
- Vor Änderungen an Positionierung, Informationsarchitektur, zentralen Botschaften, Designrichtung oder Nutzerführung [`docs/positionierung-und-website-strategie.md`](docs/positionierung-und-website-strategie.md) vollständig lesen.
- Bei begrenzten Änderungen innerhalb einer bestehenden Seite genügt die Prüfung der relevanten Strategieabschnitte und der Leitplanken in dieser Datei.
- Vor visuellen Systemänderungen zusätzlich [`docs/corporate-design-web.md`](docs/corporate-design-web.md) vollständig lesen. Bei Änderungen mit bestehenden Komponenten genügt die Prüfung der betroffenen Tokens und Komponenten.

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
- Prinzipienänderungen nicht nur in Website-Texten vornehmen. Zuerst den aktuellen beschlossenen Stand und die gewünschte Versionierung klären.

Wichtige Content-Pfade:

- `.pages.yml`: Redaktionsoberfläche
- `src/content.config.ts`: Validierung redaktioneller Inhalte
- `src/content/settings/*.yml`: Kontaktdaten, Öffnungszeiten und Kosten
- `src/content/donations/page.yml`: Spendenseite und aktuelle Förderschwerpunkte
- `src/content/jobs/`: Stellenangebote
- `src/content/team/`: Team und Rollen
- `src/content/events/`: Termine
- `src/content/downloads/`: Download-Metadaten
- `src/assets/images/team/`: Teamfotos
- `public/downloads/`: veröffentlichte Dokumente
- `src/data/site.ts`: Navigation und Prinzipien
- `src/data/legacy.ts`: alte Weiterleitungen

## Design

- Designrichtung 1 fortführen: warm, ruhig, redaktionell, hochwertig und montessorisch.
- Bestehende Tokens und Komponenten verwenden, bevor neue Muster eingeführt werden.
- Unica One für emotionale Headlines und ausgewählte Display-Elemente, Krub für UI und Fließtext.
- Die bestätigte Stage-Palette verwenden: Papier `#f5f1ec` und `#fbfaf7`, Waldgrün `#1d2b1e`, Terrakotta `#b85b2d`/`#98431c` und Ocker `#d7a24b`. Keine pastelligen Abschnittstönungen oder mehrfarbigen Akzentlinien einführen.
- Keine unnötigen Rundungen, App-Karten, lauten Animationen oder dekorativen Effekte.
- Responsive Verhalten und echte Inhalte gemeinsam prüfen; Desktop-Screenshots allein reichen nicht.

## Technik und Veröffentlichung

- Astro, statischer Output, GitHub Pages.
- Pages CMS dient als Git-basierte Redaktionsoberfläche; keine CMS-Datenbank, Analyse oder Formulare in V1, sofern nicht ausdrücklich neu entschieden.
- Canonical Domain: `https://montessori-allgaeu.de`.
- Pushes auf `main` lösen CI und Pages-Deployment aus.
- Nur auf ausdrücklichen Wunsch committen oder pushen.

## Verifikation nach Änderungstyp

- Reine Text- oder Contentänderungen: `git diff --check`; keine Tests. Die betroffene Seite nur dann im Browser prüfen, wenn Umfang oder Zeilenlänge das Layout sichtbar beeinflussen können.
- Code-, Konfigurations- oder Strukturänderungen: Während der Arbeit die kleinste relevante Prüfung ausführen; vor Übergabe mindestens:

```sh
npm run test:ci
git diff --check
```

- UI-Änderungen: Zusätzlich den betroffenen Kernpfad auf Desktop und Mobil im Browser prüfen, wenn sich Layout, Navigation, responsives Verhalten, Interaktion oder visuelle Hierarchie ändern. Die Prüfung auf die tatsächlich betroffenen Pfade begrenzen.
- Nicht ausgeführte oder fehlgeschlagene Prüfungen mit Grund und konkreten manuellen Prüfschritten dokumentieren.

## Dokumentation aktuell halten

- [`README.md`](README.md) im selben Change aktualisieren, wenn sich Betrieb, Entwicklung oder Veröffentlichung ändern.
- [`docs/positionierung-und-website-strategie.md`](docs/positionierung-und-website-strategie.md) im selben Change aktualisieren, wenn sich bestätigte Positionierung oder strategische Entscheidungen ändern.
- Weitere betroffene Dokumentation im selben Change aktualisieren, wenn sich Architektur, Content-Ownership oder Nutzerabläufe wesentlich ändern.
- Lokale Implementierungsdetails und reine Contentänderungen benötigen keine zusätzliche Dokumentation.
