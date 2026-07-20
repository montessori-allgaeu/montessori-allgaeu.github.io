export const site = {
  name: "Montessori Allgäu",
  descriptor: "Kindergarten & Schule",
  url: "https://montessori-allgaeu.de",
} as const;

export const supportLink = {
  label: "Spenden & unterstützen",
  href: "/spenden/",
} as const;

export const mainNavigation = [
  { label: "Montessori", href: "/montessori/", children: [] },
  {
    label: "Kindergarten & Schule",
    href: "/kindergarten-schule/",
    children: [
      { label: "Kindergarten", href: "/kindergarten-schule/kindergarten/" },
      { label: "Schule", href: "/kindergarten-schule/schule/" },
      {
        label: "Ganztagsschule & Verpflegung",
        href: "/kindergarten-schule/ganztag-verpflegung/",
      },
    ],
  },
  {
    label: "Kennenlernen",
    href: "/kennenlernen/",
    children: [
      { label: "Aufnahme Kindergarten", href: "/kennenlernen/aufnahme-kindergarten/" },
      { label: "Aufnahme Schule", href: "/kennenlernen/aufnahme-schule/" },
      { label: "Kosten", href: "/kennenlernen/kosten/" },
      { label: "Häufige Fragen", href: "/kennenlernen/haeufige-fragen/" },
    ],
  },
  {
    label: "Gemeinschaft",
    href: "/gemeinschaft/",
    children: [
      { label: "Team", href: "/gemeinschaft/team/" },
      { label: "Träger & Verein", href: "/gemeinschaft/traeger-verein/" },
      { label: "Unsere Geschichte", href: "/gemeinschaft/geschichte/" },
      supportLink,
    ],
  },
  {
    label: "Arbeiten bei uns",
    href: "/arbeiten-bei-uns/",
    children: [{ label: "Offene Stellen", href: "/arbeiten-bei-uns/stellen/" }],
  },
] as const;

export const footerNavigation = [
  {
    title: "Montessori",
    links: [
      { label: "Unser Ansatz", href: "/montessori/" },
      { label: "Kindergarten", href: "/kindergarten-schule/kindergarten/" },
      { label: "Schule", href: "/kindergarten-schule/schule/" },
      { label: "Ganztag & Verpflegung", href: "/kindergarten-schule/ganztag-verpflegung/" },
    ],
  },
  {
    title: "Kennenlernen",
    links: [
      { label: "Der erste Schritt", href: "/kennenlernen/" },
      { label: "Aufnahme Kindergarten", href: "/kennenlernen/aufnahme-kindergarten/" },
      { label: "Aufnahme Schule", href: "/kennenlernen/aufnahme-schule/" },
      { label: "Kosten", href: "/kennenlernen/kosten/" },
      { label: "Häufige Fragen", href: "/kennenlernen/haeufige-fragen/" },
    ],
  },
  {
    title: "Gemeinschaft",
    links: [
      { label: "Team", href: "/gemeinschaft/team/" },
      { label: "Träger & Verein", href: "/gemeinschaft/traeger-verein/" },
      { label: "Unsere Geschichte", href: "/gemeinschaft/geschichte/" },
      { label: "Termine", href: "/termine/" },
      { label: "Downloads", href: "/downloads/" },
    ],
  },
  {
    title: "Mitmachen",
    links: [
      { label: "Arbeiten bei uns", href: "/arbeiten-bei-uns/" },
      { label: "Offene Stellen", href: "/arbeiten-bei-uns/stellen/" },
      supportLink,
      { label: "Kontakt", href: "/kontakt/" },
    ],
  },
] as const;

export const principles = [
  {
    number: "01",
    title: "Montessori leben",
    is: [
      "Wir priorisieren Montessori vor gesellschaftlichen Erwartungen",
      "Wir entscheiden aus Beobachtung, Verbindung und Entwicklung heraus",
      "Wir vertrauen auf Eigenaktivität und gestalten dafür die vorbereitete Umgebung",
    ],
    isNot: [
      "Tradition ersetzt Reflexion",
      "Regelschule mit Montessori-Sprache",
      "Freiheit ohne Struktur",
      "Leistung ablehnen",
    ],
  },
  {
    number: "02",
    title: "Kind im Mittelpunkt",
    is: [
      "Das Wohl des Kindes steht über dem Wohl der Erwachsenen",
      "Wir achten Grenzen, Signale und tiefere Bedürfnisse der Kinder",
      "Wir schaffen Strukturen, in denen sich Kinder sicher entwickeln können",
    ],
    isNot: [
      "Erwachsene opfern ihre eigenen Bedürfnisse oder Grenzen",
      "Kinder machen was sie wollen",
      "Kurzfristige Harmonie mit kindlichem Wohl verwechseln",
    ],
  },
  {
    number: "03",
    title: "Konflikte annehmen",
    is: [
      "Wir suchen das schwierige Gespräch so früh wie möglich",
      "Wir sprechen an, wovor wir Angst haben und halten nichts zurück",
      "Wir sehen, dass alle Beteiligten im Kern gut sind",
      "Wir kommunizieren transparent, früh und vollständig",
    ],
    isNot: [
      "Schuldige suchen und Vorwürfe machen",
      "Gemein oder hart sein",
      "Konflikte suchen oder erschaffen",
      "Konflikte zwischen Erwachsenen vor Kindern austragen",
    ],
  },
  {
    number: "04",
    title: "Gemeinsam lernen",
    is: [
      "Wir entwickeln pädagogische und organisatorische Entscheidungen fortlaufend aus Erfahrung weiter",
      "Wir scheitern nicht, wir lernen",
      "Wir beobachten Wirkung, holen Feedback ein und passen an",
    ],
    isNot: [
      "Schlechte Arbeit machen und es Experiment nennen",
      "Nicht aus der Vergangenheit lernen",
    ],
  },
] as const;
