# KI-generierte Bildserie · Juli 2026

## Status und Verwendung

Die 22 Bilder unter `src/assets/images/generated/` sind eine zeitlich begrenzte Zwischenlösung für
die redaktionellen Foto-Slots der Website. Sie wurden am 17. Juli 2026 mit dem integrierten
Imagegen-Werkzeug erzeugt und anschließend als WebP optimiert.

Alle abgebildeten Personen und Räume sind fiktiv. Die Bilder sind keine dokumentarischen Aufnahmen
realer Kinder, Mitarbeitender oder Räume der Montessori Allgäu. Vor einer öffentlichen
Veröffentlichung muss geklärt werden, wie das transparent kenntlich gemacht wird. Die echten
Team-Porträts wurden nicht verändert.

## Gemeinsame Produktionsvorgabe

Alle Einzelprompts basierten auf dieser gemeinsamen Vorgabe:

> Highly photorealistic professional editorial documentary photography for a small independent
> Montessori kindergarten and school in southern Germany. Slightly older but carefully maintained
> rooms, warm cream walls, natural wood, subtle forest-green and muted terracotta details, soft
> natural daylight, realistic skin, hands, fabric and everyday imperfections, restrained film grain
> and a warm but neutral white balance. Fictional people in candid, believable interactions. No
> text, logos or watermark. Avoid stock-photo smiles, looking at camera, staged posing, luxury
> private-school styling, Alpine tourism, advertising polish, HDR, orange grading, plastic skin,
> excessive bokeh and malformed anatomy.

Das erste Hero-Bild diente den weiteren Generierungen ausschließlich als visuelle Referenz für
Licht, Farbigkeit, Räume und Kamerasprache. Personen und Kompositionen sollten nicht übernommen
werden.

## Motiv-Prompts und Dateien

| Datei                            | Ergänzender Motiv-Prompt                                                                                                                                                                         |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `home-hero.webp`                 | Ein Grundschulkind arbeitet vertieft und aus eigenem Antrieb mit Montessori-Mathematikmaterial; eine Pädagogin bleibt beobachtend im Hintergrund. Hochformatiger, responsiv beschneidbarer Hero. |
| `home-continuum.webp`            | Ein Jugendlicher unterstützt zwei jüngere Kinder bei einem echten Holzprojekt; verschiedene Altersstufen werden als ein gemeinsamer Bildungsweg sichtbar.                                        |
| `home-freedom.webp`              | Eine Pädagogin bietet einem Kind auf Augenhöhe zwei reale Tätigkeiten zur Auswahl an und verbindet Orientierung mit Eigenständigkeit.                                                            |
| `home-community.webp`            | Eltern, Kinder und Pädagog:innen bepflanzen und reparieren gemeinsam ein Hochbeet im Schulhof.                                                                                                   |
| `home-careers.webp`              | Eine Pädagogin beobachtet ein konzentriert arbeitendes Kind, notiert etwas und gibt einen ruhigen Impuls.                                                                                        |
| `montessori-prepared.webp`       | Weiter Blick in eine vorbereitete Lernumgebung mit selbstständig arbeitenden Kindern, Bodenmatten, zugänglichen Regalen und einer leisen Einführung.                                             |
| `montessori-performance.webp`    | Eine ältere Schülerin vertieft sich selbstständig in eine anspruchsvolle Geometriearbeit mit sichtbaren Entwürfen und Korrekturen.                                                               |
| `path-panorama.webp`             | Sehr breites 2:1-Panorama eines gemeinsamen Projekttages, in dem Kindergartenkinder, Schulkinder und Jugendliche Material über den Hof tragen.                                                   |
| `path-transition.webp`           | Ein älteres Grundschulkind zeigt einem Kindergartenkind bei einem Besuch in der Primaria eine Tätigkeit; eine Pädagogin beobachtet.                                                              |
| `kindergarten-arrival.webp`      | Eine Pädagogin begrüßt ein noch zurückhaltendes Kindergartenkind an der Tür auf Augenhöhe und bietet offen ihre Hand an.                                                                         |
| `kindergarten-nature.webp`       | Kindergartenkinder tragen an einem nassen Waldtag gemeinsam einen schweren Ast; eine Pädagogin zeigt den sicheren Weg.                                                                           |
| `kindergarten-outdoor.webp`      | Weiter 4:3-Blick auf einen naturnahen, genutzten Außenbereich mit Graben, Balancieren, Bauen und beobachtender Pädagogin.                                                                        |
| `school-freiarbeit.webp`         | Jahrgangsgemischte Freiarbeit mit Einzelarbeit, Partnerarbeit und einer präzisen Einführung durch eine Pädagogin.                                                                                |
| `school-next-step.webp`          | Zwei Jugendliche besprechen mit einem Pädagogen ein Projekt, ein Modell und ihre nächsten Schritte statt eine gestellte Prüfungssituation zu zeigen.                                             |
| `school-class-council.webp`      | Kinder, Jugendliche und Pädagog:innen beraten sich in einem ruhigen Kreis; Zuhören, Mitschrift und geteilte Verantwortung sind sichtbar.                                                         |
| `ganztag-afternoon.webp`         | Kinder bauen, balancieren und lesen parallel im freien Nachmittag; eine vertraute Pädagogin bleibt ansprechbar.                                                                                  |
| `ganztag-meal.webp`              | Kinder verschiedener Altersstufen decken, servieren, gießen Wasser ein und teilen ein frisches Mittagessen mit einer Pädagogin.                                                                  |
| `community-governance.webp`      | Elternteil, Pädagogin, Leitung und Schülervertreter beraten an einem gebrauchten Holztisch; der Jugendliche spricht, die Erwachsenen hören zu.                                                   |
| `kennenlernen-family.webp`       | Zwei Eltern und eine Pädagogin führen ein ehrliches Kennenlerngespräch, während das Kind im selben Raum selbstständig Material erkundet.                                                         |
| `careers-pedagogical-space.webp` | Eine Pädagogin richtet auf Grundlage ihrer Beobachtung eine vorbereitete Materialumgebung ein; ein Kind arbeitet ungestört im Hintergrund.                                                       |
| `careers-team-reflection.webp`   | Vier Pädagoginnen unterschiedlicher Altersstufen reflektieren gemeinsam eine Beobachtung, hören zu und machen Arbeitsnotizen.                                                                    |
| `donation-impact.webp`           | Kinder und Erwachsene bauen gemeinsam ein langlebiges Materialregal auf und sortieren neue Montessori-Materialien ein; keine Geld- oder Übergabesymbolik.                                        |

## Technische Aufbereitung

- Generierung: integriertes Imagegen-Werkzeug, Anwendungsfall `photorealistic-natural`
- Masterformate: überwiegend 1536 × 1024 Pixel; Hero, Panorama und 4:3-Motive passend abweichend
- Websiteformat: WebP, Qualitätsstufe 88, ohne Metadaten
- Gesamtgröße der 22 Projektdateien: rund 4,6 MB vor der weiteren Astro-Bildoptimierung
- Responsive Kontrolle: Startseite mobil und Desktop sowie Kindergarten, Schule und Arbeiten bei uns
  auf Desktop

Die Social-Share-Grafik wurde in diesem Schritt nicht verändert. Sie sollte erst nach einer
abgestimmten Entscheidung zur öffentlichen Kennzeichnung der Zwischenbilder erneuert werden.
