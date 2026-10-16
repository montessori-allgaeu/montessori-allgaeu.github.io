# Monte-Verwaltung: Betrieb und Wiederherstellung

Diese Anleitung beschreibt den implementierten Betrieb. Sie ersetzt die frühere Pages-CMS- und GitHub-Pages-Einrichtung. Ein erfolgreicher lokaler Build belegt noch keinen produktiven DNS-Wechsel oder eine abgeschlossene externe Abschaltung.

## Architektur und Kosten

| Bestandteil                   | Aufgabe                                                                                     | Konfiguration                                                    |
| ----------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `monte-website`               | Öffentliche Astro-Seiten und Medien als reine Static Assets, ohne Worker-Script             | `wrangler.site.jsonc`, Ausgabe `dist/`                           |
| `monte-verwaltung`            | Verwaltungsoberfläche und API                                                               | `wrangler.admin.jsonc`, Ausgabe `dist-admin/`, `worker/index.ts` |
| SQLite Durable Object `ADMIN` | Private Zugänge, Passkeys, Sitzungen, Einladungen, Änderungsaufträge und Änderungsprotokoll | Klasse `MonteAdmin`                                              |
| KV `UPLOADS`                  | Temporäre Dateien vor ihrer geprüften Übernahme in Git                                      | Namespace-Bindung in der Verwaltungskonfiguration                |
| GitHub                        | Code, redaktionelle Inhalte, Medien, Historie, Prüfungen und Veröffentlichung               | `.github/workflows/publish.yml`                                  |

Website und Verwaltung werden getrennt veröffentlicht. Die Website ruft das Backend nicht auf. Bei der Verwaltung läuft Worker-Code ausschließlich für `/api/*`; andere Abrufe werden statisch bedient. Die Website bleibt deshalb bei ausgeschöpften Backend-Kontingenten erreichbar.

Nur Cloudflare Free und kostenlose Standard-Linux-Runner des öffentlichen GitHub-Repositories verwenden. Keine kostenpflichtigen Speichererweiterungen, R2-Abonnements oder automatischen Tarifwechsel einrichten. Vor der ersten Einrichtung den tatsächlichen Workers-Tarif prüfen; das Repository stellt den Kontotarif nicht um. Bestehende Domain- und Mailkosten gehören nicht zu dieser Infrastruktur.

`check-static-assets.mjs` prüft die Free-Grenzen von 20.000 Dateien und 25 MiB je Datei sowie die fehlende Worker-Ausführung vor öffentlichen Assets. Verwaltungsuploads sind auf 10 MiB je Datei und 256 MiB temporären Gesamtspeicher begrenzt. Die Hintergrundbereinigung entfernt unzugeordnete Uploads nach einem Tag, abgeschlossene nach einem Tag und fehlgeschlagene nach sieben Tagen. Länger aufgelaufene Uploads werden vor einer Wiederholung erneut benötigt. Erschöpfte Kontingente werden als Unterbrechung angezeigt; daraus darf keine automatische kostenpflichtige Erweiterung entstehen.

## Lokale Entwicklung

```sh
npm ci
./dev
```

Der Einstieg startet Astro auf dem ersten freien Port ab 8000. Sind beide Verwaltungskonfigurationen vorhanden, folgen Vite und lokales Wrangler auf den nächsten freien Ports. Die tatsächlichen URLs stehen im Terminal. `./dev --port 8050` verlangt einen festen öffentlichen Port und bricht bei Belegung ab. Ctrl+C beendet nur die von diesem Start gestarteten Prozesse.

Die Verwaltung wird lokal über `http://localhost:<Port>/` geöffnet. `ADMIN_ORIGIN` und `RP_ID=localhost` werden passend überschrieben. Vite leitet `/api` an Wrangler weiter; `--local-upstream` erhält dabei den richtigen Anfrageursprung. `--local` deaktiviert entfernte Ressourcenbindungen; der lokale Zustand liegt unter `.wrangler/state`. Test-Passkeys und produktive Passkeys sind getrennt.

