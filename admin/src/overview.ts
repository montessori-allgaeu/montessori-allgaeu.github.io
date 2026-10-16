import type { Change, ContentData, ContentMutation, ContentRecord } from "../../src/admin/types";

export const recordKey = (record: { collection: string; id: string }) =>
  `${record.collection}:${record.id}`;
export const titleOf = (data: ContentData, fallback = "Neuer Eintrag") =>
  String(data.title || data.name || fallback);
export const today = (now = new Date()) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(now);

export function eventDate(date: string, now = new Date()) {
  if (date === today(now)) return "Heute";
  return new Intl.DateTimeFormat("de-DE", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

export function nextEvents(records: ContentRecord[], now = new Date()) {
  return records
    .filter((record) => record.collection === "events" && String(record.data.date) >= today(now))
    .sort(
      (a, b) =>
        String(a.data.date).localeCompare(String(b.data.date)) ||
        titleOf(a.data).localeCompare(titleOf(b.data), "de"),
    )
    .slice(0, 4);
}

export function recentContent(records: ContentRecord[], changes: Change[]) {
  const byKey = new Map(records.map((record) => [recordKey(record), record]));
  const seen = new Set<string>();
  const recent = new Map<
    string,
    { record: ContentRecord; change: Change; mutation?: ContentMutation }
  >();
  for (const change of [...changes].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
    for (const target of change.targets ?? change.saved?.mutations ?? []) {
      const key = recordKey(target);
      if (seen.has(key)) continue;
      seen.add(key);
      const mutation = change.saved?.mutations.find((item) => recordKey(item) === key);
      if (mutation?.delete || change.deleted) continue;
      const record =
        byKey.get(key) ?? (mutation && { ...mutation, version: mutation.baseVersion ?? "" });
      if (record) recent.set(key, { record, change, mutation });
    }
  }
  return [...recent.values()].slice(0, 5);
}

export function eventTemplates(records: ContentRecord[], title: string) {
  const candidates = records
    .filter((record) => record.collection === "events")
    .sort((a, b) => String(b.data.date).localeCompare(String(a.data.date)));
  const unique = new Map<string, ContentRecord>();
  for (const record of candidates)
    if (!unique.has(titleOf(record.data))) unique.set(titleOf(record.data), record);
  const query = title.trim().toLocaleLowerCase("de-DE");
  return [...unique.values()]
    .filter((record) => !query || titleOf(record.data).toLocaleLowerCase("de-DE").includes(query))
    .slice(0, 5);
}
