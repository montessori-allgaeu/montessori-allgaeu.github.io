import type { ContentDefinition } from "./content-model";

export const contentFieldDefinitions = [
  {
    collection: "events",
    label: "Termine",
    area: "Termine",
    directory: "src/content/events",
    fields: [
      {
        key: "title",
        label: "Titel",
        type: "text",
      },
      {
        key: "category",
        label: "Kategorie",
        type: "select",
        options: [
          {
            value: "Kennenlernen",
            label: "Kennenlernen",
          },
          {
            value: "Informationsabend",
            label: "Informationsabend",
          },
          {
            value: "Monte-Gemeinschaft & Freunde",
            label: "Monte-Gemeinschaft & Freunde",
          },
          {
            value: "Ferien & Schließtage",
            label: "Ferien & Schließtage",
          },
          {
            value: "Sonstiges",
            label: "Sonstiges",
          },
        ],
      },
      {
        key: "date",
        label: "Datum",
        type: "date",
        defaultValue: "",
      },
      {
        key: "time",
        label: "Uhrzeit",
        type: "text",
        description:
          "Freier Text, zum Beispiel „19:00 Uhr“ oder „Uhrzeit über die interne Einladung“.",
      },
      {
        key: "location",
        label: "Ort",
        type: "text",
      },
      {
        key: "description",
        label: "Beschreibung",
        type: "textarea",
      },
    ],
  },
  {
    collection: "jobs",
    label: "Stellenangebote",
    area: "Stellen",
    directory: "src/content/jobs",
    fields: [
      {
        key: "title",
        label: "Stellenbezeichnung",
        type: "text",
      },
      {
        key: "area",
        label: "Bereich",
        type: "select",
        options: [
          {
            value: "Kindergarten",
            label: "Kindergarten",
          },
          {
            value: "Schule",
            label: "Schule",
          },
          {
            value: "Kindergarten oder Schule",
            label: "Kindergarten oder Schule",
          },
        ],
      },
      {
        key: "team",
        label: "Team, Lerngruppe oder Klassenstufen",
        type: "text",
        description: "Optional, zum Beispiel „Klasse 5–7“.",
        optional: true,
      },
      {
        key: "scope",
        label: "Beschäftigungsumfang",
        type: "text",
        description:
          "Zum Beispiel „Vollzeit oder Teilzeit“, „Teilzeit“ oder „Umfang nach Vereinbarung“.",
      },
      {
        key: "employmentType",
        label: "Beschäftigungsarten für Google",
        type: "multiselect",
        description: "Alle passenden Beschäftigungsarten auswählen.",
        options: [
          {
            value: "FULL_TIME",
            label: "Vollzeit",
          },
          {
            value: "PART_TIME",
            label: "Teilzeit",
          },
          {
            value: "CONTRACTOR",
            label: "Freie Mitarbeit",
          },
          {
            value: "TEMPORARY",
            label: "Befristete Beschäftigung",
          },
          {
            value: "INTERN",
            label: "Praktikum",
          },
          {
            value: "VOLUNTEER",
            label: "Freiwilligendienst oder Ehrenamt",
          },
          {
            value: "PER_DIEM",
            label: "Tagesweise Beschäftigung",
          },
          {
            value: "OTHER",
            label: "Sonstiges",
          },
        ],
        min: 1,
      },
      {
        key: "start",
        label: "Start",
        type: "text",
        description: "Optional, zum Beispiel „September 2026“ oder „Nach Vereinbarung“.",
        optional: true,
      },
      {
        key: "datePosted",
        label: "Ursprünglich veröffentlicht am",
        type: "date",
        description: "Wird beim Anlegen vorausgefüllt; später nicht ändern.",
      },
      {
        key: "validThrough",
        label: "Bewerbung möglich bis",
        type: "date",
        description: "Optional. Nur eintragen, wenn es ein verbindliches Bewerbungsende gibt.",
        optional: true,
      },
      {
        key: "intro",
        label: "Einleitung",
        type: "textarea",
      },
      {
        key: "about",
        label: "Über uns",
        type: "list",
        item: {
          key: "item",
          label: "Eintrag",
          type: "textarea",
        },
        min: 1,
      },
      {
        key: "responsibilities",
        label: "Aufgaben",
        type: "list",
        item: {
          key: "item",
          label: "Eintrag",
          type: "text",
          description: "Listenpunkte ohne abschließenden Punkt schreiben.",
        },
        description: "Listenpunkte ohne abschließenden Punkt schreiben.",
        min: 1,
      },
      {
        key: "profile",
        label: "Profil",
        type: "list",
        item: {
          key: "item",
          label: "Eintrag",
          type: "text",
          description: "Listenpunkte ohne abschließenden Punkt schreiben.",
        },
        description: "Listenpunkte ohne abschließenden Punkt schreiben.",
        min: 1,
      },
      {
        key: "benefits",
        label: "Das erwartet dich bei uns",
        type: "list",
        item: {
          key: "item",
          label: "Eintrag",
          type: "text",
          description: "Listenpunkte ohne abschließenden Punkt schreiben.",
        },
        description: "Listenpunkte ohne abschließenden Punkt schreiben.",
        min: 1,
      },
      {
        key: "closingTitle",
        label: "Überschrift Bewerbung",
        type: "text",
      },
      {
        key: "closingText",
        label: "Einladung zur Bewerbung",
        type: "textarea",
      },
      {
        key: "position",
        label: "Position in der Stellenliste",
        type: "number",
        description:
          "10 steht weiter oben als 20. Bei gleicher Position wird alphabetisch sortiert.",
        defaultValue: 50,
        min: 1,
      },
    ],
  },
  {
    collection: "afternoonOffers",
    label: "Nachmittagsangebote",
    area: "Ganztag & Essen",
    directory: "src/content/afternoon-offers",
    fields: [
      {
        key: "title",
        label: "Titel",
        type: "text",
      },
      {
        key: "schoolYear",
        label: "Schuljahr",
        type: "text",
        description: "Nur Angebote des aktiven Schuljahrs werden angezeigt. Beispiel: 2026/27.",
      },
      {
        key: "weekday",
        label: "Wochentag",
        type: "select",
        options: [
          {
            value: "Montag",
            label: "Montag",
          },
          {
            value: "Dienstag",
            label: "Dienstag",
          },
          {
            value: "Mittwoch",
            label: "Mittwoch",
          },
          {
            value: "Donnerstag",
            label: "Donnerstag",
          },
          {
            value: "Freitag",
            label: "Freitag",
          },
        ],
      },
      {
        key: "gradeFrom",
        label: "Ab Klasse",
        type: "number",
        min: 1,
        max: 10,
      },
      {
        key: "gradeTo",
        label: "Bis Klasse",
        type: "number",
        min: 1,
        max: 10,
      },
      {
        key: "organization",
        label: "Organisation",
        type: "text",
        description: "Optional, zum Beispiel „NaNo“.",
        optional: true,
      },
      {
        key: "description",
        label: "Beschreibung",
        type: "textarea",
        description: "Zwei bis vier kurze Sätze. Klassenstufen und Kosten nicht wiederholen.",
      },
      {
        key: "additionalCostNote",
        label: "Zusätzlicher Kostenhinweis",
        type: "textarea",
        description:
          "Optional, falls zum Beispiel eine Abschlussfahrt zusätzliche Kosten verursacht.",
        optional: true,
      },
      {
        key: "externalUrl",
        label: "Externer Link",
        type: "text",
        description: "Optional, vollständige Adresse beginnend mit https://.",
        optional: true,
      },
      {
        key: "position",
        label: "Position innerhalb des Wochentags",
        type: "number",
        description:
          "10 steht weiter oben als 20. Bei gleicher Position wird alphabetisch sortiert.",
        defaultValue: 50,
        min: 1,
      },
    ],
  },
  {
    collection: "team",
    label: "Team",
    area: "Menschen",
    directory: "src/content/team",
    fields: [
      {
        key: "name",
        label: "Name",
        type: "text",
      },
      {
        key: "assignments",
        label: "Rollen und Bereiche",
        type: "list",
        item: {
          key: "item",
          label: "Eintrag",
          type: "object",
          description:
            "Für jede Darstellung auf der Teamseite einen Eintrag anlegen. Leitungen können so zusätzlich in ihrem pädagogischen Bereich erscheinen.",
          fields: [
            {
              key: "group",
              label: "Bereich",
              type: "select",
              options: [
                {
                  value: "Leitung",
                  label: "Leitung",
                },
                {
                  value: "Kindergarten",
                  label: "Kindergarten",
                },
                {
                  value: "Primaria",
                  label: "Primaria",
                },
                {
                  value: "Sekundaria",
                  label: "Sekundaria",
                },
                {
                  value: "Tertia",
                  label: "Tertia",
                },
                {
                  value: "Fach- & Förderteam",
                  label: "Fach- & Förderteam",
                },
                {
                  value: "Verwaltung",
                  label: "Verwaltung",
                },
                {
                  value: "Vorstand",
                  label: "Vorstand",
                },
              ],
            },
            {
              key: "section",
              label: "Untergruppe",
              type: "select",
              description:
                "Für Primaria und Sekundaria verpflichtend auswählen; bei allen anderen Bereichen leer lassen.",
              optional: true,
              options: [
                {
                  value: "Klassenleitungen",
                  label: "Klassenleitungen",
                },
                {
                  value: "Pädagogische Assistenzen",
                  label: "Pädagogische Assistenzen",
                },
              ],
              showWhen: {
                field: "group",
                values: ["Primaria", "Sekundaria"],
              },
            },
            {
              key: "role",
              label: "Rolle",
              type: "text",
              description: "Optional, wenn die Untergruppe die Rolle bereits eindeutig macht.",
              optional: true,
            },
            {
              key: "position",
              label: "Position innerhalb des Bereichs",
              type: "number",
              description:
                "10 steht weiter oben als 20. Bei gleicher Position wird alphabetisch sortiert.",
              defaultValue: 50,
              min: 1,
            },
          ],
        },
        description:
          "Für jede Darstellung auf der Teamseite einen Eintrag anlegen. Leitungen können so zusätzlich in ihrem pädagogischen Bereich erscheinen.",
        min: 1,
      },
      {
        key: "image",
        label: "Porträt",
        type: "image",
        optional: true,
      },
    ],
  },
  {
    collection: "parentCouncil",
    label: "Elternbeirat",
    area: "Menschen",
    directory: "src/content/parent-council",
    fields: [
      {
        key: "name",
        label: "Name",
        type: "text",
      },
      {
        key: "area",
        label: "Bereich",
        type: "select",
        options: [
          {
            value: "Kindergarten",
            label: "Kindergarten",
          },
          {
            value: "Schule",
            label: "Schule",
          },
        ],
      },
      {
        key: "role",
        label: "Rolle",
        type: "text",
        description: "Optional, zum Beispiel „Vorsitzende“.",
        optional: true,
      },
      {
        key: "position",
        label: "Position innerhalb des Bereichs",
        type: "number",
        description:
          "10 steht weiter oben als 20. Bei gleicher Position wird alphabetisch sortiert.",
        defaultValue: 50,
        min: 1,
      },
      {
        key: "image",
        label: "Porträt",
        type: "image",
        optional: true,
      },
    ],
  },
  {
    collection: "downloads",
    label: "Downloads",
    area: "Downloads",
    directory: "src/content/downloads",
    fields: [
      {
        key: "title",
        label: "Titel",
        type: "text",
      },
      {
        key: "documentDate",
        label: "Stand des Dokuments",
        type: "text",
        description:
          "Optional, zum Beispiel „März 2026“. „Stand“, Dateityp und Dateigröße ergänzt die Website automatisch.",
        optional: true,
      },
      {
        key: "note",
        label: "Zusätzlicher kurzer Hinweis",
        type: "text",
        description: "Optional, zum Beispiel „inkl. Datenschutzhinweisen“.",
        optional: true,
      },
      {
        key: "file",
        label: "PDF-Datei",
        type: "pdf",
      },
      {
        key: "group",
        label: "Bereich",
        type: "select",
        options: [
          {
            value: "Schule",
            label: "Schule",
          },
          {
            value: "Kindergarten",
            label: "Kindergarten",
          },
          {
            value: "Verein",
            label: "Verein",
          },
        ],
      },
      {
        key: "position",
        label: "Position innerhalb des Bereichs",
        type: "number",
        description:
          "10 steht weiter oben als 20. Bei gleicher Position wird alphabetisch sortiert.",
        defaultValue: 50,
        min: 1,
      },
    ],
  },
  {
    collection: "donations",
    label: "Spendenseite",
    area: "Spenden",
    directory: "src/content/donations",
    singleton: "page",
    fields: [
      {
        key: "seo",
        label: "Suchmaschinen und Vorschau",
        type: "object",
        fields: [
          {
            key: "title",
            label: "Seitentitel",
            type: "text",
          },
          {
            key: "description",
            label: "Seitenbeschreibung",
            type: "textarea",
          },
        ],
      },
      {
        key: "homepage",
        label: "Hinweis auf der Startseite",
        type: "object",
        fields: [
          {
            key: "eyebrow",
            label: "Kleine Überschrift",
            type: "text",
          },
          {
            key: "title",
            label: "Überschrift",
            type: "text",
          },
          {
            key: "text",
            label: "Text",
            type: "textarea",
          },
          {
            key: "label",
            label: "Linktext",
            type: "text",
          },
        ],
      },
      {
        key: "hero",
        label: "Seiteneinstieg",
        type: "object",
        fields: [
          {
            key: "eyebrow",
            label: "Kleine Überschrift",
            type: "text",
          },
          {
            key: "title",
            label: "Hauptüberschrift",
            type: "text",
          },
          {
            key: "intro",
            label: "Einleitung",
            type: "textarea",
          },
        ],
      },
      {
        key: "impact",
        label: "Warum Unterstützung wirkt",
        type: "object",
        fields: [
          {
            key: "eyebrow",
            label: "Kleine Überschrift",
            type: "text",
          },
          {
            key: "title",
            label: "Überschrift",
            type: "text",
          },
          {
            key: "imageAlt",
            label: "Alternativtext des Bildes",
            type: "text",
          },
          {
            key: "paragraphs",
            label: "Absätze",
            type: "list",
            item: {
              key: "item",
              label: "Eintrag",
              type: "textarea",
            },
            min: 1,
          },
        ],
      },
      {
        key: "projects",
        label: "Aktuelle Förderschwerpunkte",
        type: "object",
        fields: [
          {
            key: "eyebrow",
            label: "Kleine Überschrift",
            type: "text",
          },
          {
            key: "title",
            label: "Überschrift",
            type: "text",
          },
          {
            key: "intro",
            label: "Einleitung",
            type: "textarea",
          },
          {
            key: "items",
            label: "Schwerpunkte",
            type: "list",
            item: {
              key: "item",
              label: "Eintrag",
              type: "object",
              fields: [
                {
                  key: "title",
                  label: "Titel",
                  type: "text",
                },
                {
                  key: "description",
                  label: "Beschreibung",
                  type: "textarea",
                },
              ],
            },
            min: 1,
            max: 4,
          },
        ],
      },
      {
        key: "directDonation",
        label: "Direkte Spende",
        type: "object",
        fields: [
          {
            key: "eyebrow",
            label: "Kleine Überschrift",
            type: "text",
          },
          {
            key: "title",
            label: "Überschrift",
            type: "text",
          },
          {
            key: "intro",
            label: "Einleitung",
            type: "textarea",
          },
          {
            key: "account",
            label: "Spendenkonto",
            type: "object",
            fields: [
              {
                key: "recipient",
                label: "Empfänger",
                type: "text",
                adminOnly: true,
              },
              {
                key: "bank",
                label: "Bank",
                type: "text",
                adminOnly: true,
              },
              {
                key: "iban",
                label: "IBAN",
                type: "text",
                adminOnly: true,
              },
              {
                key: "bic",
                label: "BIC",
                type: "text",
                adminOnly: true,
              },
              {
                key: "purpose",
                label: "Verwendungszweck",
                type: "text",
              },
            ],
          },
          {
            key: "note",
            label: "Hinweis",
            type: "textarea",
          },
        ],
      },
      {
        key: "company",
        label: "Firmen und Förderpartner",
        type: "object",
        fields: [
          {
            key: "eyebrow",
            label: "Kleine Überschrift",
            type: "text",
          },
          {
            key: "title",
            label: "Überschrift",
            type: "text",
          },
          {
            key: "text",
            label: "Einleitung",
            type: "textarea",
          },
          {
            key: "detail",
            label: "Erläuterung",
            type: "textarea",
          },
          {
            key: "buttonLabel",
            label: "Text des E-Mail-Links",
            type: "text",
          },
          {
            key: "emailSubject",
            label: "Betreff der E-Mail",
            type: "text",
          },
        ],
      },
      {
        key: "receipt",
        label: "Spendenbescheinigung",
        type: "object",
        fields: [
          {
            key: "eyebrow",
            label: "Kleine Überschrift",
            type: "text",
          },
          {
            key: "title",
            label: "Überschrift",
            type: "text",
          },
          {
            key: "intro",
            label: "Einleitung",
            type: "textarea",
          },
          {
            key: "instruction",
            label: "Ablauf",
            type: "textarea",
          },
          {
            key: "buttonLabel",
            label: "Text des E-Mail-Links",
            type: "text",
          },
          {
            key: "emailSubject",
            label: "Betreff der E-Mail",
            type: "text",
          },
        ],
      },
      {
        key: "otherSupport",
        label: "Andere Unterstützung",
        type: "object",
        fields: [
          {
            key: "eyebrow",
            label: "Kleine Überschrift",
            type: "text",
          },
          {
            key: "title",
            label: "Überschrift",
            type: "text",
          },
          {
            key: "text",
            label: "Text",
            type: "textarea",
          },
          {
            key: "primaryLabel",
            label: "Linktext Mitgliedschaft",
            type: "text",
          },
          {
            key: "secondaryLabel",
            label: "Linktext Kontakt",
            type: "text",
          },
        ],
      },
    ],
  },
  {
    collection: "contactSettings",
    label: "Kontakt & Anschrift",
    area: "Kontakt & Zeiten",
    directory: "src/content/settings",
    singleton: "contact",
    fields: [
      {
        key: "email",
        label: "E-Mail Schulbüro",
        type: "text",
      },
      {
        key: "careersEmail",
        label: "E-Mail Bewerbungen und Karriere",
        type: "text",
      },
      {
        key: "kindergartenEmail",
        label: "E-Mail Kindergarten",
        type: "text",
      },
      {
        key: "parentCouncilKindergartenEmail",
        label: "E-Mail Elternbeirat Kindergarten",
        type: "text",
      },
      {
        key: "parentCouncilSchoolEmail",
        label: "E-Mail Elternbeirat Schule",
        type: "text",
      },
      {
        key: "phone",
        label: "Telefonnummer Schulbüro",
        type: "text",
        description:
          "So eingeben, wie die Nummer sichtbar sein soll. Den Telefonlink erzeugt die Website automatisch.",
      },
      {
        key: "kindergartenPhone",
        label: "Telefonnummer Kindergarten",
        type: "text",
        description:
          "So eingeben, wie die Nummer sichtbar sein soll. Den Telefonlink erzeugt die Website automatisch.",
      },
      {
        key: "address",
        label: "Anschrift",
        type: "object",
        fields: [
          {
            key: "street",
            label: "Straße und Hausnummer",
            type: "text",
          },
          {
            key: "postalCode",
            label: "Postleitzahl",
            type: "text",
          },
          {
            key: "locality",
            label: "Ort",
            type: "text",
          },
          {
            key: "district",
            label: "Ortsteil",
            type: "text",
            description: "Optional, zum Beispiel „Kalzhofen“.",
            optional: true,
          },
        ],
      },
    ],
  },
  {
    collection: "openingHoursSettings",
    label: "Öffnungszeiten",
    area: "Kontakt & Zeiten",
    directory: "src/content/settings",
    singleton: "opening-hours",
    fields: [
      {
        key: "school",
        label: "Schulzeiten",
        type: "object",
        fields: [
          {
            key: "primaria",
            label: "Primaria",
            type: "textarea",
            description: "Reguläre Unterrichtszeit und mögliche Abweichung.",
          },
          {
            key: "secundariaAndTertia",
            label: "Sekundaria und Tertia",
            type: "textarea",
            description: "Reguläre Unterrichtszeit und verpflichtender Nachmittag.",
          },
        ],
      },
      {
        key: "schoolOffice",
        label: "Schulbüro",
        type: "list",
        item: {
          key: "item",
          label: "Eintrag",
          type: "text",
        },
        min: 1,
      },
      {
        key: "kindergarten",
        label: "Kindergarten",
        type: "list",
        item: {
          key: "item",
          label: "Eintrag",
          type: "object",
          fields: [
            {
              key: "days",
              label: "Wochentage",
              type: "text",
            },
            {
              key: "hours",
              label: "Reguläre Öffnungszeit",
              type: "text",
            },
            {
              key: "details",
              label: "Verlängerte Betreuung",
              type: "list",
              item: {
                key: "item",
                label: "Eintrag",
                type: "text",
                optional: true,
              },
              optional: true,
            },
          ],
        },
        min: 1,
      },
      {
        key: "ganztag",
        label: "Ganztag",
        type: "text",
        description: "Derzeit nicht auf der Website angezeigt.",
      },
      {
        key: "kindergartenClosures",
        label: "Schließzeiten Kindergarten",
        type: "object",
        fields: [
          {
            key: "schoolYear",
            label: "Kindergartenjahr",
            type: "text",
          },
          {
            key: "intro",
            label: "Einleitung",
            type: "textarea",
          },
          {
            key: "periods",
            label: "Schließzeiten",
            type: "list",
            item: {
              key: "item",
              label: "Eintrag",
              type: "object",
              fields: [
                {
                  key: "label",
                  label: "Ferien",
                  type: "text",
                },
                {
                  key: "dates",
                  label: "Zeitraum",
                  type: "text",
                },
              ],
            },
            min: 1,
          },
          {
            key: "holidayNote",
            label: "Hinweis zu Feiertagen",
            type: "textarea",
          },
        ],
      },
    ],
  },
  {
    collection: "kindergartenAdmissionSettings",
    label: "Aufnahme Kindergarten",
    area: "Aufnahme",
    directory: "src/content/settings",
    singleton: "kindergarten-admission",
    fields: [
      {
        key: "schoolYear",
        label: "Kindergartenjahr",
        type: "text",
        description: "Vollständig eingeben, zum Beispiel 2027/2028.",
      },
      {
        key: "applicationDeadline",
        label: "Anmeldeschluss",
        type: "date",
      },
    ],
  },
  {
    collection: "schoolAdmissionSettings",
    label: "Aufnahme Schule",
    area: "Aufnahme",
    directory: "src/content/settings",
    singleton: "school-admission",
    fields: [
      {
        key: "schoolYear",
        label: "Schuljahr",
        type: "text",
        description: "Nur Angebote des aktiven Schuljahrs werden angezeigt. Beispiel: 2026/27.",
      },
      {
        key: "applicationDeadline",
        label: "Anmeldeschluss",
        type: "date",
      },
    ],
  },
  {
    collection: "mealSettings",
    label: "Mittagessen",
    area: "Ganztag & Essen",
    directory: "src/content/settings",
    singleton: "meals",
    fields: [
      {
        key: "provider",
        label: "Anbieter",
        type: "text",
      },
      {
        key: "schedule",
        label: "Liefertage",
        type: "text",
        description: "Derzeit nicht auf der Website angezeigt.",
      },
      {
        key: "price",
        label: "Richtpreis",
        type: "text",
        description: "Derzeit nicht auf der Website angezeigt.",
      },
      {
        key: "note",
        label: "Hinweis",
        type: "textarea",
        description: "Derzeit nicht auf der Website angezeigt.",
      },
    ],
  },
  {
    collection: "afternoonProgramSettings",
    label: "Ganztag & Kurswahl",
    area: "Ganztag & Essen",
    directory: "src/content/settings",
    singleton: "afternoon-program",
    fields: [
      {
        key: "activeSchoolYear",
        label: "Aktives Schuljahr",
        type: "text",
        description: "Das Programm und das zugehörige Schuljahr werden gemeinsam gespeichert.",
      },
      {
        key: "minimumAfternoons",
        label: "Mindestanzahl Nachmittage",
        type: "number",
        min: 1,
        max: 5,
      },
      {
        key: "maximumAfternoons",
        label: "Höchstanzahl Nachmittage",
        type: "number",
        min: 1,
        max: 5,
      },
      {
        key: "intro",
        label: "Erklärung der Kurswahl",
        type: "textarea",
      },
      {
        key: "secundariaNote",
        label: "Hinweis Sekundaria & Tertia",
        type: "textarea",
      },
    ],
  },
  {
    collection: "schoolFeeSettings",
    label: "Schulgeld",
    area: "Kosten",
    directory: "src/content/settings",
    singleton: "school-fees",
    fields: [
      {
        key: "intro",
        label: "Einleitung zum Schulgeld",
        type: "textarea",
      },
      {
        key: "rows",
        label: "Schulgeld",
        type: "list",
        item: {
          key: "item",
          label: "Eintrag",
          type: "object",
          fields: [
            {
              key: "label",
              label: "Bezeichnung",
              type: "text",
            },
            {
              key: "amount",
              label: "Betrag",
              type: "text",
            },
          ],
        },
        min: 1,
      },
    ],
  },
  {
    collection: "kindergartenFeeSettings",
    label: "Kindergartenbeiträge",
    area: "Kosten",
    directory: "src/content/settings",
    singleton: "kindergarten-fees",
    fields: [
      {
        key: "intro",
        label: "Einleitung",
        type: "textarea",
      },
      {
        key: "rows",
        label: "Beiträge nach Buchungszeit",
        type: "list",
        item: {
          key: "item",
          label: "Eintrag",
          type: "object",
          fields: [
            {
              key: "label",
              label: "Buchungszeit",
              type: "text",
            },
            {
              key: "amount",
              label: "Grundbeitrag",
              type: "text",
            },
            {
              key: "effectiveAmount",
              description:
                "Wird bei numerischen Eurobeträgen automatisch aus Grundbeitrag und Zuschuss berechnet.",
              label: "Effektiver Beitrag mit Zuschuss",
              type: "text",
            },
          ],
        },
        min: 1,
      },
      {
        key: "subsidyAmount",
        label: "Monatlicher Beitragszuschuss",
        type: "text",
      },
      {
        key: "subsidyNote",
        label: "Hinweis zum Beitragszuschuss",
        type: "textarea",
      },
    ],
  },
  {
    collection: "communityContributionSettings",
    label: "Einlage, Elternarbeit & Verein",
    area: "Kosten",
    directory: "src/content/settings",
    singleton: "community-contributions",
    fields: [
      {
        key: "deposit",
        label: "Elterneinlage",
        type: "object",
        fields: [
          {
            key: "intro",
            label: "Einleitung",
            type: "textarea",
          },
          {
            key: "description",
            label: "Rückzahlungshinweis",
            type: "textarea",
          },
          {
            key: "rows",
            label: "Beträge",
            type: "list",
            item: {
              key: "item",
              label: "Eintrag",
              type: "object",
              fields: [
                {
                  key: "label",
                  label: "Bezeichnung",
                  type: "text",
                },
                {
                  key: "amount",
                  label: "Betrag",
                  type: "text",
                },
              ],
            },
            min: 1,
          },
        ],
      },
      {
        key: "parentWork",
        label: "Elternarbeit",
        type: "object",
        fields: [
          {
            key: "intro",
            label: "Einleitung",
            type: "textarea",
          },
          {
            key: "school",
            label: "Schule",
            type: "object",
            fields: [
              {
                key: "label",
                label: "Überschrift",
                type: "text",
              },
              {
                key: "amount",
                label: "Stunden",
                type: "text",
              },
              {
                key: "detail",
                label: "Erläuterung",
                type: "textarea",
              },
            ],
          },
          {
            key: "kindergarten",
            label: "Kindergarten",
            type: "object",
            fields: [
              {
                key: "label",
                label: "Überschrift",
                type: "text",
              },
              {
                key: "amount",
                label: "Stunden",
                type: "text",
              },
              {
                key: "detail",
                label: "Erläuterung",
                type: "textarea",
              },
            ],
          },
          {
            key: "missedHours",
            label: "Nicht geleistete Zeit",
            type: "object",
            fields: [
              {
                key: "label",
                label: "Überschrift",
                type: "text",
              },
              {
                key: "amount",
                label: "Betrag",
                type: "text",
              },
              {
                key: "detail",
                label: "Erläuterung",
                type: "textarea",
              },
            ],
          },
        ],
      },
      {
        key: "membership",
        label: "Vereinsmitgliedschaft",
        type: "object",
        fields: [
          {
            key: "intro",
            label: "Einleitung",
            type: "textarea",
          },
          {
            key: "rows",
            label: "Beiträge",
            type: "list",
            item: {
              key: "item",
              label: "Eintrag",
              type: "text",
            },
            min: 1,
          },
        ],
      },
    ],
  },
] satisfies Omit<ContentDefinition, "defaults">[];
