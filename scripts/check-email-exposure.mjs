import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { parse } from "yaml";

const legalPages = new Set(["impressum/index.html", "datenschutz/index.html"]);
/** @param {string | URL} [contactPath] */
export function readLegalEmail(
  contactPath = new URL("../src/content/settings/contact.yml", import.meta.url),
) {
  const contact = parse(readFileSync(contactPath, "utf8"));
  if (typeof contact?.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email)) {
    throw new Error("The canonical public contact email is missing or invalid.");
  }
  return contact.email;
}
const emailPattern = /[a-z\d.!#$%&'*+/=?^_`{|}~-]+@[a-z\d.-]+\.[a-z]{2,}/gi;
const linkPattern = /\bmailto:[^\s"'<>`\\)]+/gi;

function decodeReferences(text) {
  return text
    .replace(/&#(x[\da-f]+|\d+);?/gi, (match, value) => {
      const number = value.toLowerCase().startsWith("x")
        ? Number.parseInt(value.slice(1), 16)
        : Number.parseInt(value, 10);
      return number <= 0x10ffff ? String.fromCodePoint(number) : match;
    })
    .replace(
      /&(commat|period|colon|amp);/gi,
      (_, name) => ({ commat: "@", period: ".", colon: ":", amp: "&" })[name.toLowerCase()],
    )
    .replace(/%([\da-f]{2})/gi, (_, value) => String.fromCharCode(Number.parseInt(value, 16)))
    .replace(/\\u([\da-f]{4})|\\x([\da-f]{2})/gi, (_, unicode, hex) =>
      String.fromCharCode(Number.parseInt(unicode ?? hex, 16)),
    );
}

export function findEmailExposure(path, source, legalEmail = readLegalEmail()) {
  let text = decodeReferences(source);
  if (legalPages.has(path)) {
    // Only the marked public contact anchor is exempt, never JSON-LD or scripts.
    text = text.replace(/<a\b[^>]*\bdata-public-email(?:\s|=|>)[\s\S]*?<\/a>/gi, (anchor) =>
      anchor
        .replace(linkPattern, (link) => (link === `mailto:${legalEmail}` ? "" : link))
        .replace(emailPattern, (email) => (email === legalEmail ? "" : email)),
    );
  }
  const emails = text.match(emailPattern) ?? [];
  const links = text.match(linkPattern) ?? [];
  return [...new Set([...emails, ...links])];
}

export function checkEmailExposure(directory, legalEmail = readLegalEmail()) {
  const root = resolve(directory);
  const files = readdirSync(root, { recursive: true, withFileTypes: true }).filter(
    (entry) => entry.isFile() && extname(entry.name).toLowerCase() !== ".pdf",
  );
  if (!files.some((entry) => extname(entry.name) === ".html")) {
    throw new Error(`No built HTML found in ${root}; run the production build first.`);
  }
  const findings = [];
  let checked = 0;
  for (const file of files) {
    const absolute = join(file.parentPath, file.name);
    const path = relative(root, absolute).split(sep).join("/");
    const bytes = readFileSync(absolute);
    // Detect text by content, so new extensions and extensionless files are covered too.
    if (bytes.includes(0)) continue;
    let source;
    try {
      source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      continue; // Binary assets, such as fonts and images.
    }
    checked += 1;
    const exposed = findEmailExposure(path, source, legalEmail);
    if (exposed.length) findings.push({ path, exposed });
  }
  return { checked, findings };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { checked, findings } = checkEmailExposure("dist");
  if (findings.length) {
    for (const finding of findings) console.error(`${finding.path}: ${finding.exposed.join(", ")}`);
    process.exitCode = 1;
  } else {
    process.stdout.write(`Email exposure check passed (${checked} text assets; PDFs excluded).\n`);
  }
}
