export type Job = {
  slug: string;
  title: string;
  area: string;
  schedule: string;
  intro: string;
  responsibilities: string[];
  profile: string[];
};

export const jobs: Job[] = [
  {
    slug: "klassenlehrkraft-sekundaria",
    title: "Klassenlehrkraft Sekundaria",
    area: "Schule · Klasse 5–7",
    schedule: "Umfang nach Vereinbarung",
    intro:
      "Du möchtest Jugendliche in einer jahrgangsgemischten Lerngruppe begleiten und Montessori nicht nur benennen, sondern im Alltag leben.",
    responsibilities: [
      "Lernprozesse beobachten, begleiten und gemeinsam mit dem Klassenteam vorbereiten",
      "Verlässliche Beziehungen und klare, liebevolle Grenzen gestalten",
      "Mit Eltern und dem pädagogischen Team offen und früh kommunizieren",
    ],
    profile: [
      "Pädagogische Qualifikation und echte Verbindung zur Montessori-Pädagogik",
      "Freude an eigenverantwortlichem Arbeiten im Team",
      "Bereitschaft, Feedback anzunehmen und gemeinsam weiterzulernen",
    ],
  },
  {
    slug: "fachlehrkraft-musik",
    title: "Fachlehrkraft Musik",
    area: "Schule",
    schedule: "Teilzeit · Umfang nach Vereinbarung",
    intro:
      "Du eröffnest Kindern und Jugendlichen einen lebendigen Zugang zu Musik und bringst deine fachliche Handschrift in unsere vorbereitete Umgebung ein.",
    responsibilities: [
      "Musikalische Lernangebote altersübergreifend planen und begleiten",
      "Interessen der Kinder aufnehmen und eigene Impulse setzen",
      "Feste, Projekte und gemeinschaftliche Formate mitgestalten",
    ],
    profile: [
      "Fachliche und pädagogische Qualifikation",
      "Eine zugewandte, klare Haltung gegenüber Kindern und Jugendlichen",
      "Interesse an Montessori und an gemeinsamer pädagogischer Entwicklung",
    ],
  },
  {
    slug: "paedagogische-fachkraft-kindergarten",
    title: "Pädagogische Fachkraft / Erzieher:in",
    area: "Kindergarten",
    schedule: "Vollzeit oder Teilzeit",
    intro:
      "Du willst Kinder aufmerksam, warm und fachlich fundiert begleiten – im Gruppenraum ebenso wie an unseren zwei Waldtagen pro Woche.",
    responsibilities: [
      "Kinder beobachten, feinfühlig begleiten und ihre Eigenaktivität unterstützen",
      "Eine sichere, vorbereitete Umgebung im Haus und in der Natur gestalten",
      "Mit Familien und Kollegium transparent und verbindlich zusammenarbeiten",
    ],
    profile: [
      "Anerkannte Qualifikation als pädagogische Fachkraft",
      "Montessorische oder naturpädagogische Erfahrung – oder Lust, sie fundiert aufzubauen",
      "Offenes Herz, klare Grenzen und Freude an Reflexion",
    ],
  },
  {
    slug: "paedagogische-fachkraft-kindergarten-teilzeit",
    title: "Pädagogische Fachkraft Kindergarten in Teilzeit",
    area: "Kindergarten",
    schedule: "Teilzeit · Umfang nach Vereinbarung",
    intro:
      "Du ergänzt unser Kindergartenteam verlässlich und bringst dich mit Wärme, Beobachtungsgabe und echter Freude an der Arbeit mit Kindern ein.",
    responsibilities: [
      "Kinder im Alltag und in der Natur feinfühlig begleiten",
      "Vorbereitete Lern- und Spielräume gemeinsam pflegen",
      "Verantwortung im Team übernehmen und Absprachen klar halten",
    ],
    profile: [
      "Anerkannte pädagogische Qualifikation",
      "Eine kindorientierte, respektvolle Haltung",
      "Verlässlichkeit und Freude an einem lernenden Team",
    ],
  },
  {
    slug: "bundesfreiwilligendienst",
    title: "Bundesfreiwilligendienst",
    area: "Kindergarten oder Schule",
    schedule: "BFD · Start nach Vereinbarung",
    intro:
      "Du möchtest ein Jahr lang wirklich mitarbeiten, Kinder im Alltag begleiten und eine andere Art von Pädagogik von innen kennenlernen.",
    responsibilities: [
      "Pädagog:innen im Tagesablauf unterstützen",
      "Bei Projekten, Ausflügen und in der vorbereiteten Umgebung mitwirken",
      "Verantwortung übernehmen und dich mit deinen Stärken einbringen",
    ],
    profile: [
      "Interesse an Kindern, Montessori und Gemeinschaft",
      "Zuverlässigkeit, Offenheit und Lernbereitschaft",
      "Bereitschaft, anzupacken und Rückmeldung anzunehmen",
    ],
  },
];
