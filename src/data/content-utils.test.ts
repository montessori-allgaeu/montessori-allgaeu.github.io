import { describe, expect, it } from "vitest";
import { formatDownloadMeta, formatFileSize, formatGermanPhoneHref } from "./content-utils";

describe("editorial content helpers", () => {
  it("turns a readable German telephone number into a link target", () => {
    expect(formatGermanPhoneHref("08386 93921-0")).toBe("+498386939210");
    expect(formatGermanPhoneHref("+49 (0)8386 93921-0")).toBe("+498386939210");
    expect(formatGermanPhoneHref("0049 (0)8386 93921-0")).toBe("+498386939210");
  });

  it("formats file sizes for the German download list", () => {
    expect(formatFileSize(187 * 1024)).toBe("187 KB");
    expect(formatFileSize(Math.round(2.2 * 1024 * 1024))).toBe("2,2 MB");
  });

  it("builds download metadata from editorial facts and the real file", () => {
    expect(formatDownloadMeta({ documentDate: "März 2025" }, 555 * 1024)).toBe(
      "Stand März 2025 · PDF · 555 KB",
    );
    expect(formatDownloadMeta({ note: "inkl. Datenschutzhinweisen" }, 183 * 1024)).toBe(
      "inkl. Datenschutzhinweisen · PDF · 183 KB",
    );
  });
});
