import { readFile } from "node:fs/promises";
import satori from "satori";
import sharp from "sharp";
import type { SeoPage } from "@/data/seo";
import { getSocialCardAssetPaths } from "./social-card-assets";

const width = 1200;
const height = 630;
const photoWidth = 650;
const contentWidth = width - photoWidth;

const { fonts, logo: logoPath } = getSocialCardAssetPaths();

const assetsPromise = Promise.all([
  readFile(fonts.unica),
  readFile(fonts.krubRegular),
  readFile(fonts.krubBold),
  readFile(logoPath),
]);

const toArrayBuffer = (buffer: Buffer) => Uint8Array.from(buffer).buffer;
const toDataUrl = (buffer: Buffer, mimeType: string) =>
  `data:${mimeType};base64,${buffer.toString("base64")}`;

function getTitleSize(title: string) {
  const longestUnbrokenPart = Math.max(...title.split(/[\s-]+/).map((part) => part.length));

  if (longestUnbrokenPart >= 22) return 42;
  if (longestUnbrokenPart >= 18) return 48;
  if (title.length <= 30) return 62;
  if (title.length <= 42) return 55;
  if (title.length <= 56) return 48;
  return 42;
}

export async function renderSocialCard(page: SeoPage) {
  const [unicaFont, krubRegularFont, krubBoldFont, logo] = await assetsPromise;
  const photo = await sharp(page.imageSourcePath)
    .rotate()
    .resize(photoWidth, height, {
      fit: "cover",
      position: page.socialImagePosition,
    })
    .jpeg({ quality: 90, chromaSubsampling: "4:4:4" })
    .toBuffer();

  const svg = await satori(
    {
      type: "div",
      props: {
        style: {
          display: "flex",
          width,
          height,
          background: "#f5f1ec",
        },
        children: [
          {
            type: "img",
            props: {
              src: toDataUrl(photo, "image/jpeg"),
              width: photoWidth,
              height,
              style: {
                display: "flex",
                width: photoWidth,
                height,
                objectFit: "cover",
              },
            },
          },
          {
            type: "div",
            props: {
              style: {
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                width: contentWidth,
                height,
                padding: "58px 54px 54px",
                borderLeft: "12px solid #b85b2d",
                background: "#f5f1ec",
              },
              children: [
                {
                  type: "img",
                  props: {
                    src: toDataUrl(logo, "image/png"),
                    width: 420,
                    height: 89,
                    style: {
                      width: 420,
                      height: 89,
                      objectFit: "contain",
                    },
                  },
                },
                {
                  type: "div",
                  props: {
                    style: {
                      display: "flex",
                      flexDirection: "column",
                    },
                    children: [
                      {
                        type: "div",
                        props: {
                          style: {
                            display: "flex",
                            marginBottom: 21,
                            color: "#98431c",
                            fontFamily: "Krub",
                            fontSize: 18,
                            fontWeight: 700,
                            letterSpacing: "0.08em",
                          },
                          children: page.cardEyebrow,
                        },
                      },
                      {
                        type: "div",
                        props: {
                          style: {
                            display: "flex",
                            color: "#1d2b1e",
                            fontFamily: "Unica One",
                            fontSize: getTitleSize(page.cardTitle),
                            fontWeight: 400,
                            letterSpacing: "-0.015em",
                            lineHeight: 0.98,
                          },
                          children: page.cardTitle,
                        },
                      },
                    ],
                  },
                },
                {
                  type: "div",
                  props: {
                    style: {
                      display: "flex",
                      color: "#3a4638",
                      fontFamily: "Krub",
                      fontSize: 18,
                      fontWeight: 400,
                      letterSpacing: "0.02em",
                    },
                    children: "montessori-allgaeu.de",
                  },
                },
              ],
            },
          },
        ],
      },
    },
    {
      width,
      height,
      fonts: [
        { name: "Unica One", data: toArrayBuffer(unicaFont), weight: 400, style: "normal" },
        { name: "Krub", data: toArrayBuffer(krubRegularFont), weight: 400, style: "normal" },
        { name: "Krub", data: toArrayBuffer(krubBoldFont), weight: 700, style: "normal" },
      ],
    },
  );

  return sharp(Buffer.from(svg)).jpeg({ quality: 90, chromaSubsampling: "4:4:4" }).toBuffer();
}