Fehlt `dist-admin/index.html`, baut der Starter die Verwaltungsassets einmal. Danach liefert Vite die Oberfläche mit laufender Aktualisierung aus. Abhängigkeiten werden beim Start nicht erneut installiert. Ohne gültige GitHub-App-Konfiguration können Inhalte nicht geladen oder veröffentlicht werden; es gibt keinen lokalen Authentifizierungs-Bypass. Secrets gehören ausschließlich in die ignorierte lokale `.dev.vars` beziehungsweise in Cloudflare-Secrets, niemals ins öffentliche Repository.

## Einmalige Einrichtung von Cloudflare und GitHub

1. Cloudflare-Free-Konto und Zone für `montessori-allgaeu.de` prüfen. Die tatsächliche Account-ID in beiden Wrangler-Konfigurationen verwenden.
2. Einen KV-Namespace für Uploads anlegen und dessen echte ID als `UPLOADS` hinterlegen. Platzhalter-IDs dürfen nicht produktiv bleiben. Die deklarierte SQLite-Durable-Object-Migration `v1` wird beim ersten Deployment angelegt.
3. Eine GitHub App ausschließlich auf `montessori-allgaeu/montessori-allgaeu.github.io` installieren. Repository-Berechtigungen: **Contents: Read** und **Actions: Read and write**. Keine Webhooks erforderlich.
4. `GITHUB_APP_ID`, `GITHUB_INSTALLATION_ID`, `GITHUB_REPOSITORY` und `GITHUB_REPOSITORY_ID` mit der tatsächlichen Installation abgleichen. `GITHUB_OIDC_SUB` muss der exakten GitHub-Laufidentität für `main` entsprechen: `GET /repos/{owner}/{repo}/actions/oidc/customization/sub` liefert für dieses Repository den `sub_claim_prefix`; daran `:ref:refs/heads/main` anhängen. Das hier aktive unveränderliche Format enthält Eigentümer- und Repository-ID. Keine Kennung allein aus den Namen ableiten. Den privaten App-Schlüssel als Cloudflare-Secret `GITHUB_APP_PRIVATE_KEY` speichern; das Backend erwartet PEM im PKCS#8-Format.
5. Ein Cloudflare-API-Token auf das betroffene Konto und die nötigen Worker-Deployments beschränken. GitHub-Secret: `CLOUDFLARE_API_TOKEN`. GitHub-Variablen: `CLOUDFLARE_ACCOUNT_ID`, `ADMIN_ORIGIN=https://verwaltung.montessori-allgaeu.de`, `PUBLIC_SITE_URL=https://montessori-allgaeu.de`.
6. Beide Anwendungen zuerst ohne produktiven Traffic bauen und bereitstellen. Für einen echten Test der Verwaltung auf einer Testdomain müssen deren `ADMIN_ORIGIN` und `RP_ID` sowie ihre Zustandsbindungen getrennt eingerichtet sein. Ein Produktions-Worker akzeptiert keine Anmeldung auf einer anderen Domain.
7. Nach der unten beschriebenen DNS-Übernahme die Custom Domains an die passenden Worker binden. Für `www` eine dauerhafte Weiterleitung zur Hauptdomain einrichten, die Pfad und Query-Parameter erhält. Diese Weiterleitung gehört zur Zone und benötigt keinen vorgeschalteten Website-Worker.
8. Erst auf der endgültigen Verwaltungsdomain den ersten produktiven Passkey einrichten und die Admin-ID privat für die technische Wiederherstellung festhalten.

Die Worker-Konfiguration allein bestätigt weder Custom-Domain-Bindungen noch Nameserver, den Kontotarif oder die GitHub-Secrets. Diese externen Einstellungen müssen beim Einrichten separat verifiziert werden.

## Automatische Veröffentlichung

### Inhalte bearbeiten

