import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import {
  entryTransferError,
  type ContentListEntry,
  type ContentSection,
} from "../../src/admin/content-sections";

type Target = { section: ContentSection; node: HTMLElement };
type Hover = { key: string; index: number; top: number; error: string | null; label: string };
type Gesture = { source: ContentSection; entry: ContentListEntry };
type Transfer = (
  source: ContentSection,
  target: ContentSection,
  key: string,
  index: number,
) => void;
type Board = {
  targets: Map<string, Target>;
  dragging: Gesture | null;
  hover: Hover | null;
  begin: (source: ContentSection, entry: ContentListEntry) => void;
  over: (x: number, y: number) => boolean;
  drop: (x: number, y: number) => boolean;
  cancel: () => void;
};
const Context = createContext<Board | null>(null);

/** Coordinates compatible people lists without converting team records into council records. */
export function PeopleTransferProvider({
  disabled,
  onTransfer,
  children,
}: {
  disabled: boolean;
  onTransfer: Transfer;
  children: ReactNode;
}) {
  const targets = useRef(new Map<string, Target>());
  const gesture = useRef<Gesture | null>(null);
  const latest = useRef({ disabled, onTransfer });
  latest.current = { disabled, onTransfer };
  const [dragging, setDragging] = useState<Gesture | null>(null);
  const [hover, setHover] = useState<Hover | null>(null);
  function locate(x: number, y: number): { target: Target; hover: Hover } | null {
    const current = gesture.current;
    if (!current) return null;
    for (const target of targets.current.values()) {
      const bounds = target.node.getBoundingClientRect();
      if (x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom) continue;
      if (target.section.key === current.source.key) return null;
      const rows = Array.from(target.node.querySelectorAll<HTMLElement>(":scope > .record-item"));
      let index = rows.findIndex((node) => {
        const rect = node.getBoundingClientRect();
        return y < rect.top + rect.height / 2;
      });
      if (index < 0) index = rows.length;
      const top =
        index < rows.length
          ? rows[index].getBoundingClientRect().top - bounds.top
          : rows.length
            ? rows[rows.length - 1].getBoundingClientRect().bottom - bounds.top
            : bounds.height / 2;
      return {
        target,
        hover: {
          key: target.section.key,
          index,
          top,
          error: entryTransferError(current.entry, target.section),
          label: target.section.label,
        },
      };
    }
    return null;
  }
  function over(x: number, y: number) {
    const current = gesture.current;
    if (!current) return false;
    const found = locate(x, y);
    const next = found?.hover ?? null;
    setHover((previous) =>
      previous?.key === next?.key &&
      previous?.index === next?.index &&
      previous?.top === next?.top &&
      previous?.error === next?.error
        ? previous
        : next,
    );
    const source = targets.current.get(current.source.key)?.node.getBoundingClientRect();
    return !source || x < source.left || x > source.right || y < source.top || y > source.bottom;
  }
  function cancel() {
    gesture.current = null;
    setDragging(null);
    setHover(null);
  }
  return (
    <Context.Provider
      value={{
        targets: targets.current,
        dragging,
        hover,
        begin: (source, entry) => {
          if (latest.current.disabled) return;
          gesture.current = { source, entry };
          setDragging(gesture.current);
        },
        over,
        drop: (x, y) => {
          const current = gesture.current;
          if (!current) return false;
          const found = locate(x, y);
          if (found && !found.hover.error && !latest.current.disabled)
            latest.current.onTransfer(
              current.source,
              found.target.section,
              current.entry.key,
              found.hover.index,
            );
          return found !== null;
        },
        cancel,
      }}
    >
      {children}
      <p className="visually-hidden" role="status">
        {hover
          ? (hover.error ??
            `${dragging?.entry.record.data.name}: ${hover.label}, Position ${hover.index + 1}. Zum Verschieben loslassen.`)
          : ""}
      </p>
    </Context.Provider>
  );
}

export function usePeopleTransfer(section?: ContentSection) {
  const board = useContext(Context);
  if (!section || !board) return null;
  const hover = board.hover?.key === section.key ? board.hover : null;
  const isOther = !!board.dragging && board.dragging.source.key !== section.key;
  const error = isOther ? entryTransferError(board.dragging!.entry, section) : null;
  return {
    register(node: HTMLElement | null) {
      if (node) board.targets.set(section.key, { section, node });
      else board.targets.delete(section.key);
    },
    className: ` people-drop-target${isOther && !error ? " people-drop-available" : ""}${hover ? (hover.error ? " people-drop-rejected" : " people-drop-active") : ""}`,
    indicator: hover ? (
      <div
        className={`people-drop-indicator${hover.error ? " rejected" : ""}`}
        style={{ top: hover.top }}
        aria-hidden="true"
      >
        <span>{hover.error ?? "Hier einordnen"}</span>
      </div>
    ) : null,
    gesture: {
      begin: (index: number) => board.begin(section, section.entries[index]),
      over: board.over,
      drop: board.drop,
      cancel: board.cancel,
    },
  };
}
