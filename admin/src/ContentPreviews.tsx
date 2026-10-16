import { Fragment, useState } from "react";
import type { ContentData, JsonValue } from "../../src/admin/types";
import { formatDownloadMeta, formatGermanLongDate } from "../../src/data/content-utils";
import { teamGroups } from "../../src/data/team-groups";
import type { ContentEditorProps } from "./content-editor";
import { today } from "./overview";
import { PdfPreview, type PdfMetadata } from "./PdfPreview";
import "./content-previews.css";

const text = (data: ContentData, key: string) => String(data[key] ?? "");
const isObject = (value: JsonValue): value is ContentData =>
  value !== null && typeof value === "object" && !Array.isArray(value);

function dateValue(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

function mediaUrl(props: ContentEditorProps, path: string) {
  return (
    props.previews[path] ??
    `/api/media?path=${encodeURIComponent(path)}&collection=${encodeURIComponent(props.collection)}`
  );
}

function Fields({ props, className = "" }: { props: ContentEditorProps; className?: string }) {
  const fields = props.fields.filter((field) => field.key !== "position");
  const optional = fields.filter(
    (field) => field.optional && props.originalData[field.key] === undefined,
  );
  return (
    <div className={`content-compact-fields ${className}`}>
      {fields.filter((field) => !optional.includes(field)).map((field) => props.renderField(field))}
      {optional.length > 0 && (
        <details className="optional-fields">
          <summary>Weitere Angaben ergänzen</summary>
          {optional.map((field) => props.renderField(field))}
        </details>
      )}
    </div>
  );
}

function PreviewIcon({ type }: { type: "calendar" | "clock" | "pin" | "download" }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {type === "calendar" && (
        <>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M16 3v4M8 3v4M3 11h18" />
        </>
      )}
      {type === "clock" && (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </>
      )}
      {type === "pin" && (
        <>
          <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z" />
          <circle cx="12" cy="10" r="2.5" />
        </>
      )}
      {type === "download" && (
        <>
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
        </>
      )}
    </svg>
  );
}

export function EventEditor(props: ContentEditorProps) {
  const { data } = props;
  const date = dateValue(text(data, "date"));
  const formatted = (options: Intl.DateTimeFormatOptions) =>
    date ? new Intl.DateTimeFormat("de-DE", { ...options, timeZone: "UTC" }).format(date) : "";
  return (
    <div className="content-preview-editor">
      <Fields props={props} className="content-event-fields" />
      <section className="content-preview" aria-label="Vorschau des Termineintrags">
        <p className="content-preview-label">So erscheint der Termin auf der Website</p>
        <article className="content-event">
          <div className="content-event-date">
            <span>{formatted({ day: "2-digit" }) || "–"}</span>
            <small>{formatted({ month: "long", year: "numeric" }) || "Datum wählen"}</small>
          </div>
          <div>
            <p className="content-preview-eyebrow">{text(data, "category")}</p>
            <h2>{text(data, "title") || "Titel des Termins"}</h2>
            <p>
              {text(data, "description")
                .split("Schulbüro")
                .map((part, index) => (
                  <Fragment key={index}>
                    {index > 0 && (
                      <a
                        href="https://montessori-allgaeu.de/kontakt/"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Schulbüro
                      </a>
                    )}
                    {part}
                  </Fragment>
                ))}
            </p>
            <ul className="content-event-meta">
              <li>
                <PreviewIcon type="calendar" />
                <time dateTime={date ? text(data, "date") : undefined}>
                  {formatted({ weekday: "long", day: "numeric", month: "long", year: "numeric" }) ||
                    "Datum wählen"}
                </time>
              </li>
              <li>
                <PreviewIcon type="clock" />
                {text(data, "time") || "Uhrzeit ergänzen"}
              </li>
              <li>
                <PreviewIcon type="pin" />
                {text(data, "location") || "Ort ergänzen"}
              </li>
            </ul>
          </div>
        </article>
      </section>
    </div>
  );
}

export function DownloadEditor(props: ContentEditorProps) {
  const { data, originalData, previews } = props;
  const [metadata, setMetadata] = useState<PdfMetadata | null>(null);
  const path = text(data, "file");
  const original = text(originalData, "file");
  const url = path ? mediaUrl(props, path) : "";
  const bytes = metadata?.source === url ? metadata.bytes : null;
  const meta =
    bytes === null
      ? [
          text(data, "documentDate") ? `Stand ${text(data, "documentDate")}` : "",
          text(data, "note"),
          "PDF",
        ]
          .filter(Boolean)
          .join(" · ")
      : formatDownloadMeta(
          { documentDate: text(data, "documentDate"), note: text(data, "note") },
          bytes,
        );
  return (
    <div className="content-preview-editor">
      <Fields props={props} className="content-download-fields" />
      {path && (
        <p className="content-replacement-note">
          {previews[path] && original ? (
            <>
              Ersetzt beim Speichern: <strong>{original.split("/").at(-1)}</strong>.{" "}
            </>
          ) : (
            <>
              Ausgewählte Datei: <strong>{path.split("/").at(-1)}</strong>.{" "}
            </>
          )}
          {original && path === original && (
            <>Beim Ersetzen bleiben der Dateiname und vorhandene Verlinkungen erhalten.</>
          )}
        </p>
      )}
      <section className="content-preview" aria-label="Vorschau des Downloads">
        <p className="content-preview-label">So erscheint der Download auf der Website</p>
        <p className="content-preview-eyebrow">Dokumente · {text(data, "group")}</p>
        {url ? (
          <a className="content-download-row" href={url} target="_blank" rel="noreferrer">
            <div>
              <h3>{text(data, "title") || "Titel des Dokuments"}</h3>
              <p>{meta}</p>
            </div>
            <PreviewIcon type="download" />
          </a>
        ) : (
          <p>Wähle eine PDF-Datei für die Vorschau aus.</p>
        )}
        {url && (
          <PdfPreview
            key={url}
            url={url}
            title={text(data, "title") || "PDF-Dokument"}
            onMetadata={setMetadata}
          />
        )}
      </section>
    </div>
  );
}

