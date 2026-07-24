import { footerNavigation, mainNavigation, supportLink } from "./site";

export interface BreadcrumbItem {
  href: string;
  name: string;
}

const pageLabels = new Map<string, string>([
  ...footerNavigation.flatMap((group) =>
    group.links.map((link) => [link.href, link.label] as const),
  ),
  ...mainNavigation.flatMap((item) => [
    [item.href, item.label] as const,
    ...item.children.map((child) => [child.href, child.label] as const),
  ]),
  [supportLink.href, supportLink.label],
  ["/gemeinschaft/prinzipien/", "Unsere Prinzipien"],
  ["/impressum/", "Impressum"],
  ["/datenschutz/", "Datenschutz"],
]);

const fallbackLabel = (segment: string) => {
  const decoded = decodeURIComponent(segment).replaceAll("-", " ");
  return decoded.charAt(0).toLocaleUpperCase("de-DE") + decoded.slice(1);
};

export const getBreadcrumbItems = (pathname: string, currentTitle: string): BreadcrumbItem[] => {
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length === 0) {
    return [];
  }

  return [
    { href: "/", name: "Startseite" },
    ...segments.map((segment, index) => {
      const href = `/${segments.slice(0, index + 1).join("/")}/`;
      const isCurrentPage = index === segments.length - 1;

      return {
        href,
        name: pageLabels.get(href) ?? (isCurrentPage ? currentTitle : fallbackLabel(segment)),
      };
    }),
  ];
};
