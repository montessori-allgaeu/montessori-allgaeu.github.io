import { useLayoutEffect, useRef } from "react";

export function InlineText({
  label,
  value,
  onChange,
  disabled,
  className = "job-inline-text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const input = ref.current!;
    const resize = () => {
      input.style.height = "0px";
      input.style.height = `${input.scrollHeight}px`;
    };
    resize();
    let width = input.parentElement!.getBoundingClientRect().width;
    let frame = 0;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width === width) return;
      width = entry.contentRect.width;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(resize);
    });
    observer.observe(input.parentElement!);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [value]);
  return (
    <textarea
      ref={ref}
      className={className}
      aria-label={label}
      placeholder={label}
      value={value}
      rows={1}
      disabled={disabled}
      onChange={(event) => onChange(event.currentTarget.value)}
    />
  );
}
