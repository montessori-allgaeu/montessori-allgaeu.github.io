import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { ContentListEntry } from "../../src/admin/content-sections";
import { titleOf } from "./overview";

type Drag = {
  key: string;
  order: string;
  from: number;
  to: number;
  startY: number;
  clientX: number;
  clientY: number;
  offset: number;
  active: boolean;
  bounds: { top: number; height: number }[];
};

function moved<T>(items: T[], from: number, to: number) {
  const result = [...items];
  const [item] = result.splice(from, 1);
  result.splice(to, 0, item);
  return result;
}

/** Ordering stays local until drop; only the existing mutation path persists it. */
export function SortableRecordList({
  entries,
  sorting,
  disabled,
  onMove,
  children,
}: {
  entries: ContentListEntry[];
  sorting: boolean;
  disabled: boolean;
  onMove: (entries: ContentListEntry[], from: number, to: number) => Promise<boolean>;
  children: (entry: ContentListEntry) => ReactNode;
}) {
  const list = useRef<HTMLDivElement>(null);
  const nodes = useRef(new Map<string, HTMLElement>());
  const positions = useRef(new Map<string, number>());
  const committing = useRef(false);
  const scrollFrame = useRef(0);
  const [optimistic, setOptimistic] = useState<ContentListEntry[] | null>(null);
  const [dragState, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const [message, setMessage] = useState("");
  const visible = optimistic ?? entries;
  const order = visible.map((entry) => entry.key).join("|");
  const locked = disabled || optimistic !== null;
  const drag = dragState?.order === order && sorting && !locked ? dragState : null;

  function capturePositions() {
    positions.current = new Map(
      Array.from(nodes.current, ([key, node]) => [
        key,
        node.getBoundingClientRect().top + window.scrollY,
      ]),
    );
  }

  useLayoutEffect(() => {
    const previous = positions.current;
    const next = new Map<string, number>();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    for (const [key, node] of nodes.current) {
      node.getAnimations().forEach((animation) => animation.cancel());
      const top = node.getBoundingClientRect().top + window.scrollY;
      next.set(key, top);
      const old = previous.get(key);
      if (!reduced && old !== undefined && old !== top)
        node.animate(
          [{ transform: `translateY(${old - top}px)` }, { transform: "translateY(0)" }],
          { duration: 160, easing: "ease-out" },
        );
    }
    positions.current = next;
  }, [order]);

  useEffect(() => () => cancelAnimationFrame(scrollFrame.current), []);

  function cancelDrag() {
    cancelAnimationFrame(scrollFrame.current);
    dragRef.current = null;
    setDrag(null);
  }

  function updateDrag(clientX: number, clientY: number) {
    const current = dragRef.current;
    if (!current || current.order !== order || locked || !sorting) {
      cancelDrag();
      return;
    }
    const y = clientY + window.scrollY;
    const offset = y - current.startY;
    const active = current.active || Math.abs(offset) >= 5;
    const to = current.bounds.reduce(
      (closest, bounds, index) =>
        Math.abs(y - bounds.top - bounds.height / 2) <
        Math.abs(y - current.bounds[closest].top - current.bounds[closest].height / 2)
          ? index
          : closest,
      0,
    );
    dragRef.current = { ...current, to, clientX, clientY, offset, active };
    if (active) setDrag(dragRef.current);
  }

  function scrollWhileDragging() {
    const current = dragRef.current;
    if (!current?.active) return;
    const speed = current.clientY < 90 ? -10 : current.clientY > window.innerHeight - 60 ? 10 : 0;
    if (speed) {
      const before = window.scrollY;
      window.scrollBy(0, speed);
      if (window.scrollY !== before) updateDrag(current.clientX, current.clientY);
    }
    scrollFrame.current = requestAnimationFrame(scrollWhileDragging);
  }

  async function move(from: number, to: number) {
    if (locked || committing.current || from === to || to < 0 || to >= entries.length) return;
    committing.current = true;
    capturePositions();
    setOptimistic(moved(entries, from, to));
    const name = titleOf(entries[from].record.data);
    setMessage(`${name}: Position ${to + 1} von ${entries.length}. Wird gespeichert …`);
    try {
      const saved = await onMove(entries, from, to);
      capturePositions();
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

  // Keep the DOM stable during a gesture; move neighbouring rows into the target order.
  const shifted = drag ? moved(visible, drag.from, drag.to) : visible;
  let top = drag?.bounds[0]?.top ?? 0;
  let dropTop = 0;
  const offsets = new Map<string, number>();
  for (const entry of shifted) {
    const index = visible.findIndex((item) => item.key === entry.key);
    if (drag) {
      offsets.set(entry.key, top - drag.bounds[index].top);
      if (entry.key === drag.key) dropTop = top - drag.bounds[0].top;
      top += drag.bounds[index].height;
    }
  }

  return (
    <>
      <div ref={list} className={`record-list${drag ? " record-list-dragging" : ""}`}>
        {drag && (
          <div
            className="record-drop-slot"
            aria-hidden="true"
            style={{ top: dropTop, height: drag.bounds[drag.from].height }}
          />
        )}
        {visible.map((entry, index) => {
          const name = titleOf(entry.record.data);
          return (
            <article
              className={`record-item${drag?.key === entry.key ? " record-item-dragged" : ""}`}
              key={entry.key}
              ref={(node) => {
                if (node) nodes.current.set(entry.key, node);
                else nodes.current.delete(entry.key);
              }}
              style={
                drag
                  ? {
                      transform: `translateY(${drag.key === entry.key ? drag.offset : (offsets.get(entry.key) ?? 0)}px)`,
                    }
                  : undefined
              }
            >
              {children(entry)}
              {sorting && (
                <div className="sort-controls">
                  <button
                    type="button"
                    className="drag-handle"
                    disabled={locked}
                    title="Zum Verschieben ziehen"
                    aria-label={`${name} ziehen`}
                    onPointerDown={(event) => {
                      if (locked || event.button !== 0 || !event.isPrimary) return;
                      event.currentTarget.setPointerCapture(event.pointerId);
                      dragRef.current = {
                        key: entry.key,
                        order,
                        from: index,
                        to: index,
                        startY: event.clientY + window.scrollY,
                        clientX: event.clientX,
                        clientY: event.clientY,
                        offset: 0,
                        active: false,
                        bounds: visible.map((item) => {
                          const bounds = nodes.current.get(item.key)!.getBoundingClientRect();
                          return { top: bounds.top + window.scrollY, height: bounds.height };
                        }),
                      };
                    }}
                    onPointerMove={(event) => {
                      if (!dragRef.current) return;
                      const wasActive = dragRef.current.active;
                      updateDrag(event.clientX, event.clientY);
                      if (!wasActive && dragRef.current?.active)
                        scrollFrame.current = requestAnimationFrame(scrollWhileDragging);
                    }}
                    onPointerUp={(event) => {
                      const current = dragRef.current;
                      const bounds = list.current!.getBoundingClientRect();
                      if (
                        current?.active &&
                        current.order === order &&
                        event.clientX >= bounds.left &&
                        event.clientX <= bounds.right &&
                        event.clientY >= bounds.top &&
                        event.clientY <= bounds.bottom
                      )
                        void move(current.from, current.to);
                      cancelDrag();
                      event.currentTarget.releasePointerCapture(event.pointerId);
                    }}
                    onPointerCancel={cancelDrag}
                    onLostPointerCapture={cancelDrag}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") cancelDrag();
                    }}
                    onClick={(event) => event.preventDefault()}
                  >
                    ⋮⋮
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    disabled={locked || index === 0}
                    aria-label={`${name} nach oben`}
                    onClick={() => void move(index, index - 1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    disabled={locked || index === visible.length - 1}
                    aria-label={`${name} nach unten`}
                    onClick={() => void move(index, index + 1)}
                  >
                    ↓
                  </button>
                </div>
              )}
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
