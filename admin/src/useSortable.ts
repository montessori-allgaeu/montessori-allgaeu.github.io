import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
} from "react";

type Bounds = { left: number; top: number; width: number; height: number };
type Drag = {
  order: string;
  from: number;
  to: number;
  startX: number;
  startY: number;
  clientX: number;
  clientY: number;
  dx: number;
  dy: number;
  active: boolean;
  grid: boolean;
  bounds: Bounds[];
};

export function reorder<T>(items: T[], from: number, to: number): T[] {
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** One gesture implementation for collection rows, table rows and editable lists. */
export function useSortable({
  keys,
  disabled,
  onMove,
}: {
  keys: string[];
  disabled: boolean;
  onMove: (from: number, to: number) => void;
}) {
  const containerRef = useRef<HTMLElement>(null);
  const nodes = useRef(new Map<string, HTMLElement>());
  const positions = useRef(new Map<string, Bounds>());
  const frame = useRef(0);
  const dragRef = useRef<Drag | null>(null);
  const [dragState, setDrag] = useState<Drag | null>(null);
  const order = JSON.stringify(keys);
  const latest = useRef({ order, disabled });
  latest.current = { order, disabled };
  const drag = dragState?.order === order && !disabled ? dragState : null;

  function boundsOf(node: HTMLElement): Bounds {
    const rect = node.getBoundingClientRect();
    return {
      left: rect.left + window.scrollX,
      top: rect.top + window.scrollY,
      width: rect.width,
      height: rect.height,
    };
  }
  function capture() {
    positions.current = new Map(Array.from(nodes.current, ([key, node]) => [key, boundsOf(node)]));
  }
  useLayoutEffect(() => {
    const previous = positions.current;
    const next = new Map<string, Bounds>();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    for (const [key, node] of nodes.current) {
      node.getAnimations().forEach((animation) => animation.cancel());
      const bounds = boundsOf(node);
      next.set(key, bounds);
      const old = previous.get(key);
      if (!reduced && old && (old.top !== bounds.top || old.left !== bounds.left))
        node.animate(
          [
            { transform: `translate(${old.left - bounds.left}px, ${old.top - bounds.top}px)` },
            { transform: "translate(0, 0)" },
          ],
          { duration: 160, easing: "ease-out" },
        );
    }
    positions.current = next;
  }, [order]);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  function cancel() {
    cancelAnimationFrame(frame.current);
    dragRef.current = null;
    setDrag(null);
  }
  function update(clientX: number, clientY: number) {
    const current = dragRef.current;
    if (!current || latest.current.disabled || latest.current.order !== current.order) {
      cancel();
      return;
    }
    const dx = current.grid ? clientX + window.scrollX - current.startX : 0;
    const dy = clientY + window.scrollY - current.startY;
    const active = current.active || Math.hypot(dx, dy) >= 5;
    const source = current.bounds[current.from];
    const x = source.left + source.width / 2 + dx;
    const y = source.top + source.height / 2 + dy;
    const distance = (bounds: Bounds) =>
      Math.hypot(
        current.grid ? x - bounds.left - bounds.width / 2 : 0,
        y - bounds.top - bounds.height / 2,
      );
    const to = current.bounds.reduce(
      (closest, bounds, index) =>
        distance(bounds) < distance(current.bounds[closest]) ? index : closest,
      0,
    );
    dragRef.current = { ...current, dx, dy, clientX, clientY, active, to };
    if (active) setDrag(dragRef.current);
  }
  function autoScroll() {
    const current = dragRef.current;
    if (!current?.active) return;
    if (latest.current.disabled || current.order !== latest.current.order) {
      cancel();
      return;
    }
    const speed = current.clientY < 90 ? -10 : current.clientY > window.innerHeight - 60 ? 10 : 0;
    if (speed) {
      const before = window.scrollY;
      window.scrollBy(0, speed);
      if (window.scrollY !== before) update(current.clientX, current.clientY);
    }
    frame.current = requestAnimationFrame(autoScroll);
  }
  function move(from: number, to: number) {
    if (disabled || from === to || to < 0 || to >= keys.length) return;
    capture();
    onMove(from, to);
  }

  const offsets = new Map<number, { x: number; y: number }>();
  if (drag) {
    const shifted = reorder(
      keys.map((_, index) => index),
      drag.from,
      drag.to,
    );
    let top = drag.bounds[0].top;
    shifted.forEach((original, target) => {
      const bounds = drag.bounds[original];
      const slot = drag.bounds[target];
      offsets.set(original, {
        x: drag.grid ? slot.left - bounds.left : 0,
        y: drag.grid ? slot.top - bounds.top : top - bounds.top,
      });
      const gap =
        target < drag.bounds.length - 1 ? drag.bounds[target + 1].top - slot.top - slot.height : 0;
      top += bounds.height + gap;
    });
  }

  function itemProps(index: number) {
    const offset = offsets.get(index);
    const style: CSSProperties | undefined = drag
      ? {
          transform: `translate(${drag.from === index ? drag.dx : offset!.x}px, ${drag.from === index ? drag.dy : offset!.y}px)`,
        }
      : undefined;
    return {
      ref: (node: HTMLElement | null) => {
        if (node) nodes.current.set(keys[index], node);
        else nodes.current.delete(keys[index]);
      },
      className: `sortable-item${drag ? " sortable-moving" : ""}${drag?.from === index ? " sortable-dragged" : ""}`,
      style,
    };
  }
  function handleProps(index: number, label: string): ButtonHTMLAttributes<HTMLButtonElement> {
    return {
      type: "button",
      className: "drag-handle",
      children: "⋮⋮",
      disabled: disabled || keys.length < 2,
      "aria-label": `${label} ziehen`,
      title: "Zum Verschieben ziehen. Tastatur: Alt + Pfeil nach oben oder unten.",
      onPointerDown: (event) => {
        if (disabled || keys.length < 2 || event.button !== 0 || !event.isPrimary) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        const bounds = keys.map((key) => {
          const node = nodes.current.get(key)!;
          node.getAnimations().forEach((animation) => animation.cancel());
          return boundsOf(node);
        });
        dragRef.current = {
          order,
          from: index,
          to: index,
          startX: event.clientX + window.scrollX,
          startY: event.clientY + window.scrollY,
          clientX: event.clientX,
          clientY: event.clientY,
          dx: 0,
          dy: 0,
          active: false,
          grid: bounds.some((rect) => Math.abs(rect.left - bounds[0].left) > 10),
          bounds,
        };
      },
      onPointerMove: (event) => {
        if (!dragRef.current) return;
        const wasActive = dragRef.current.active;
        update(event.clientX, event.clientY);
        if (!wasActive && dragRef.current?.active)
          frame.current = requestAnimationFrame(autoScroll);
      },
      onPointerUp: (event) => {
        const current = dragRef.current;
        const bounds = containerRef.current!.getBoundingClientRect();
        if (
          current?.active &&
          current.order === order &&
          event.clientX >= bounds.left &&
          event.clientX <= bounds.right &&
          event.clientY >= bounds.top &&
          event.clientY <= bounds.bottom
        )
          move(current.from, current.to);
        cancel();
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
      },
      onPointerCancel: cancel,
      onLostPointerCapture: cancel,
      onKeyDown: (event) => {
        if (event.key === "Escape") cancel();
        if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
          event.preventDefault();
          cancel();
          move(index, index + (event.key === "ArrowUp" ? -1 : 1));
        }
      },
      onClick: (event) => event.preventDefault(),
    };
  }
  return {
    containerRef: (node: HTMLElement | null) => {
      containerRef.current = node;
    },
    itemProps,
    handleProps,
  };
}
