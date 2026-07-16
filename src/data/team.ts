import type { ImageMetadata } from "astro";

const imageModules = import.meta.glob<{ default: ImageMetadata }>("../assets/images/team/*.webp", {
  eager: true,
});

const portrait = (slug: string) => imageModules[`../assets/images/team/${slug}.webp`]?.default;

export type TeamMember = {
  name: string;
  role: string;
  group: string;
  image?: ImageMetadata;
};

export const team: TeamMember[] = [
  {
    name: "Ambra Steinhage",
    role: "Pädagogische Schulleitung · Klassenleitung Tertia",
    group: "Leitung",
    image: portrait("ambra-steinhage"),
  },
  {
    name: "Stefanie Lorinser Kefer",
    role: "Stellvertretende pädagogische Schulleitung · Klassenleitung Primaria C",
    group: "Leitung",
    image: portrait("stefanie-lorinser-kefer"),
  },
  {
    name: "Lena Stibe",
    role: "Kindergartenleitung · Gruppenleitung",
    group: "Leitung",
    image: portrait("lena-stibe"),
  },
  {
    name: "Yvonne Jörg",
    role: "Erzieherin",
    group: "Kindergarten",
    image: portrait("yvonne-joerg"),
  },
  {
    name: "Christina Fink",
    role: "Kinderpflegerin",
    group: "Kindergarten",
    image: portrait("christina-fink"),
  },
  {
    name: "Hannah Meißner",
    role: "Auszubildende",
    group: "Kindergarten",
    image: portrait("hannah-meissner"),
  },
  {
    name: "Katharina Maierhofer",
    role: "Klassenleitung Primaria A",
    group: "Primaria",
    image: portrait("katharina-maierhofer"),
  },
  {
    name: "Alexandra Riefle",
    role: "Pädagogisches Team",
    group: "Primaria",
    image: portrait("alexandra-riefle"),
  },
  {
    name: "Anda Henning",
    role: "Klassenleitung Primaria B",
    group: "Primaria",
    image: portrait("anda-henning"),
  },
  {
    name: "Margitta Kley",
    role: "Pädagogisches Team",
    group: "Primaria",
    image: portrait("margitta-kley"),
  },
  {
    name: "Teresa Keck",
    role: "Pädagogisches Team",
    group: "Primaria",
    image: portrait("teresa-keck"),
  },
  {
    name: "Susann Gieseke",
    role: "Klassenleitung Sekundaria A",
    group: "Sekundaria",
    image: portrait("susann-gieseke"),
  },
  {
    name: "Aaron Feßler",
    role: "Klassenleitung Sekundaria B",
    group: "Sekundaria",
    image: portrait("aaron-fessler"),
  },
  {
    name: "Katharina Sinz",
    role: "Pädagogisches Team",
    group: "Sekundaria",
    image: portrait("katharina-sinz"),
  },
  {
    name: "Martina Link",
    role: "Pädagogisches Team",
    group: "Sekundaria",
    image: portrait("martina-link"),
  },
  {
    name: "Kerstin Felgenhauer",
    role: "Pädagogisches Team",
    group: "Tertia",
    image: portrait("kerstin-felgenhauer"),
  },
  {
    name: "Rita Brinz",
    role: "Pädagogisches Team",
    group: "Tertia",
    image: portrait("rita-brinz"),
  },
  {
    name: "Nicola Müller",
    role: "Pädagogisches Team",
    group: "Tertia",
    image: portrait("nicola-mueller"),
  },
  {
    name: "Markus Hieble",
    role: "Pädagogisches Team",
    group: "Fach- & Förderteam",
    image: portrait("markus-hieble"),
  },
  {
    name: "Elaine Helmle",
    role: "Pädagogisches Team",
    group: "Fach- & Förderteam",
    image: portrait("elaine-helmle"),
  },
  {
    name: "Miriam Joseph",
    role: "Pädagogisches Team",
    group: "Fach- & Förderteam",
    image: portrait("miriam-joseph"),
  },
  {
    name: "Karina Bodingbauer",
    role: "Pädagogisches Team",
    group: "Fach- & Förderteam",
    image: portrait("karina-bodingbauer"),
  },
  {
    name: "Nadine Kierok",
    role: "Pädagogisches Team",
    group: "Fach- & Förderteam",
    image: portrait("nadine-kierok"),
  },
  {
    name: "Frederic Miller",
    role: "Pädagogisches Team",
    group: "Fach- & Förderteam",
    image: portrait("frederic-miller"),
  },
];

export const teamGroups = [
  "Leitung",
  "Kindergarten",
  "Primaria",
  "Sekundaria",
  "Tertia",
  "Fach- & Förderteam",
] as const;
