import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { dirname, posix } from "node:path";
import { pathToFileURL } from "node:url";
import { parse } from "@astrojs/compiler";
import type { Node } from "@astrojs/compiler/types";
import ts from "typescript";

const rasterImage = /\.(?:jpe?g|png|webp|avif)$/i;
const imagePath = (path: string) => path.startsWith("src/assets/images/") && rasterImage.test(path);

function normalizeImports(value: string, filename: string) {
  const source = ts.createSourceFile(filename + ".ts", value, ts.ScriptTarget.Latest, true);
  const replacements: { start: number; end: number }[] = [];
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier))
      continue;
    const specifier = statement.moduleSpecifier.text;
    const path = specifier.startsWith("@/")
      ? specifier.replace("@/", "src/")
      : posix.normalize(posix.join(dirname(filename), specifier));
    if ((specifier.startsWith("@/") || specifier.startsWith(".")) && imagePath(path))
      replacements.push({
        start: statement.moduleSpecifier.getStart(source),
        end: statement.moduleSpecifier.end,
      });
  }
  for (const { start, end } of replacements.reverse())
    value = value.slice(0, start) + '"<image>"' + value.slice(end);
  return value;
}

async function pageSignature(source: string, filename: string) {
  const parsed = await parse(source);
  if (parsed.diagnostics.some((diagnostic) => diagnostic.severity === 1))
    throw new Error("Invalid Astro page");
  function signature(node: Node, protectedText = false): unknown {
    const name = "name" in node ? node.name : undefined;
    const protect =
      protectedText || node.type === "expression" || name === "script" || name === "style";
    const value =
      "value" in node
        ? node.type === "frontmatter"
          ? normalizeImports(node.value, filename)
          : node.type === "text" && !protect
            ? ""
            : node.value
        : undefined;
    return {
      type: node.type,
      name,
      value,
      attributes:
        "attributes" in node
          ? node.attributes
              .filter(
                (attribute) =>
                  !(
                    attribute.kind === "quoted" &&
                    ((["img", "Image", "Picture", "ImageSplit", "CoverImage"].includes(
                      name ?? "",
                    ) &&
                      attribute.name === "alt") ||
                      (["ImageSplit", "CoverImage"].includes(name ?? "") &&
                        ["position", "mobilePosition"].includes(attribute.name)))
                  ),
              )
              .map(({ name, kind, value }) => ({ name, kind, value }))
          : undefined,
      children:
        "children" in node ? node.children.map((child) => signature(child, protect)) : undefined,
    };
  }
  return JSON.stringify(signature(parsed.ast));
}

export async function isContentChange(filename: string, before?: string, after?: string) {
  if (
    imagePath(filename) ||
    /^public\/downloads\/.+\.pdf$/i.test(filename) ||
    /^src\/content\/.+\.yml$/.test(filename) ||
    /^docs\/.+\.md$/.test(filename) ||
    filename === "README.md"
  )
    return true;
  // New/deleted pages and changes to executable content or structure always take the full path.
  if (!/^src\/pages\/.+\.astro$/.test(filename) || before === undefined || after === undefined)
    return false;
  return (await pageSignature(before, filename)) === (await pageSignature(after, filename));
}

export async function checkScope(
  root: string,
  base: string,
  head = "HEAD",
): Promise<"content" | "full"> {
  const git = (args: string[]) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  // A missing or divergent baseline must never suppress code checks.
  git(["merge-base", "--is-ancestor", base, head]);
  const paths = git(["diff", "--no-renames", "--name-only", "-z", base, head])
    .split("\0")
    .filter(Boolean);
  for (const filename of paths) {
    const read = (ref: string) =>
      git(["ls-tree", ref, "--", filename]) ? git(["show", `${ref}:${filename}`]) : undefined;
    if (
      !(await isContentChange(
        filename,
        filename.endsWith(".astro") ? read(base) : undefined,
        filename.endsWith(".astro") ? read(head) : undefined,
      ))
    )
      return "full";
    // Symlinks and executable files are not content, even in an allowed directory.
    for (const ref of [base, head]) {
      const mode = git(["ls-tree", ref, "--", filename]).split(" ")[0];
      if (mode && mode !== "100644") return "full";
    }
  }
  return "content";
}

async function main() {
  const args = process.argv.slice(2);
  let scope: "content" | "full" = "full";
  try {
    if (execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim())
      throw new Error("Working tree is not clean");
    let base = args[0];
    if (!base) {
      const response = await fetch("https://montessori-allgaeu.de/version.json", {
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error("Live version unavailable");
      const version = await response.json();
      if (typeof version.commit !== "string" || !/^[a-f0-9]{40}$/.test(version.commit))
        throw new Error("Invalid live commit");
      base = version.commit;
    }
    scope = await checkScope(process.cwd(), base, args[1] ?? "HEAD");
  } catch (error) {
    console.warn(
      "Cannot establish content-only changes; running all checks.",
      error instanceof Error ? error.message : error,
    );
  }
  process.stdout.write(`Check scope: ${scope}\n`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `scope=${scope}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
