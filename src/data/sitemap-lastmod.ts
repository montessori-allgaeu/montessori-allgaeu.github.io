import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";

const sharedPageSources = ["src/layouts/BaseLayout.astro", "src/content/settings/contact.yml"];
const seoModule = "src/data/seo.ts";
const seoPagesDirectory = "src/data/seo-pages";

const importExtensions = [".ts", ".tsx", ".js", ".mjs", ".astro", ".css"];
const parseableExtensions = new Set(importExtensions);
const moduleSpecifierPattern =
  /\b(?:import|export)\s+(?:type\s+)?(?:[\w*{},\s$]+?\s+from\s+)?["']([^"']+)["']/g;
const globSpecifierPattern = /import\.meta\.glob(?:<[^>]+>)?\(\s*["']([^"']+)["']/g;

const contentSourcesByPath: Record<string, string[]> = {
  "/": ["src/content/donations/page.yml"],
  "/arbeiten-bei-uns/": ["src/content/jobs"],
  "/arbeiten-bei-uns/stellen/": ["src/content/jobs"],
  "/downloads/": ["src/content/downloads", "public/downloads"],
  "/gemeinschaft/elternbeirat/": ["src/content/parent-council", "src/assets/images/parent-council"],
  "/gemeinschaft/team/": ["src/content/team", "src/assets/images/team"],
  "/gemeinschaft/traeger-verein/": ["src/content/team", "src/assets/images/team"],
  "/impressum/": ["src/content/team"],
  "/kennenlernen/aufnahme-kindergarten/": ["src/content/settings/kindergarten-admission.yml"],
  "/kennenlernen/aufnahme-schule/": ["src/content/settings/school-admission.yml"],
  "/kennenlernen/kosten/": [
    "src/content/settings/school-fees.yml",
    "src/content/settings/kindergarten-fees.yml",
    "src/content/settings/community-contributions.yml",
  ],
  "/kindergarten-schule/ganztag-verpflegung/": [
    "src/content/afternoon-offers",
    "src/content/settings/afternoon-program.yml",
    "src/content/settings/meals.yml",
  ],
  "/kindergarten-schule/kindergarten/": ["src/content/settings/opening-hours.yml"],
  "/kindergarten-schule/schule/": ["src/content/settings/opening-hours.yml"],
  "/kontakt/": ["src/content/settings/opening-hours.yml"],
  "/spenden/": ["src/content/donations/page.yml"],
  "/termine/": ["src/content/events"],
};

function getPageSourceCandidates(pathname: string) {
  if (pathname === "/") {
    return ["src/pages/index.astro"];
  }

  const relativePath = pathname.replace(/^\/|\/$/g, "");
  const jobMatch = pathname.match(/^\/arbeiten-bei-uns\/stellen\/([^/]+)\/$/);

  if (jobMatch) {
    return [
      "src/pages/arbeiten-bei-uns/stellen/[slug].astro",
      "src/data/job-posting.ts",
      `src/content/jobs/${jobMatch[1]}.yml`,
    ];
  }

  return [`src/pages/${relativePath}.astro`, `src/pages/${relativePath}/index.astro`];
}

function getSeoPageSourceCandidate(pathname: string) {
  const pageSlug =
    pathname === "/" ? "startseite" : pathname.replace(/^\/|\/$/g, "").replaceAll("/", "-");

  return `${seoPagesDirectory}/${pageSlug}.ts`;
}

function toProjectPath(absolutePath: string, projectRoot: string) {
  const projectPath = relative(projectRoot, absolutePath);

  if (!projectPath || projectPath.startsWith(`..${sep}`) || projectPath === "..") {
    return undefined;
  }

  return projectPath.split(sep).join("/");
}

function getImportBasePath(specifier: string, importer: string, projectRoot: string) {
  if (specifier.startsWith("@/")) {
    return join(projectRoot, "src", specifier.slice(2));
  }

  if (specifier.startsWith("/src/")) {
    return join(projectRoot, specifier.slice(1));
  }

  if (specifier.startsWith(".")) {
    return resolve(projectRoot, dirname(importer), specifier);
  }

  return undefined;
}

function resolveImportedSource(specifier: string, importer: string, projectRoot: string) {
  const basePath = getImportBasePath(specifier, importer, projectRoot);

  if (!basePath) {
    return undefined;
  }

  const candidates = [
    basePath,
    ...importExtensions.map((extension) => `${basePath}${extension}`),
    ...importExtensions.map((extension) => join(basePath, `index${extension}`)),
  ];
  const match = candidates.find(
    (candidate) => existsSync(candidate) && statSync(candidate).isFile(),
  );

  return match ? toProjectPath(match, projectRoot) : undefined;
}

function resolveGlobDirectory(specifier: string, importer: string, projectRoot: string) {
  const globStart = specifier.search(/[*?{[]/);
  const fixedPrefix = globStart === -1 ? specifier : specifier.slice(0, globStart);
  const directorySpecifier = fixedPrefix.endsWith("/")
    ? fixedPrefix.slice(0, -1)
    : dirname(fixedPrefix);
  const directory = getImportBasePath(directorySpecifier, importer, projectRoot);

  if (!directory || !existsSync(directory) || !statSync(directory).isDirectory()) {
    return undefined;
  }

  return toProjectPath(directory, projectRoot);
}

function getSourceCode(source: string, projectRoot: string) {
  const code = readFileSync(join(projectRoot, source), "utf8");

  if (extname(source) !== ".astro") {
    return code;
  }

  return code.match(/^---\s*\n([\s\S]*?)\n---/)?.[1] ?? "";
}

function addSourceDependencies(
  source: string,
  projectRoot: string,
  sources: Set<string>,
  visited: Set<string>,
) {
  if (visited.has(source)) {
    return;
  }

  visited.add(source);
  const absolutePath = join(projectRoot, source);

  if (!existsSync(absolutePath)) {
    return;
  }

  sources.add(source);

  if (!statSync(absolutePath).isFile() || !parseableExtensions.has(extname(source))) {
    return;
  }

  const code = getSourceCode(source, projectRoot);

  for (const match of code.matchAll(moduleSpecifierPattern)) {
    const dependency = resolveImportedSource(match[1], source, projectRoot);

    if (dependency && !(source === seoModule && dependency.startsWith(`${seoPagesDirectory}/`))) {
      addSourceDependencies(dependency, projectRoot, sources, visited);
    }
  }

  for (const match of code.matchAll(globSpecifierPattern)) {
    const dependency = resolveGlobDirectory(match[1], source, projectRoot);

    if (dependency) {
      addSourceDependencies(dependency, projectRoot, sources, visited);
    }
  }
}

export function getSitemapSourcePaths(pageUrl: string, projectRoot = process.cwd()) {
  const pathname = new URL(pageUrl).pathname;
  const candidates = [
    ...sharedPageSources,
    ...getPageSourceCandidates(pathname),
    getSeoPageSourceCandidate(pathname),
    ...(contentSourcesByPath[pathname] ?? []),
  ];
  const sources = new Set<string>();
  const visited = new Set<string>();

  for (const source of candidates) {
    addSourceDependencies(source, projectRoot, sources, visited);
  }

  return [...sources];
}

export function getSitemapLastModified(pageUrl: string, projectRoot = process.cwd()) {
  const sources = getSitemapSourcePaths(pageUrl, projectRoot);
  const lastModified = execFileSync("git", ["log", "-1", "--format=%cI", "--", ...sources], {
    cwd: projectRoot,
    encoding: "utf8",
  }).trim();
  const date = new Date(lastModified);

  if (!lastModified || Number.isNaN(date.getTime())) {
    throw new Error(
      `Kein Git-Änderungsdatum für ${pageUrl} gefunden. Der Build benötigt einen vollständigen Git-Checkout.`,
    );
  }

  return date.toISOString();
}
