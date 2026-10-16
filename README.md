# Montessori Allgäu – Website

Statische Astro-Website für Montessori-Kindergarten und Schule Allgäu mit eigener Monte-Verwaltung. Website und Verwaltung verwenden getrennte Cloudflare Workers mit Static Assets; GitHub verwaltet Code, Inhalte, Historie und automatische Veröffentlichung.

## Strategische Grundlage

Die bestätigte Positionierung, Zielgruppenlogik, Content-Architektur und Designrichtung stehen in [`docs/positionierung-und-website-strategie.md`](docs/positionierung-und-website-strategie.md). Die verbindliche Web-Übersetzung des Corporate-Design-Manuals steht in [`docs/corporate-design-web.md`](docs/corporate-design-web.md). Hinweise für zukünftige Agenten und Mitwirkende stehen in [`AGENTS.md`](AGENTS.md).

## Lokal starten

```sh
npm ci
./dev
```

Auf diesem Mac funktioniert auch `dev` aus jedem Unterordner des Repos. Der Starter öffnet Astro auf dem ersten freien Port ab 8000 und anschließend die Verwaltung mit Vite und lokalem Wrangler auf den nächsten freien Ports. Alle tatsächlichen URLs werden im Terminal ausgegeben. Die Verwaltung lokal über die ausgegebene `localhost`-Adresse öffnen; Passkey-Domain und API sind darauf abgestimmt.

