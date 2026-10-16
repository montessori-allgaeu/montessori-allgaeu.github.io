import { useRef, useState, type ReactNode } from "react";
import type { ContentListEntry, ContentSection } from "../../src/admin/content-sections";
import { titleOf } from "./overview";
import { reorder, useSortable } from "./useSortable";
import { usePeopleTransfer } from "./PeopleTransfer";

/** Collection ordering is shown immediately and persisted by the existing change API. */
export function SortableRecordList({
  entries,
  sortable = true,
  disabled,
  onMove,
  children,
  className = "record-list",
  itemClassName = "record-item",
  section,
}: {
  entries: ContentListEntry[];
  sortable?: boolean;
  disabled: boolean;
  onMove: (entries: ContentListEntry[], from: number, to: number) => Promise<boolean>;
  children: (entry: ContentListEntry) => ReactNode;
  className?: string;
  itemClassName?: string;
  section?: ContentSection;
}) {
  const committing = useRef(false);
  const [optimistic, setOptimistic] = useState<ContentListEntry[] | null>(null);
  const [message, setMessage] = useState("");
  const visible = optimistic ?? entries;
  const transfer = usePeopleTransfer(section);
  const sort = useSortable({
    keys: visible.map((entry) => entry.key),
    transfer: transfer?.gesture,
    disabled: disabled || optimistic !== null || !sortable,
    onMove: (from, to) => {
      void move(from, to);
    },
  });
  async function move(from: number, to: number) {
    if (disabled || committing.current) return;
    committing.current = true;
    setOptimistic(reorder(entries, from, to));
    const name = titleOf(entries[from].record.data);
    setMessage(`${name}: Position ${to + 1} von ${entries.length}. Wird gespeichert …`);
    try {
      const saved = await onMove(entries, from, to);
      setMessage(
        saved
          ? `${name}: neue Reihenfolge gespeichert.`
          : "Die Reihenfolge konnte nicht gespeichert werden. Die bisherige Reihenfolge wurde wiederhergestellt.",
      );
    } finally {
      setOptimistic(null);
      committing.current = false;
    }
  }
  return (
    <>
      <div
        ref={(node) => {
          sort.containerRef(node);
          transfer?.register(node);
        }}
        className={`${className}${transfer?.className ?? ""}`}
      >
        {section && !visible.length && (
          <p className="empty-state">Hier sind noch keine Einträge.</p>
        )}
        {transfer?.indicator}
        {visible.map((entry, index) => {
          const props = sort.itemProps(index);
          return (
            <article {...props} className={`${itemClassName} ${props.className}`} key={entry.key}>
              {children(entry)}
              {sortable && <button {...sort.handleProps(index, titleOf(entry.record.data))} />}
            </article>
          );
        })}
      </div>
      <p className="visually-hidden" role="status">
        {message}
      </p>
    </>
  );
}
