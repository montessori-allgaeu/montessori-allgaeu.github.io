export const teamGroups = [
  { name: "Leitung", slug: "leitung" },
  { name: "Kindergarten", slug: "kindergarten" },
  {
    name: "Primaria",
    slug: "primaria",
    sections: ["Klassenleitungen", "Pädagogische Assistenzen"],
  },
  {
    name: "Sekundaria",
    slug: "sekundaria",
    sections: ["Klassenleitungen", "Pädagogische Assistenzen"],
  },
  { name: "Tertia", slug: "tertia" },
  {
    name: "Fach- & Förderteam",
    label: "Weitere pädagogische Mitarbeiter",
    slug: "fach-foerderteam",
  },
  { name: "Verwaltung", slug: "verwaltung" },
] as const;

export const councilGroups = ["Kindergarten", "Schule"] as const;