Mit Ctrl+C werden nur die gestarteten Prozesse beendet. `npm run dev` bleibt verfügbar. `./dev --port 8050` verlangt einen festen öffentlichen Port; bei Belegung bricht der Start ab. Fehlende Verwaltungsassets werden einmal gebaut, Abhängigkeiten nicht erneut installiert. Die lokalen Backenddaten liegen unter `.wrangler/state`; ohne eingerichtete GitHub-App können keine Repository-Inhalte geladen oder veröffentlicht werden.

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
npm run screenshot:mobile -- --full-page http://127.0.0.1:8000/ /tmp/montessori-mobile.png
```

Nicht den eigenständigen Playwright-CLI-Schalter `--device "iPhone 13"` verwenden. Dieser wählt
unabhängig von `--browser chromium` WebKit und kann in einer eingeschränkten macOS-Umgebung schon
beim Start der Browser-App abbrechen. Die E2E-Projekte in `playwright.config.ts` laufen weiterhin
auf Chromium.

## Inhalte pflegen

- Redaktionsoberfläche: [Monte-Verwaltung](https://verwaltung.montessori-allgaeu.de)
- Kurzanleitung für das Team: [`docs/redaktions-kurzanleitung.md`](docs/redaktions-kurzanleitung.md)
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
- SEO-Helfer und Seitenregister: `src/data/seo.ts`
- Seitenspezifische SEO-Vorgaben und Leitbilder: `src/data/seo-pages/*.ts`
- Globale SEO-Fallbacks: `src/layouts/BaseLayout.astro`
- Alle indexierbaren Seiten haben eine eigene, versionierte Social Card. Nicht indexierte Seiten und alte Weiterleitungen verwenden die aktuelle Startseitenkarte als Fallback.
- Bild, Ausschnitt, Kartentext, Renderer, Logo, eingebettete Schriften und Rendering-Abhängigkeiten fließen automatisch in den Social-Card-Fingerprint ein.

Die Monte-Verwaltung ersetzt Pages CMS. Es gibt keine Entwürfe: **Speichern** bestätigt die dauerhaft angenommene Änderung sofort; Prüfung, Übernahme in Git und Veröffentlichung laufen im Hintergrund. Andere Einträge können währenddessen bearbeitet werden. Der gespeicherte Stand bleibt beim Neuladen sichtbar; „Auf der Website sichtbar“ erscheint erst nach bestätigter Veröffentlichung. Einträge können angelegt, bearbeitet oder gelöscht werden. **Löschen** wird nach Bestätigung direkt gespeichert und über denselben geprüften Weg veröffentlicht; fest verknüpfte Pflichtunterlagen und Einstellungen bleiben erhalten. Kontaktdaten, Menschen und Dokumente werden zentral an allen passenden Stellen verwendet.

Inhalte lassen sich direkt in den geöffneten Feldern ändern; die Speicherleiste bleibt am unteren Bildschirmrand erreichbar. Unter **Downloads** öffnet **PDF ersetzen** direkt die Dateiauswahl. Danach kann die neue PDF geprüft und zusammen mit Titel oder weiteren Angaben gespeichert werden. Beim Austausch bleibt der bestehende Dateilink erhalten.

Die Übersicht führt direkt zu häufigen Aktionen, den zuletzt gespeicherten Inhalten des Teams und den nächsten Terminen. Neue Termine können Angaben aus vorhandenen Terminen übernehmen; das neue Datum bleibt erhalten. Verknüpfte Website-Seiten sind im Editor direkt erreichbar. Sortierpfeile werden bei Bedarf über **Reihenfolge ändern** eingeblendet.

Stellen und Spendentexte werden im Seitenlayout bearbeitet. Bei Spenden lässt sich zwischen
Spendenseite und Startseitenhinweis wechseln; Suchmaschinenangaben liegen unter Einstellungen.
Kosten sowie Öffnungs- und Schließzeiten verwenden kompakte Tabellen. Das Nachmittagsprogramm
zeigt Angebote nach Wochentag mit Klassenstufen; allgemeine Kurswahl- und Essensangaben bleiben
separat erreichbar. Termine, Personen, Downloads und Aufnahmefristen zeigen während der Eingabe
eine Vorschau. Die PDF-Vorschau rendert die erste Seite lokal im Browser mit einem erst bei Bedarf
geladenen PDF.js-Modul; ein Link zum vollständigen Dokument bleibt bei Vorschaufehlern erreichbar.
Vorschauen speichern oder veröffentlichen keine Eingaben. Datenformate und Rollenrechte bleiben
für alle Ansichten gemeinsam im bisherigen Inhaltsmodell und Backend geregelt.

Die Liste **Menschen** lädt statische WebP-Vorschaubilder mit 96 × 114 Pixeln. `build:admin`
erzeugt sie aus den Team- und Elternbeiratsfotos; Vite stellt sie auch lokal bereit. Die
Dateinamen enthalten einen Hash des Bildinhalts und dürfen ein Jahr unverändert im Browsercache
bleiben. Eine ungecachte Zuordnung der Git-Bildversionen wird nach Veröffentlichungen neu geladen,
damit ersetzte Fotos auch in bereits geöffneten Verwaltungen erscheinen. Die größere Fotoansicht
im Editor und private Vorschauen laufender Uploads verwenden weiterhin die Verwaltungs-API.

Anmeldung ausschließlich per Passkey, ohne Eingabe einer E-Mail-Adresse, eines Nutzernamens oder Passworts. Admins verwalten Einladungen, Rollen und Bankdaten; Content Manager bearbeiten die übrigen Inhalte einschließlich Gebühren. Neue Einrichtungslinks für Einladungen und das Ersetzen von Passkeys sind einmalig innerhalb von 14 Tagen nutzbar. Private Zugangs- und Sitzungsdaten liegen ausschließlich im Verwaltungsbackend. Die öffentliche Website verwendet kein Webtracking. Der besondere Vorstandskontakt über Formspark bleibt erhalten.

Bei deaktivierten Zugängen erzeugt **Einrichtungslink erneuern** einen neuen Link für dieselbe Person, auch wenn noch kein Passkey eingerichtet wurde. Bisherige Links und Passkeys werden ungültig; Name und Rolle bleiben erhalten. Der Zugang wird erst nach erfolgreicher Passkey-Einrichtung aktiv.

Unter **Zugänge → Zugang löschen** können Admins unbenutzte und bereits verwendete Zugänge samt Passkeys, Sitzungen und Einladungslinks endgültig entfernen. Der letzte aktive Admin bleibt geschützt; bisherige Inhalte und Änderungsprotokolle bleiben erhalten.

Die Inhaltsanleitung steht in [`docs/inhalte-pflegen.md`](docs/inhalte-pflegen.md). Einrichtung, technische Wiederherstellung, DNS-Umstieg und Rückfall sind in [`docs/verwaltung-betrieb.md`](docs/verwaltung-betrieb.md) beschrieben.

## Vorstandskontakt über Formspark

Das Formular „Vorstand – Anliegen ohne Namensangabe“ gehört zum organisatorischen Formspark-Konto
und sendet Benachrichtigungen an `vorstand@montessori-allgaeu.de`. Der öffentliche Endpunkt
`https://submit-form.com/hjK9U4m90` ist in
`src/components/AnonymousBoardContact.astro` hinterlegt; er ist eine technische Kennung und kein
Geheimnis. E-Mail-Threading ist in Formspark deaktiviert. Die Website setzt zusätzlich einen
Zeitstempel im Betreff, den Absendernamen „Monte Website“ und die angepasste Vorlage „Monte
Vorstandskontakt“.

Formspark prüft Einreichungen automatisch auf Spam. Das Formular enthält zusätzlich den Honeypot
`_honeypot`; Turnstile oder ein weiterer Dienst wird erst bei tatsächlich auftretendem Spam ergänzt.
Automatisierte Tests müssen Requests an `https://submit-form.com/**` immer abfangen und dürfen keine
echten Einreichungen erzeugen.

Betriebsroutine:

1. Monatlich im Formspark-Konto neue und alte Einreichungen prüfen.
2. Einträge spätestens nach 90 Tagen löschen, sofern kein laufender Vorgang oder eine gesetzliche
   Pflicht entgegensteht.
3. Regelmäßig prüfen, ob `vorstand@montessori-allgaeu.de` weiterhin als Empfänger eingetragen ist
   und Benachrichtigungen ankommen.
4. Nach Änderungen am Formular einen eindeutig gekennzeichneten Live-Test senden, den Eingang im
   Vorstandspostfach prüfen und Testeintrag sowie Test-E-Mail anschließend löschen.

Wenn ein neues Formspark-Formular angelegt wird, müssen Action-URL, Empfänger, deaktiviertes
E-Mail-Threading, Honeypot, E-Mail-Vorlage, Datenschutztext und Live-Test gemeinsam geprüft werden.

## Schutz veröffentlichter E-Mail-Adressen

Direkte Website-Kontakte verwenden `EmailContact`. Die Komponente erhält ein vollständiges
`mailto:`-Ziel und optional eine Aktionsbeschriftung, eine Beschriftung für die Freigabe sowie
bestehende CSS-Klassen. Das Ziel einschließlich Betreff wird beim Build als UTF-8/Base64 kodiert.
Erst nach einer Klick- oder Tastaturaktion wird ausschließlich dieser Kontakt angezeigt; ein
weiterer Klick auf den normalen Mail-Link öffnet das eigene Mailprogramm. Es gibt weder einen
zusätzlichen Dienst noch ein Nachrichtenkontingent. Ohne verfügbares Skript bleibt ein Link zum
Kontaktabschnitt des Impressums sichtbar.

Kodierung ist keine Verschlüsselung und kein Schutz gegen gezielte Decoder oder interaktive Bots.
Die zentrale Adresse im Inhalt von Impressum und Datenschutz bleibt ohne JavaScript zugänglich
(`data-public-email`). PDFs, das öffentliche Repository und bereits verbreitete Adressen bleiben
weitere Fundstellen. Bereits eingehender Spam wird dadurch nicht gestoppt. Das anonyme
Vorstandsformular und seine Spamprüfung sind davon unabhängig und bleiben unverändert.

`npm run check:email-exposure` prüft den aktuellen Build in `dist` auf Klartextadressen und fertige
Mail-Links in Textassets, einschließlich JSON-LD, Skripten und Source Maps. `test:ci` führt die
Prüfung nach dem Build aus; damit gilt sie auch für die Deployment-Pipeline. Nur die markierten
Kontaktlinks mit der jeweils zentral gepflegten Adresse aus `src/content/settings/contact.yml` auf den zwei Rechtstextseiten sind ausgenommen;
PDFs werden nicht geprüft. Die enge Ausnahme folgt automatisch der zentralen Kontaktadresse. Die Prüfung ist eine Absicherung gegen
versehentliche Klartextausgabe, kein Beweis gegen alle Formen der Adressrekonstruktion.

## Automatische Veröffentlichung auf Cloudflare

Ein Push auf `main` startet `.github/workflows/publish.yml`: vollständige Prüfungen, Builds, Prüfung der kostenlosen Asset-Grenzen und Veröffentlichung beider Anwendungen. Bei fehlgeschlagenen Prüfungen bleibt die bisherige Website online. Für redaktionelle Änderungen startet die Verwaltung denselben Ablauf über eine auf dieses Repository beschränkte GitHub App. Es sind keine manuellen Uploads oder weiteren Cloudflare-Aktionen im Alltag nötig.

Die Verwaltungs-API prüft dabei die exakte GitHub-OIDC-Laufidentität aus `GITHUB_OIDC_SUB` zusätzlich zu Repository-ID, Workflow und Branch. Beim Einrichten die tatsächliche Kennung einschließlich Eigentümer- und Repository-ID aus GitHub übernehmen; siehe [Betriebsanleitung](docs/verwaltung-betrieb.md).

- Öffentliche Website: `wrangler.site.jsonc`, Ausgabe `dist/`; statische Auslieferung ohne Worker-Script.
- Verwaltung: `wrangler.admin.jsonc`, Ausgabe `dist-admin/`; Worker nur für `/api/*`.
- Gemeinsame Inhaltsmodelle: `src/admin/content-model.ts` und `src/admin/content-schemas.ts`.
- Private Backenddaten: SQLite Durable Objects; temporäre Uploads: Workers KV.
- Deployment-Secrets und Domainkonfiguration: siehe [Betriebsanleitung](docs/verwaltung-betrieb.md).

Ausschließlich kostenlose Cloudflare-Tarife und kostenlose GitHub-Standard-Runner verwenden. Backend-Limits unterbrechen Änderungen, nicht die öffentliche statische Website. Keine kostenpflichtigen Erweiterungen oder automatischen Upgrades aktivieren.

## DNS-Umstieg und Abschaltung des bisherigen Hostings

Die vollständige vorhandene DNS-Zone wurde zu Cloudflare übernommen, einschließlich sämtlicher Mail- und Verifikationseinträge. Domainregistrierung und Mailpostfächer bleiben bei Host Europe. Die Hauptdomain lautet weiterhin `https://montessori-allgaeu.de`; `www` leitet dauerhaft dorthin weiter. Passkeys sind an `verwaltung.montessori-allgaeu.de` gebunden. DNSSEC ist für `.de` seit dem 16. Oktober 2026 vollständig eingerichtet und über drei öffentliche Resolver validiert.

Für `montessori-allgaeu.com` und `www.montessori-allgaeu.com` ist eine eigene Cloudflare-Single-Redirect-Regel auf die HTTPS-Hauptdomain konfiguriert, die Pfade und URL-Parameter erhält. Dafür sind kein zusätzlicher Worker und kein kostenpflichtiger Tarif nötig. DNSSEC bleibt für `.com` ausgeschaltet. Konfiguration, Abnahme und Rückfall stehen in der [Betriebsanleitung](docs/verwaltung-betrieb.md#weiterleitungsdomain-com); der tatsächliche Umstellungsstatus wird im privaten Betriebsnachweis dokumentiert.

**GitHub Pages und Pages CMS sind seit dem 16. Oktober 2026 abgeschaltet.** Die Pages-Veröffentlichung und alte Domain-Zuordnung wurden entfernt; die ausschließlich für dieses Repository installierte Pages-CMS-App wurde deinstalliert. Max hat den produktiven Betrieb akzeptiert und auf eine zusätzliche Wartefrist sowie einen gesonderten Content-Manager-Praxistest verzichtet. GitHub bleibt für Code, Inhalte und die geprüfte Cloudflare-Veröffentlichung erforderlich. Ein Rückfall erfolgt über einen funktionierenden Cloudflare-Stand. Abnahme und Nachweise sind in der [Betriebsanleitung](docs/verwaltung-betrieb.md#produktivabnahme-und-abgeschaltete-altsysteme) beschrieben.

## Weiterleitungen alter Adressen

Die bestehenden Weiterleitungen bleiben mit dem Hostingwechsel erhalten. Astro erzeugt für jeden Eintrag in
`src/data/legacy.ts` eine statische Weiterleitungsseite. Sie verwendet einen sofortigen Meta-Refresh,
verweist per Canonical auf die Zielseite und leitet im Browser zusätzlich mit `location.replace`
weiter. [Google interpretiert einen sofortigen Meta-Refresh als permanente
Weiterleitung](https://developers.google.com/search/docs/crawling-indexing/301-redirects).

Auch die alte Startseitenadresse `/index.php` führt auf diesem Weg zur heutigen Startseite `/`.
Astro erzeugt dafür `dist/index.php/index.html`; PHP muss dafür nicht ausgeführt werden.

Falls einzelne Zuordnungen später als statische Cloudflare-Redirects hinterlegt werden, müssen sie dieselben Ziele verwenden und ohne vorgeschaltete Worker-Ausführung auskommen. Die bestehenden Weiterleitungen nach dem Domainwechsel stichprobenartig prüfen und dauerhaft beibehalten. `/redaktion/` führt direkt zur neuen Monte-Verwaltung.

## Vor dem öffentlichen Launch bestätigen

- Alle Beiträge, Einlagen, Elternarbeitsstunden und Öffnungszeiten
- Kindergartenstaffel: insbesondere die korrigierte Stufe 5 bis unter 6 Stunden
- Aktive Stellenangebote und Bewerbungsadresse
- Aufnahmefristen und öffentliche Termine
- Team- und Elternbeiratsnamen, Rollen und Einwilligungen für Fotos
- Vorstand, Aufsichtsbehörden, Impressum und Datenschutzerklärung einschließlich des
  Formspark-Abschnitts rechtlich prüfen
- Spendenkonto und Prozess für Zuwendungsbestätigungen
- Weiterleitungen der alten Jimdo-Adressen nach dem Domain-Cutover stichprobenartig prüfen
