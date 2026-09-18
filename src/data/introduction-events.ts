interface IntroductionEvent {
  title: string;
  date: string;
  category: string;
  status: string;
}

export function getNextIntroductionEvent<T extends IntroductionEvent>(
  events: readonly T[],
  now = new Date(),
): T | undefined {
  const dateParts = new Intl.DateTimeFormat("en", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => dateParts.find((entry) => entry.type === type)!.value;
  const today = `${part("year")}-${part("month")}-${part("day")}`;

  return events
    .filter(
      (event) =>
        event.status === "published" &&
        (event.category === "Kennenlernen" || event.category === "Informationsabend") &&
        event.date >= today,
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title, "de"))[0];
}
