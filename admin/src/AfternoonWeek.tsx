import { getContentDefinition } from "../../src/admin/content-model";
import type { ContentListEntry } from "../../src/admin/content-sections";
import type { ContentRecord } from "../../src/admin/types";
import { recordKey, titleOf } from "./overview";
import { SortableRecordList } from "./SortableRecordList";
import "./afternoon-week.css";

const weekdays = getContentDefinition("afternoonOffers").fields.find(
  (field) => field.key === "weekday",
)!.options!;

export function AfternoonWeek({
  records,
  disabled,
  onOpen,
  onAdd,
  onMove,
  statuses,
}: {
  records: ContentRecord[];
  disabled: boolean;
  onOpen: (record: ContentRecord) => void;
  onAdd: (weekday: string) => void;
  onMove: (entries: ContentListEntry[], from: number, to: number) => Promise<boolean>;
  statuses: Record<string, string>;
}) {
  return (
    <section className="afternoon-week" aria-label="Nachmittagsangebote nach Wochentag">
      <div className="section-heading">
        <h2>
          Nachmittagsangebote <span className="subtle count">{records.length}</span>
        </h2>
      </div>
      <p className="hint">
        Angebot öffnen, um Inhalt oder Wochentag zu ändern. Am Griff innerhalb eines Tages
        verschieben. Die Reihenfolge wird direkt gespeichert.
      </p>
      <div className="week-days">
        {weekdays.map(({ value: weekday, label }) => {
          const entries = records
            .filter((record) => record.data.weekday === weekday)
            .sort(
              (a, b) =>
                Number(a.data.position) - Number(b.data.position) ||
                titleOf(a.data).localeCompare(titleOf(b.data), "de"),
            )
            .map((record) => ({
              record,
              key: recordKey(record),
              position: Number(record.data.position),
            }));
          return (
            <section className="week-day" key={weekday} aria-label={label}>
              <h3>{label}</h3>
              {entries.length === 0 && <p className="hint">Noch keine Angebote</p>}
              <SortableRecordList
                entries={entries}
                disabled={disabled}
                onMove={onMove}
                className="week-offers"
                itemClassName="week-offer"
              >
                {({ record, key }) => (
                  <>
                    <button
                      type="button"
                      className="week-offer-open"
                      onClick={() => onOpen(record)}
                    >
                      <strong>{titleOf(record.data)}</strong>
                      <span>
                        {record.data.gradeFrom === record.data.gradeTo
                          ? `Klasse ${record.data.gradeFrom}`
                          : `Klasse ${record.data.gradeFrom}–${record.data.gradeTo}`}
                      </span>
                      {statuses[key] && <small>{statuses[key]}</small>}
                    </button>
                  </>
                )}
              </SortableRecordList>
              <button
                type="button"
                className="text-button week-add"
                onClick={() => onAdd(weekday)}
                aria-label={`Angebot für ${label} hinzufügen`}
              >
                + Angebot
              </button>
            </section>
          );
        })}
      </div>
    </section>
  );
}
