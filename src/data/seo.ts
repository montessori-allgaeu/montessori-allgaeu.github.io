import { createHash } from "node:crypto";
import { join } from "node:path";
import type { ImageMetadata } from "astro";
import { getSocialCardTemplateFingerprint } from "./social-card-fingerprint";
import arbeiten from "./seo-pages/arbeiten-bei-uns";
import stellen from "./seo-pages/arbeiten-bei-uns-stellen";
import datenschutz from "./seo-pages/datenschutz";
import downloads from "./seo-pages/downloads";
import gemeinschaft from "./seo-pages/gemeinschaft";
import elternbeirat from "./seo-pages/gemeinschaft-elternbeirat";
import geschichte from "./seo-pages/gemeinschaft-geschichte";
import prinzipien from "./seo-pages/gemeinschaft-prinzipien";
import team from "./seo-pages/gemeinschaft-team";
import verein from "./seo-pages/gemeinschaft-traeger-verein";
import impressum from "./seo-pages/impressum";
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
  imageSourceFile: string;
}

export function createSeoPage(definition: SeoPageDefinition): SeoPage {
  const { imageSourceFile, ...page } = definition;

  return {
    ...page,
    imageSourcePath: join(process.cwd(), "src/assets/images", imageSourceFile),
  };
}

export const seoPages = {
  home: createSeoPage(home),
  datenschutz: createSeoPage(datenschutz),
  downloads: createSeoPage(downloads),
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
  elternbeirat: createSeoPage(elternbeirat),
  geschichte: createSeoPage(geschichte),
  prinzipien: createSeoPage(prinzipien),
  team: createSeoPage(team),
  verein: createSeoPage(verein),
  impressum: createSeoPage(impressum),
  spenden: createSeoPage(spenden),
  kontakt: createSeoPage(kontakt),
  termine: createSeoPage(termine),
} satisfies Record<string, SeoPage>;

export const staticSeoPages = Object.values(seoPages);

export function createSocialImageSlug(page: SeoPage, templateFingerprint: string) {
  const pathSlug =
    page.path === "/" ? "startseite" : page.path.replace(/^\/|\/$/g, "").replaceAll("/", "-");
  const version = createHash("sha256")
    .update(
      JSON.stringify({
        templateFingerprint,
        image: page.image.src,
        imagePosition: page.socialImagePosition,
        eyebrow: page.cardEyebrow,
        title: page.cardTitle,
      }),
    )
    .digest("hex")
    .slice(0, 10);

  return `${pathSlug}-${version}`;
}

export function getSocialImageSlug(page: SeoPage) {
  return createSocialImageSlug(page, getSocialCardTemplateFingerprint());
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
