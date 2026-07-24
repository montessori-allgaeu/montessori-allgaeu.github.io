import { createHash } from "node:crypto";
import { join } from "node:path";
import type { ImageMetadata } from "astro";
import arbeiten from "./seo-pages/arbeiten-bei-uns";
import stellen from "./seo-pages/arbeiten-bei-uns-stellen";
import gemeinschaft from "./seo-pages/gemeinschaft";
import verein from "./seo-pages/gemeinschaft-traeger-verein";
import kindergartenSchule from "./seo-pages/kindergarten-schule";
import ganztag from "./seo-pages/kindergarten-schule-ganztag-verpflegung";
import kindergarten from "./seo-pages/kindergarten-schule-kindergarten";
import schule from "./seo-pages/kindergarten-schule-schule";
import kennenlernen from "./seo-pages/kennenlernen";
import aufnahmeKindergarten from "./seo-pages/kennenlernen-aufnahme-kindergarten";
import aufnahmeSchule from "./seo-pages/kennenlernen-aufnahme-schule";
import fragen from "./seo-pages/kennenlernen-haeufige-fragen";
import kosten from "./seo-pages/kennenlernen-kosten";
import kontakt from "./seo-pages/kontakt";
import montessori from "./seo-pages/montessori";
import spenden from "./seo-pages/spenden";
import home from "./seo-pages/startseite";
import termine from "./seo-pages/termine";

export type SocialImagePosition = "attention" | "centre" | "north" | "south" | "east" | "west";

// Bei Änderungen an Layout, Logo oder Schriften in social-card.ts erhöhen.
const socialCardTemplateVersion = "2";

export interface SeoPage {
  path: string;
  title: string;
  description: string;
  breadcrumbLabel: string;
  cardEyebrow: string;
  cardTitle: string;
  image: ImageMetadata;
  imageSourcePath: string;
  imageAlt: string;
  socialImagePosition: SocialImagePosition;
}

export interface SeoPageDefinition extends Omit<SeoPage, "imageSourcePath"> {
  imageFile: string;
}

export function createSeoPage(definition: SeoPageDefinition): SeoPage {
  const { imageFile, ...page } = definition;

  return {
    ...page,
    imageSourcePath: join(process.cwd(), "src/assets/images/editorial", imageFile),
  };
}

export const seoPages = {
  home: createSeoPage(home),
  montessori: createSeoPage(montessori),
  kindergartenSchule: createSeoPage(kindergartenSchule),
  kindergarten: createSeoPage(kindergarten),
  schule: createSeoPage(schule),
  ganztag: createSeoPage(ganztag),
  kennenlernen: createSeoPage(kennenlernen),
  aufnahmeKindergarten: createSeoPage(aufnahmeKindergarten),
  aufnahmeSchule: createSeoPage(aufnahmeSchule),
  fragen: createSeoPage(fragen),
  kosten: createSeoPage(kosten),
  arbeiten: createSeoPage(arbeiten),
  stellen: createSeoPage(stellen),
  gemeinschaft: createSeoPage(gemeinschaft),
  verein: createSeoPage(verein),
  spenden: createSeoPage(spenden),
  kontakt: createSeoPage(kontakt),
  termine: createSeoPage(termine),
} satisfies Record<string, SeoPage>;

export const staticSeoPages = Object.values(seoPages);

export function getSocialImageSlug(page: SeoPage) {
  const pathSlug =
    page.path === "/" ? "startseite" : page.path.replace(/^\/|\/$/g, "").replaceAll("/", "-");
  const version = createHash("sha256")
    .update(
      [
        socialCardTemplateVersion,
        page.image.src,
        page.socialImagePosition,
        page.cardEyebrow,
        page.cardTitle,
      ].join("|"),
    )
    .digest("hex")
    .slice(0, 10);

  return `${pathSlug}-${version}`;
}

export function getSeoLayoutProps(page: SeoPage) {
  return {
    title: page.title,
    description: page.description,
    breadcrumbLabel: page.breadcrumbLabel,
    image: `/social/${getSocialImageSlug(page)}.jpg`,
    imageAlt: `${page.imageAlt}. Social Card mit der Überschrift „${page.cardTitle}“.`,
    primaryImage: page.image.src,
    primaryImageAlt: page.imageAlt,
    primaryImageWidth: page.image.width,
    primaryImageHeight: page.image.height,
  };
}