export function PersonEditor(props: ContentEditorProps) {
  const { data, collection } = props;
  const name = text(data, "name");
  const image = text(data, "image");
  const initials = name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const placements =
    collection === "parentCouncil"
      ? [{ group: text(data, "area"), role: text(data, "role") }]
      : Array.isArray(data.assignments)
        ? data.assignments.filter(isObject)
        : [];

  return (
    <div className="content-preview-editor">
      <Fields props={props} />
      <section className="content-preview" aria-label="Vorschau der Person">
        <p className="content-preview-label">So erscheint die Person auf der Website</p>
        <div className="content-person-placements">
          {placements.map((placement, index) => {
            const group = text(placement, "group");
            const section = text(placement, "section");
            const definition = teamGroups.find((entry) => entry.name === group);
            const label = definition && "label" in definition ? definition.label : group;
            const isBoard = group === "Vorstand";
            const page =
              collection === "parentCouncil"
                ? "Elternbeirat"
                : isBoard
                  ? "Träger & Verein"
                  : "Team";
            return (
              <article
                className={`content-person${isBoard ? " content-person-board" : ""}`}
                key={index}
              >
                <p className="content-person-placement">
                  {[page, label, section].filter(Boolean).join(" · ")}
                </p>
                <div className="content-person-image">
                  {image ? (
                    <img src={mediaUrl(props, image)} alt={`Porträt von ${name}`} />
                  ) : (
                    <span aria-hidden="true">{initials || "–"}</span>
                  )}
                </div>
                <h3>{name || "Name der Person"}</h3>
                {placement.role && <p>{String(placement.role)}</p>}
                {isBoard && (
                  <small className="content-person-note">
                    Name und Rolle erscheinen außerdem im Impressum.
                  </small>
                )}
                {(group === "Primaria" || group === "Sekundaria") && !section && (
                  <p className="editor-notice">
                    Wähle eine Untergruppe, damit die Person auf der Teamseite erscheint.
                  </p>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

export function AdmissionEditor(props: ContentEditorProps) {
  const { data, originalData, collection, fields, renderField } = props;
  const kindergarten = collection === "kindergartenAdmissionSettings";
  const year = text(data, "schoolYear");
  const currentYear = Number(today().slice(0, 4));
  const formatYear = (start: number) =>
    `${start}/${kindergarten ? start + 1 : String(start + 1).slice(-2)}`;
  const years = [
    ...new Set(
      [
        ...Array.from({ length: 8 }, (_, index) => formatYear(currentYear - 1 + index)),
        text(originalData, "schoolYear"),
        year,
      ].filter(Boolean),
    ),
  ].sort();
  const deadline = text(data, "applicationDeadline");
  const validDeadline = dateValue(deadline);
  const yearField = fields.find((field) => field.key === "schoolYear");

  return (
    <div className="content-preview-editor">
      <div className="content-compact-fields content-admission-fields">
        {yearField &&
          renderField({
            ...yearField,
            type: "select",
            description: undefined,
            options: years.map((value) => ({ value, label: value })),
          })}
        {fields.filter((field) => field.key !== "schoolYear").map((field) => renderField(field))}
      </div>
      <section
        className="content-preview content-admission-preview"
        aria-label="Vorschau der Aufnahmefrist"
      >
        <p className="content-preview-label">Aufnahme {kindergarten ? "Kindergarten" : "Schule"}</p>
        <p className="content-preview-eyebrow">
          {kindergarten ? "Kindergartenjahr" : "Schuljahr"} {year}
        </p>
        <h2>
          Anmeldung für {year || "das nächste Jahr"}
          {validDeadline && (
            <>
              {" "}
              bis <time dateTime={deadline}>{formatGermanLongDate(deadline)}</time>
            </>
          )}
        </h2>
        {!validDeadline && <p>Wähle einen Anmeldeschluss für die vollständige Vorschau.</p>}
        {validDeadline && deadline < today() && (
          <p className="editor-notice" role="status">
            Dieser Anmeldeschluss ist abgelaufen. Prüfe Jahr und Datum für die nächste Aufnahme.
          </p>
        )}
      </section>
    </div>
  );
}
