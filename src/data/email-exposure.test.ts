import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  checkEmailExposure,
  findEmailExposure,
  readLegalEmail,
} from "../../scripts/check-email-exposure.mjs";

describe("production email exposure guard", () => {
  it.each([
    '<a href="mailto:board@example.org?subject=Hello">Contact</a>',
    '<script type="application/ld+json">{"email":"board@example.org"}</script>',
    '<span data-contact="board&#64;example&#46;org"></span>',
    "board&commat;example&period;org",
    "mailto%3Aboard%40example.org",
    'const email = "board\\u0040example.org"',
  ])("rejects a directly recoverable address in %s", (source) => {
    expect(findEmailExposure("kontakt/index.html", source)).toContain("board@example.org");
  });

  it("allows only the marked legal contact on the two legal pages", () => {
    const email = readLegalEmail();
    const anchor = `<a href="mailto:${email}" data-public-email>${email}</a>`;
    for (const path of ["impressum/index.html", "datenschutz/index.html"]) {
      expect(findEmailExposure(path, anchor)).toEqual([]);
      expect(findEmailExposure(path, `${anchor}<script>{"email":"${email}"}</script>`)).not.toEqual(
        [],
      );
      expect(
        findEmailExposure(path, anchor.replaceAll(email, "forbidden-one@example.org")),
      ).not.toEqual([]);
      expect(findEmailExposure(path, anchor.replaceAll(email, `other-${email}`))).not.toEqual([]);
      expect(findEmailExposure(path, anchor.replaceAll(email, `${email}.example.org`))).not.toEqual(
        [],
      );
    }
    expect(findEmailExposure("kontakt/index.html", anchor)).not.toEqual([]);
    expect(findEmailExposure("impressum/index.html", email)).not.toEqual([]);
  });

  it("reads the allowed legal email from canonical contact data", () => {
    const root = mkdtempSync(join(tmpdir(), "legal-email-"));
    try {
      const contactPath = join(root, "contact.yml");
      writeFileSync(contactPath, "email: office@example.org\ncareersEmail: jobs@example.org\n");
      const email = readLegalEmail(contactPath);
      const anchor = '<a href="mailto:office@example.org" data-public-email>office@example.org</a>';
      expect(findEmailExposure("impressum/index.html", anchor, email)).toEqual([]);
      expect(
        findEmailExposure("impressum/index.html", anchor.replaceAll("office@", "jobs@"), email),
      ).not.toEqual([]);
      writeFileSync(contactPath, "email: invalid\n");
      expect(() => readLegalEmail(contactPath)).toThrow(/invalid/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("permits an opaque payload and a decoder's bare protocol literal", () => {
    expect(findEmailExposure("_astro/contact.js", 'const protocol = "mailto:";')).toEqual([]);
    const payload = Buffer.from("mailto:board@example.org").toString("base64");
    expect(
      findEmailExposure("index.html", `<span data-email-payload="${payload}"></span>`),
    ).toEqual([]);
  });

  it("checks nested production text assets, excludes PDFs and refuses a missing build", () => {
    const root = mkdtempSync(join(tmpdir(), "email-exposure-"));
    try {
      expect(() => checkEmailExposure(root)).toThrow("No built HTML");
      mkdirSync(join(root, "_astro"));
      writeFileSync(join(root, "index.html"), "<p>Contact</p>");
      writeFileSync(join(root, "_astro", "contact.js"), 'const email = "board@example.org";');
      writeFileSync(join(root, "unchanged.pdf"), "board@example.org");
      expect(checkEmailExposure(root)).toEqual({
        checked: 2,
        findings: [{ path: "_astro/contact.js", exposed: ["board@example.org"] }],
      });
      writeFileSync(join(root, "contact.unknown"), "board@example.org");
      writeFileSync(join(root, "CONTACT"), "board@example.org");
      expect(checkEmailExposure(root).findings.map(({ path }) => path)).toEqual(
        expect.arrayContaining(["contact.unknown", "CONTACT"]),
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