Die Übersicht zeigt häufige Aktionen, **Zuletzt bearbeitet** und die vier nächsten sichtbaren Termine ab dem aktuellen Berliner Datum. Die letzten fünf unterschiedlichen Inhalte werden aus den letzten 50 gespeicherten Aufträgen des Teams ermittelt, einschließlich laufender und fehlgeschlagener Veröffentlichungen. Veröffentlichten Aufträgen bleiben dafür nur ihre Inhaltskennungen zugeordnet; historische Inhaltsfassungen und temporäre Medienvorschauen werden weiterhin nicht ausgeliefert. Ein Klick öffnet den aktuellen Inhalt oder bei Fehlern die gespeicherten Eingaben zur Korrektur.

Neue Termine bieten unter **Ähnlichen Termin übernehmen** bis zu fünf passende vorhandene Vorlagen an. Bereits eingegebener Titeltext grenzt die Auswahl ein. Die Übernahme kopiert Titel, Kategorie, Uhrzeit, Ort und Beschreibung; das gewählte neue Datum bleibt erhalten. Beim Kopieren eines bestehenden Termins wird das Datum auf heute gesetzt und muss geprüft werden. Vergangene Daten erhalten einen Hinweis. Sortierpfeile in Inhaltslisten erscheinen erst nach **Reihenfolge ändern**; eine Verschiebung speichert weiterhin unmittelbar.

**Verknüpft mit** führt zu den passenden öffentlichen Seiten. Download-Verknüpfungen hängen vom konkreten Dokument ab, Vorstandsrollen zusätzlich von der Zuordnung und Nachmittagsangebote vom aktiven Schuljahr. Bei Kennenlernterminen wird dieselbe Auswahlregel wie auf der Website verwendet. Diese Zuordnung wird in `src/admin/content-usage.ts` gepflegt und bei Änderungen an den öffentlichen Inhaltsverknüpfungen angepasst.

Die Felder eines Eintrags sind sofort bearbeitbar. **Speichern** in der festen Leiste am unteren Bildschirmrand übernimmt alle Änderungen gemeinsam. Optionale, bisher unbenutzte Angaben stehen unter **Weitere Angaben ergänzen**. Bis zum Speichern bleiben Eingaben nur im geöffneten Browser; beim Verlassen geänderter Inhalte erscheint eine Warnung.

In der Downloadliste führt **PDF ersetzen** direkt zur Dateiauswahl. Nach der Auswahl öffnet sich der betreffende Eintrag mit der neuen Vorschau. Der bisherige Dateilink bleibt erhalten. Titel und übrige Angaben können bei Bedarf gleichzeitig angepasst werden. **Dateiaustausch zurücknehmen** verwirft die neue Datei vor dem Speichern; andere Änderungen am Eintrag bleiben erhalten. Während des Uploads ist Speichern gesperrt. Ein laufender Veröffentlichungsauftrag sperrt den betroffenen Eintrag bis zum Abschluss.

### Prüfung und Auslieferung

Ein normaler Push auf `main` startet **Publish Monte**. Pull Requests erhalten ausschließlich die Qualitätsprüfung ohne Produktions-Secrets. Es gibt keine zusätzliche Cloudflare-Build-Pipeline.

Der Veröffentlichungsworkflow liest den aktuellen Stand von `main`, führt `npm run test:ci` aus, baut beide Anwendungen, prüft die Asset-Grenzen und veröffentlicht über Wrangler. Vor beiden Deployments prüft er erneut den aktuellen Git-Stand. `version.json` auf beiden Anwendungen bestätigt anschließend den tatsächlich veröffentlichten Commit. Fehlgeschlagene Prüfungen veröffentlichen nichts.

Die Oberfläche bestätigt „Gespeichert“, sobald der Auftrag dauerhaft im Durable Object liegt. Die Website wird anschließend im Hintergrund geprüft und aktualisiert (typischerweise etwa 2–3 Minuten). Gespeicherte Aufträge liefern ihre Inhaltsfassung und private Medienvorschauen an angemeldete Redakteur:innen zurück, damit Navigation und Neuladen den Stand erhalten. Nur betroffene Einträge bleiben bis zum Abschluss gesperrt; andere Einträge können weiter bearbeitet werden. Fehler bleiben unter „Änderungen“ mit Wiederholung und gespeicherten Eingaben zugänglich. „Auf der Website sichtbar“ setzt weiterhin die geprüfte Live-Version voraus.

