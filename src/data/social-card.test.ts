import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { seoPages } from "./seo";
import { renderSocialCard } from "./social-card";

describe("generated social cards", () => {
  it("renders a shareable JPEG in the recommended dimensions", async () => {
    const card = await renderSocialCard(seoPages.schule);
    const metadata = await sharp(card).metadata();

    expect(metadata.format).toBe("jpeg");
    expect(metadata.width).toBe(1200);
    expect(metadata.height).toBe(630);
  });

  it("keeps long unbroken titles inside the text area", async () => {
    const card = await renderSocialCard({
      ...seoPages.stellen,
      cardTitle: "Bundesfreiwilligendienst",
    });
    const { data, info } = await sharp(card)
      .extract({ left: 1160, top: 330, width: 40, height: 100 })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let darkPixelCount = 0;

    for (let index = 0; index < data.length; index += info.channels) {
      if (data[index] < 80 && data[index + 1] < 100 && data[index + 2] < 80) {
        darkPixelCount += 1;
      }
    }

    expect(darkPixelCount).toBe(0);
  });
});
