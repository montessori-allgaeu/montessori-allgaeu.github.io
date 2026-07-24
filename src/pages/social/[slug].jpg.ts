import type { APIRoute, GetStaticPaths } from "astro";
import { getJobs } from "@/data/content";
import { createJobSeo } from "@/data/job-seo";
import { getSocialImageSlug, staticSeoPages, type SeoPage } from "@/data/seo";
import { renderSocialCard } from "@/data/social-card";

export const prerender = true;

export const getStaticPaths: GetStaticPaths = async () => {
  const jobs = await getJobs();
  const pages = [...staticSeoPages, ...jobs.map(createJobSeo)];

  return pages.map((page) => ({
    params: { slug: getSocialImageSlug(page) },
    props: { page },
  }));
};

export const GET: APIRoute = async ({ props }) => {
  const page = props.page as SeoPage;
  const image = await renderSocialCard(page);

  return new Response(new Uint8Array(image), {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
};
