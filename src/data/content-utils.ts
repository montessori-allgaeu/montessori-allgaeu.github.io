export function formatGermanPhoneHref(phone: string): string {
  let compact = phone.trim().replace(/[^\d+]/g, "");

  if (compact.startsWith("00")) compact = `+${compact.slice(2)}`;
  if (compact.startsWith("+490")) return `+49${compact.slice(4)}`;
  if (compact.startsWith("+")) return compact;
  if (compact.startsWith("0")) return `+49${compact.slice(1)}`;

  return compact;
}

export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    const megabytes = bytes / (1024 * 1024);
    return `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(megabytes)} MB`;
  }

  return `${Math.round(bytes / 1024)} KB`;
}

export function formatDownloadMeta(
  input: { documentDate?: string; note?: string },
  bytes: number,
): string {
  return [
    input.documentDate ? `Stand ${input.documentDate}` : undefined,
    input.note,
    "PDF",
    formatFileSize(bytes),
  ]
    .filter(Boolean)
    .join(" · ");
}