Beim Speichern in der Verwaltung startet die GitHub App denselben Workflow mit einer unveränderlichen Änderungskennung und einem einmaligen Versuchsschlüssel. GitHub OIDC erlaubt den Zugriff auf den Auftrag nur dem erwarteten Repository, Workflow und `main`-Lauf. Der Workflow prüft die Inhalts- und Medienänderungen, schreibt sie nach erfolgreichen Prüfungen als Commit und veröffentlicht anschließend selbst weiter. Ein mit `GITHUB_TOKEN` geschriebener Commit muss dafür keinen zweiten Workflow starten.

Website und Verwaltung können bei einem Teilfehler vorübergehend unterschiedliche Releases haben. Den fehlgeschlagenen Lauf beziehungsweise den angebotenen Änderungsauftrag nach Behebung wiederholen und beide Versionsdateien kontrollieren. Bei Inhaltskonflikten die neue Ausgangsfassung in der Verwaltung laden und die Änderung bewusst erneut anwenden. Keine fremden Änderungen überschreiben und keine bereits gespeicherten Aufträge durch neue Duplikate ersetzen.

## Zugänge, Einladungen und verlorene Geräte

Admins verwalten Personen unter **Zugänge**. Einladungen gelten einmalig für 24 Stunden; ihre Links werden persönlich weitergegeben. Mehrere Passkeys pro Person sind möglich. Die Rolle Content Manager bearbeitet alle freigegebenen Inhalte außer Spendenempfänger, Bank, IBAN und BIC. Nur Admins verwalten Zugänge und Rollen.

**Passkeys ersetzen** sperrt die bisherigen Passkeys und Sitzungen und erzeugt einen neuen Einrichtungslink. Der letzte aktive Admin kann weder deaktiviert noch herabgestuft werden. Bank- und Zugangsänderungen verlangen eine aktuelle Passkey-Bestätigung. Sitzungen enden nach sieben Tagen Inaktivität oder spätestens nach 30 Tagen.

### Erster Admin oder Verlust sämtlicher Admin-Passkeys

Dieser Weg ist ausschließlich für die technische Betreuung mit authentifiziertem Cloudflare-Zugang bestimmt. Für eine Wiederherstellung wird die bestehende Admin-ID benötigt. Diese ID bei der Einrichtung aus `/api/me` beziehungsweise `/api/access` privat festhalten; sie gehört nicht in dieses öffentliche Dokument.

Die vorhandenen Backend-Hooks verwenden einen zufälligen, einmaligen Link und diese Secrets:

- `BOOTSTRAP_TOKEN_HASH`: SHA-256 des zufälligen Tokens, hexadezimal.
- `BOOTSTRAP_EXPIRES_AT`: ISO-Zeitpunkt höchstens 15 Minuten in der Zukunft; zehn Minuten lassen Zeit für die Einrichtung.
- `BOOTSTRAP_NAME`: Anzeigename für den ersten Admin.
- `RECOVERY_USER_ID`: nur bei Wiederherstellung die bestehende Admin-ID. Ohne diese ID ist Ersteinrichtung nur zulässig, solange noch kein aktiver Zugang besteht.

Eine technische Person kann die kurzfristigen Werte in einem privaten Terminal erzeugen. Das Beispiel schreibt ausschließlich in ein privates temporäres Verzeichnis; es führt keine Änderung an Cloudflare aus:

