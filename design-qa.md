# Design QA

## Referenz und Implementierung

- Referenz und finale Implementierung: `artifacts/design-qa/home-reference-comparison.jpg`
  (Referenz links, Implementierung rechts)
- Implementierung: `http://127.0.0.1:4321/`
- Desktop-Viewport: 1440 × 900 Pixel, Startseite, Standardzustand
- Mobile-Viewport: 390 × 844 Pixel, Startseite und geöffnetes Navigationsmenü
- Gemeinsamer Vergleich: `artifacts/design-qa/home-reference-comparison.jpg`
- Vollständige Startseite: `artifacts/design-qa/home-desktop-full.jpg`
- Fokussierte Regionen: `artifacts/design-qa/home-desktop-top.jpg`, `artifacts/design-qa/home-mobile-top.jpg`, `artifacts/design-qa/principles-mobile.jpg`

Die vollständige Desktopansicht wurde aus lückenlos überlappenden Viewport-Aufnahmen zusammengesetzt. Bei allen Folgeaufnahmen wurde der 88 Pixel hohe Sticky-Header ausgespart, damit er im Gesamtbild nur einmal erscheint.

## Vergleichsverlauf

1. Erster Vergleich: Struktur, Farbwelt und Typografie stimmten, die Seite war gegenüber der Referenz aber deutlich zu lang. Der Hero brach auf fünf statt drei Zeilen um und mehrere Bild-Text-Flächen waren zu hoch.
2. Korrektur: Hero-Spalten und Schriftgröße wurden auf den Referenz-Zeilenfall gebracht. Lern-, Fit- und Bild-Text-Abschnitte wurden verdichtet; der Footer wurde kompakter.
3. Zweiter Vergleich: Die verbleibende Längendifferenz wurde durch kompaktere Startseitenvarianten der Split-Komponente reduziert. Der mobile 6-Pixel-Überlauf auf der Prinzipienseite wurde beseitigt.
4. Finale Prüfung: Desktop und Mobil ohne defekte Bilder, ohne Konsolenfehler und ohne horizontale Überläufe. Navigation und FAQ-Zustände funktionieren.
5. Nachprüfung: Lange Stellenbezeichnungen brechen auch auf 320 Pixel breiten Viewports um; das
   mobile Menü bleibt auf kurzen Hoch- und Querformaten vollständig scrollbar.

## Befunde

- P0: keine
- P1: keine
- P2: keine
- P3: Die übernommenen Originalfotos unterscheiden sich in Auflösung und Lichtstimmung. Das ist bewusst akzeptiert, weil echte Bilder der Monte gegenüber generierten Platzhaltern Vorrang haben; ein späteres Fotoshooting kann sie schrittweise ersetzen.

## Ergebnis

final result: passed
