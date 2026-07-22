# Corporate Design für die Website

Stand: 21. Juli 2026  
Status: bestätigte Web-Gestaltung mit dem Corporate-Design-Manual als Markenreferenz

## Quelle und Geltungsbereich

Das freigegebene **CD-Manual Montessori Allgäu 2021** von Baroke Design bestimmt Logo,
Typografie und Illustrationsstil. Für die Website wurde die bereits auf
`https://stage.montessori-allgaeu.de/` eingesetzte ruhige Farbwelt ausdrücklich bestätigt. Die
vollständige Manualpalette wird deshalb nicht mechanisch auf die Oberfläche übertragen. Die
strategische Designrichtung bleibt in
[`positionierung-und-website-strategie.md`](positionierung-und-website-strategie.md) geregelt.

Bei Abweichungen gilt:

1. Das CD-Manual bestimmt Markenlogo, Schriften und Illustrationsstil.
2. Die Website-Strategie bestimmt Wirkung, Prioritäten, Bildsprache und Nutzerführung.
3. Die bestätigte Stage-Farbwelt sowie Barrierefreiheit und Lesbarkeit bestimmen die
   Web-Farbanwendung.

## Logo

- Verbindlich ist die horizontale Wort-Bild-Marke „Montessori Allgäu – Schule & Kindergarten“.
- Im Header steht sie auf Weiß beziehungsweise sehr hellem Warmweiß.
- Auf dunklen Flächen bleibt die unveränderte Marke ohne Umfärbung erhalten. Es wird keine nicht
  freigegebene Negativ- oder Einfarbversion erzeugt.
- Die Bildmarke darf allein nur für quadratische Systemformate wie Favicon oder App-Icon verwendet
  werden.
- Das Logo wird weder nachgebaut noch umgefärbt, verzerrt, beschnitten oder mit Effekten versehen.

Verbindliche Quelldatei:
`src/assets/brand/official/logo-montessori-allgaeu-ab-2022.png`

## Typografie

| Rolle                | Schrift           | Web-Anwendung                                                        |
| -------------------- | ----------------- | -------------------------------------------------------------------- |
| Headline und Display | Unica One, 400    | H1 bis H4, Zitate, große Zahlen und ausgewählte Navigations-Displays |
| Grundtext und UI     | Krub, 400 bis 700 | Fließtext, Navigation, Buttons, Labels und Tabellen                  |

Beide Schriften werden lokal ausgeliefert. Unica One bleibt auf charakterstarke Aussagen
beschränkt; längere Texte und kleine Bedienelemente verwenden Krub.

## Bestätigte Webpalette

| Token               | Rolle                              | Hex       |
| ------------------- | ---------------------------------- | --------- |
| `--paper`           | ruhige Grundfläche                 | `#f5f1ec` |
| `--paper-light`     | helle Wechsel- und Inhaltsfläche   | `#fbfaf7` |
| `--forest`          | Headlines und dunkle Markenflächen | `#1d2b1e` |
| `--forest-soft`     | Fließtext                          | `#3a4638` |
| `--forest-muted`    | nachrangige Information            | `#687064` |
| `--terracotta`      | Buttons und aktive Akzente         | `#b85b2d` |
| `--terracotta-dark` | Links und Hover                    | `#98431c` |
| `--ochre`           | kleine Akzente auf dunklem Grund   | `#d7a24b` |
| `--line`            | ruhige Trennlinien                 | `#d8d0c6` |
| `--line-strong`     | stärkere Trennlinien               | `#bcb3a8` |
| `--white`           | Text auf dunklen Flächen           | `#fffdfa` |

Die größere Palette des Manuals bleibt als Markenreferenz dokumentiert, ist aber kein Auftrag,
alle Farben in der Benutzeroberfläche zu zeigen. Insbesondere werden keine pastelligen Gelb-,
Pink-, Grün- oder Blautönungen als Abschnittshintergründe und keine mehrfarbigen Akzentlinien
eingesetzt. Die Website arbeitet mit wenigen, klaren Rollen: Waldgrün für Haltung und Tiefe,
Terrakotta für Interaktion, Ocker für sparsame Wärme und zwei ruhige Papierflächen.

Inline-Links werden nicht ausschließlich über Farbe erkennbar gemacht. Kleine Texte und
Bedienelemente müssen die geltenden Kontrastanforderungen erfüllen.

## Footer

Der Footer bildet eine zusammenhängende dunkelgrüne Fläche. Das unveränderte Vollfarblogo,
Navigation, Kontakt, Verbandszugehörigkeit und Rechtliches stehen gemeinsam auf dieser Fläche;
Ocker wird nur für kleine Orientierungssymbole eingesetzt. Es gibt keinen zusätzlichen rosa oder
braunen Abschlussstreifen.

## Bilder und Grafik-Elemente

- Authentische Bilder aus dem Alltag der Monte bleiben das primäre Bildmedium der Website.
- CD-Illustrationen bestehen aus freigegebenen, stilisierten Strichzeichnungen, optional über echten
  Aquarellflächen. Sie wirken leicht und offen, aber nicht kindlich.
- Die Illustrationen werden nicht durch CSS-Formen, generische Icons, nachgezeichnete SVGs oder
  ähnliche Ersatzgrafiken imitiert.
- Solange keine sauberen Original-Assets vorliegen, arbeitet die Website bewusst mit Fotografie,
  Typografie, Weißraum und den Markenfarben.
- KI- oder Stockbilder bleiben nachrangig gegenüber authentischen Monte-Fotos.

## Bewegung und Übergänge

- Bewegung erklärt Zustands- und Seitenwechsel und tritt danach sofort zurück. Sie ist kein
  dekoratives Mittel, um statische Inhalte lebendiger erscheinen zu lassen.
- Interne Seitenwechsel dürfen als kurzer Fade-in des neuen Hauptinhalts mit maximal 160
  Millisekunden erscheinen. Der Header bleibt davon ausgenommen und die Navigation sofort
  verfügbar.
- Menüs und vergleichbare Oberflächen dürfen Opacity mit höchstens sechs Pixeln Translation
  kombinieren. Kleine Icons wechseln ausschließlich über kurze Übergänge ohne Layout-Sprung.
- Bei der Systemeinstellung „Bewegung reduzieren“ entfallen alle nicht notwendigen Übergänge.
- Scroll-Reveals, Karten-Staggering, Parallax, Bildzooms, Scroll-Hijacking und automatisch laufende
  dekorative Animationen werden nicht eingesetzt.

## Weiterentwicklung

Neue Farbmuster werden zuerst auf der Startseite auf Desktop und Mobil geprüft. Die bestätigte
Stage-Farbwelt bleibt dabei der Ausgangspunkt; eine automatische Vervielfältigung zusätzlicher
Manualfarben oder dekorativer Muster ist nicht vorgesehen.
