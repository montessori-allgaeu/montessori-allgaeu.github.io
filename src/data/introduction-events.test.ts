import { describe, expect, it } from "vitest";
import { getNextIntroductionEvent } from "./introduction-events";

const openDay = {
  title: "Tag der offenen Tür",
  date: "2026-11-15",
  category: "Kennenlernen",
  status: "published",
};
const infoEvening = {
  ...openDay,
  title: "Infoabend",
  date: "2026-11-20",
  category: "Informationsabend",
};

describe("next introduction event", () => {
  it("selects the earliest published introduction event without changing the source order", () => {
    const events = [
      infoEvening,
      { ...openDay, date: "2026-11-01", status: "draft" },
      { ...openDay, date: "2026-11-02", category: "Monte-Gemeinschaft & Freunde" },
      { ...openDay, date: "2026-09-01" },
      openDay,
    ];
    const sourceOrder = [...events];
    expect(getNextIntroductionEvent(events, new Date("2026-09-18T10:00:00Z"))).toBe(openDay);
    expect(events).toEqual(sourceOrder);
  });

  it("keeps today's event until midnight in Berlin, then selects the following event", () => {
    const events = [openDay, infoEvening];
    expect(getNextIntroductionEvent(events, new Date("2026-11-15T22:59:59Z"))).toBe(openDay);
    expect(getNextIntroductionEvent(events, new Date("2026-11-15T23:00:00Z"))).toBe(infoEvening);
  });

  it("uses Berlin's summer time and handles year boundaries", () => {
    const summerEvent = { ...openDay, date: "2026-07-10" };
    expect(getNextIntroductionEvent([summerEvent], new Date("2026-07-10T21:59:59Z"))).toBe(
      summerEvent,
    );
    expect(
      getNextIntroductionEvent([summerEvent], new Date("2026-07-10T22:00:00Z")),
    ).toBeUndefined();
    const yearEnd = { ...openDay, date: "2026-12-31" };
    expect(getNextIntroductionEvent([yearEnd], new Date("2026-12-31T23:00:00Z"))).toBeUndefined();
  });

  it("breaks same-day ties alphabetically by title", () => {
    const sameDayInfo = { ...infoEvening, date: openDay.date };
    expect(getNextIntroductionEvent([openDay, sameDayInfo], new Date("2026-11-15T12:00:00Z"))).toBe(
      sameDayInfo,
    );
  });

  it("returns no event when none is eligible", () => {
    expect(getNextIntroductionEvent([], new Date("2026-11-15T12:00:00Z"))).toBeUndefined();
    expect(getNextIntroductionEvent([openDay], new Date("2026-11-16T12:00:00Z"))).toBeUndefined();
    expect(
      getNextIntroductionEvent([{ ...openDay, status: "draft" }], new Date("2026-11-01T12:00:00Z")),
    ).toBeUndefined();
  });
});