```sh
node --input-type=module <<'NODE'
import { randomBytes, createHash } from "node:crypto";
import { mkdtempSync, chmodSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const folder = mkdtempSync(join(tmpdir(), "monte-einrichtung-"));
chmodSync(folder, 0o700);
const token = randomBytes(32).toString("base64url");
const values = {
  BOOTSTRAP_TOKEN_HASH: createHash("sha256").update(token).digest("hex"),
  BOOTSTRAP_EXPIRES_AT: new Date(Date.now() + 10 * 60_000).toISOString(),
  BOOTSTRAP_NAME: "Max",
};
// Nur für Wiederherstellung ergänzen:
// values.RECOVERY_USER_ID = "bestehende-admin-id";
const file = join(folder, "secrets.json");
writeFileSync(file, JSON.stringify(values), { mode: 0o600 });
console.log("Temporäre Datei:", file);
console.log("Persönlicher Link: https://verwaltung.montessori-allgaeu.de/#invite=" + token);
NODE
```

Den ausgegebenen Dateipfad anschließend mit `npx wrangler secret bulk <Dateipfad> --config wrangler.admin.jsonc` übernehmen. Den Link nur an die betreffende Person weitergeben; sie bestätigt ihren eigenen Passkey. Bei erfolgreicher Wiederherstellung sperrt das Backend alte Passkeys und Sitzungen und verbraucht den Link. Danach alle vorhandenen temporären Secrets entfernen:

```sh
npx wrangler secret delete BOOTSTRAP_TOKEN_HASH --config wrangler.admin.jsonc
npx wrangler secret delete BOOTSTRAP_EXPIRES_AT --config wrangler.admin.jsonc
npx wrangler secret delete BOOTSTRAP_NAME --config wrangler.admin.jsonc
npx wrangler secret delete RECOVERY_USER_ID --config wrangler.admin.jsonc
```

Die letzte Zeile gilt nur, wenn das Recovery-Secret gesetzt wurde. Auch die private temporäre Datei entfernen. Tokens, Einrichtungslinks und Schlüssel niemals in Git, CI-Protokolle, Screenshots oder öffentliche Issues übernehmen. Ein abgelaufener Einrichtungsversuch erhält ein neues Token; kein permanentes Notfallpasswort einrichten.

## DNS-Wechsel mit erhaltenem Mailbetrieb

1. Die vollständige bisherige DNS-Zone exportieren und zusätzlich die aktuellen Nameserver, TTLs, DNSSEC-/DS-Einstellungen sowie GitHub-Pages-Domain- und HTTPS-Einstellungen sichern. Den automatischen Cloudflare-Scan gegen diesen Bestand prüfen; er ist kein vollständiger Export.
2. Sämtliche A-, AAAA-, CNAME-, MX-, TXT-, SRV-, CAA- und delegierten Einträge übernehmen. SPF, alle DKIM-Selektoren, DMARC, Verifikationen und gegebenenfalls Autodiscover ausdrücklich abgleichen. Mailhostnamen und ihre Zieladressen ausschließlich als DNS-Einträge ohne HTTP-Proxy führen. Domainregistrierung und Postfächer bleiben beim bisherigen Anbieter.
3. Cloudflare zunächst mit den bisherigen Website-Zielen vorbereiten. Wenn DNSSEC aktiv ist, den bisherigen DS-Eintrag passend zum Nameserverwechsel entfernen; keinen veralteten DS-Eintrag auf die neue Zone zeigen lassen.
4. Nameserver beim Registrar auf die dem Konto tatsächlich zugewiesenen Cloudflare-Nameserver umstellen. Alte Zone weiterhin betreiben. Autoritative Antworten sowie mindestens zwei unabhängige Resolver auf Vollständigkeit prüfen.
5. Mailversand und Empfang mit ausdrücklich abgestimmten Testnachrichten prüfen. SPF-, DKIM- und DMARC-Ergebnisse in den empfangenen Nachrichten kontrollieren. Die bloße Existenz des MX-Eintrags ist kein Nachweis funktionierender Zustellung.
6. Nach erfolgreichem Test die Webadressen an die geprüften Cloudflare-Deployments binden. Hauptdomain, `www`, Verwaltungsdomain, HTTPS, Downloads, alte Weiterleitungen und Passkey-Anmeldung kontrollieren.
7. Nach erfolgreichem Wechsel DNSSEC bei Cloudflare aktivieren und den neuen DS-Eintrag beim Registrar korrekt hinterlegen. Erneut auf gültige Auflösung ohne `SERVFAIL` prüfen.

