import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { ContentData, JsonValue } from "../../src/admin/types";
import type { EditorField } from "../../src/admin/content-model";
import { formatGermanLongDate } from "../../src/data/content-utils";
import "./job-editor.css";

function InlineText({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
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
      className="job-inline-text"
      aria-label={label}
      placeholder={label}
      value={value}
      rows={1}
      disabled={disabled}
      onChange={(event) => onChange(event.currentTarget.value)}
    />
  );
}

function InlineList({
  label,
  values,
  onChange,
  disabled,
  paragraphs = false,
  benefits = false,
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  disabled: boolean;
  paragraphs?: boolean;
  benefits?: boolean;
}) {
  const [keys, setKeys] = useState(() => values.map(() => crypto.randomUUID()));
  function move(index: number, offset: number) {
    const next = [...values];
    const nextKeys = [...keys];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    [nextKeys[index], nextKeys[index + offset]] = [nextKeys[index + offset], nextKeys[index]];
    setKeys(nextKeys);
    onChange(next);
  }
  return (
    <div className="job-inline-list">
      <ul className={paragraphs ? "job-paragraphs" : benefits ? "editorial-list" : "job-checks"}>
        {values.map((value, index) => (
          <li key={keys[index] ?? index}>
            {!paragraphs && !benefits && (
              <span className="job-check" aria-hidden="true">
                ✓
              </span>
            )}
            <div className="job-list-entry">
              <InlineText
                label={`${label}: ${paragraphs ? "Absatz" : "Listenpunkt"} ${index + 1}`}
                value={value}
                onChange={(next) => onChange(values.map((item, i) => (i === index ? next : item)))}
                disabled={disabled}
              />
              <div className="job-item-actions">
                <button
                  type="button"
                  aria-label={`${label}: Eintrag ${index + 1} nach oben`}
                  disabled={disabled || index === 0}
                  onClick={() => move(index, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={`${label}: Eintrag ${index + 1} nach unten`}
                  disabled={disabled || index === values.length - 1}
                  onClick={() => move(index, 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  aria-label={`${label}: Eintrag ${index + 1} entfernen`}
                  disabled={disabled || values.length === 1}
                  onClick={() => {
                    setKeys(keys.filter((_, i) => i !== index));
                    onChange(values.filter((_, i) => i !== index));
                  }}
                >
                  Entfernen
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="text-button job-add-item"
        disabled={disabled}
        onClick={() => {
          setKeys([...keys, crypto.randomUUID()]);
          onChange([...values, ""]);
        }}
        aria-label={`${label}: ${paragraphs ? "Absatz" : "Listenpunkt"} hinzufügen`}
      >
        + {paragraphs ? "Absatz" : "Listenpunkt"} hinzufügen
      </button>
    </div>
  );
}

const settingsKeys = ["area", "team", "scope", "start", "employmentType", "validThrough"];

export function JobEditor({
  data,
  fields,
  onChange,
  renderField,
  disabled,
}: {
  data: ContentData;
  fields: EditorField[];
  onChange: (key: string, value: JsonValue) => void;
  renderField: (field: EditorField) => ReactNode;
  disabled: boolean;
}) {
  const text = (key: string, label: string) => (
    <InlineText
      label={label}
      value={String(data[key] ?? "")}
      onChange={(value) => onChange(key, value)}
      disabled={disabled}
    />
  );
  const list = (
    key: string,
    label: string,
    options: { paragraphs?: boolean; benefits?: boolean } = {},
  ) => (
    <InlineList
      key={key}
      label={label}
      values={data[key] as string[]}
      onChange={(values) => onChange(key, values)}
      disabled={disabled}
      {...options}
    />
  );
  const schedule = [
    data.scope,
    data.start ? `Start: ${data.start}` : "",
    data.validThrough ? `Bewerbung bis: ${formatGermanLongDate(String(data.validThrough))}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <>
      <div className="job-editor-toolbar">
        <p>Texte direkt anklicken und bearbeiten. Speichern veröffentlicht deine Änderungen.</p>
        <details className="job-settings">
          <summary>Einstellungen</summary>
          <p className="hint">
            Bereich, Beschäftigung und Bewerbungsfrist. Änderungen erscheinen sofort in der Anzeige.
          </p>
          {settingsKeys
            .map((key) => fields.find((field) => field.key === key))
            .filter((field) => field !== undefined)
            .map(renderField)}
        </details>
      </div>
      <article className="job-preview" aria-label="Stellenanzeige bearbeiten">
        <section className="job-hero">
          <div className="container">
            <p className="eyebrow">{[data.area, data.team].filter(Boolean).join(" · ")}</p>
            <h1>{text("title", "Stellenbezeichnung")}</h1>
            <div className="job-hero__meta">
              <div className="lead">{text("intro", "Einleitung")}</div>
              <div className="job-hero__facts">
                <span>{schedule || "Beschäftigung unter Einstellungen ergänzen"}</span>
                {data.datePosted && (
                  <time dateTime={String(data.datePosted)}>
                    Veröffentlicht am {formatGermanLongDate(String(data.datePosted))}
                  </time>
                )}
              </div>
            </div>
          </div>
        </section>
        <section className="section job-about">
          <div className="container grid-2">
            <div>
              <p className="eyebrow">Über uns</p>
              <h2>Ein Ort für eigenständiges Lernen.</h2>
            </div>
            <div className="job-about__copy">{list("about", "Über uns", { paragraphs: true })}</div>
          </div>
        </section>
        <section className="section">
          <div className="container grid-2 job-content">
            <div>
              <p className="eyebrow">Deine Aufgabe</p>
              <h2>Was du bei uns gestaltest.</h2>
              {list("responsibilities", "Aufgaben")}
            </div>
            <div>
              <p className="eyebrow">Dein Profil</p>
              <h2>Was du mitbringst.</h2>
              {list("profile", "Profil")}
            </div>
          </div>
        </section>
        <section className="section section--light">
          <div className="container grid-2">
            <div>
              <p className="eyebrow">Wir bieten</p>
              <h2>Was dich bei uns erwartet.</h2>
            </div>
            <div>{list("benefits", "Das erwartet dich bei uns", { benefits: true })}</div>
          </div>
        </section>
        <section className="section section--brand">
          <div className="container grid-2">
            <div>
              <p className="eyebrow">Interesse?</p>
              <h2>{text("closingTitle", "Überschrift Bewerbung")}</h2>
            </div>
            <div>
              <div className="lead">{text("closingText", "Einladung zur Bewerbung")}</div>
              <div className="job-preview-buttons" aria-hidden="true">
                <span>Bewerbungsadresse anzeigen</span>
                <span>Erst kennenlernen</span>
              </div>
            </div>
          </div>
        </section>
      </article>
    </>
  );
}