### Rückfall

Bei Webhosting-Problemen zuerst den letzten bekannten funktionierenden Cloudflare-Stand wiederherstellen. Solange GitHub Pages als Rückfall bereitsteht, alternativ die neuen Web-Domainbindungen entfernen und die gesicherten bisherigen GitHub-Ziele samt Proxy-Einstellung wiederherstellen. GitHub-Pages-Domain und Zertifikat müssen dafür weiterhin gültig sein. Mail-DNS bleibt unverändert.

Bei einem grundlegenden Fehler der DNS-Übernahme die gesicherten bisherigen Nameserver und die dazu passende DNSSEC-/DS-Konfiguration wiederherstellen. Auch ein Rückfall unterliegt DNS-TTLs; er ist keine sofortige weltweite Umschaltung. Die ursprüngliche Zone deshalb nicht vor Ablauf des Übergangs löschen.

## Produktivabnahme und ausstehende Abschaltung

Der Abschluss benötigt den Nachweis funktionierender öffentlicher Seiten, Admin-Anmeldung, Inhaltsveröffentlichung, Rollenprüfung, Uploads, Mailzustellung und Rückfallmöglichkeit. Zusätzlich müssen vollständige CI, Desktop-/Mobilprüfung und unabhängiger Sicherheitsreview abgeschlossen sein.

**Die externe Abschaltung von GitHub Pages und der Entzug des Pages-CMS-App-Zugriffs sind bis zur dokumentierten Produktivabnahme, mindestens 48 Stunden stabilem Betrieb und Ablauf der bisherigen relevanten DNS-TTLs offen.** Die Entfernung von `.pages.yml` oder des alten Deployment-Workflows erledigt diese externen Schritte nicht.

Nach erfüllten Voraussetzungen:

1. GitHub Pages in den Repository-Einstellungen abschalten und alte Domainbindungen entfernen.
2. Der Pages-CMS-App den Zugriff ausschließlich auf dieses Repository entziehen.
3. Veraltete Hosting-Secrets und ausschließlich dafür benötigte Berechtigungen entfernen.
4. Domains, Mail und beide Cloudflare-Versionen erneut prüfen; Abschlussdatum und Ergebnisse im privaten Betriebsnachweis festhalten.

## Fehlerdiagnose

| Beobachtung                                 | Prüfen und handeln                                                                                                  |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Website erreichbar, Verwaltung unterbrochen | Workers-/DO-/KV-Free-Limits und Verwaltungsdeployment prüfen; keinen kostenpflichtigen Tarif aktivieren             |
| Anmeldung funktioniert, Inhalte fehlen      | App-ID, Installation, Repository-ID, PKCS#8-Schlüssel und GitHub-App-Berechtigungen prüfen                          |
| Passkey wird nicht angeboten                | Richtige Domain, Gerätespeicher und vorhandenen Passkey prüfen; bei Verlust neuer Einrichtungslink durch Admin      |
| Auftrag bleibt in Prüfung                   | Zugehörigen GitHub-Actions-Lauf prüfen; Status nicht mit einer bestätigten Veröffentlichung verwechseln             |
| Nur ein Deployment erfolgreich              | Fehlgeschlagenes Ziel korrigieren, geprüften Lauf wiederholen und beide `version.json` prüfen                       |
| PDF nach Wiederholung nicht verfügbar       | Uploadstatus prüfen; nach Ablauf der temporären Aufbewahrung erneut hochladen                                       |
| Mailprobleme nach DNS-Wechsel               | Gesicherte MX-/Mailhost-/SPF-/DKIM-/DMARC-Einträge und Proxy-Einstellungen vergleichen; gegebenenfalls DNS-Rückfall |
