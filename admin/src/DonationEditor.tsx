import { useState, type ButtonHTMLAttributes } from "react";
import { InlineText } from "./InlineText";
import { reorder, useSortable } from "./useSortable";
import type { ContentData, JsonValue } from "../../src/admin/types";
import donationImage from "../../src/assets/images/editorial/donations-material-work.webp?url";
import type { ContentEditorProps } from "./content-editor";
import "./donation-editor.css";

function object(value: JsonValue): ContentData {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Der Spendeninhalt muss eine Gruppe von Feldern enthalten.");
  }
  return value;
}

function list(value: JsonValue): JsonValue[] {
  if (!Array.isArray(value)) throw new Error("Der Spendeninhalt muss eine Liste enthalten.");
  return value;
}

function ItemActions({
  label,
  index,
  count,
  minimum,
  disabled,
  handleProps,
  onRemove,
}: {
  label: string;
  index: number;
  count: number;
  minimum: number;
  disabled: boolean;
  handleProps: ButtonHTMLAttributes<HTMLButtonElement>;
  onRemove: () => void;
}) {
  return (
    <div className="donation-item-actions" role="group" aria-label={`${label} ${index + 1}`}>
      <button {...handleProps} />
      <button
        type="button"
        aria-label={`${label} ${index + 1} entfernen`}
        disabled={disabled || count <= minimum}
        onClick={onRemove}
      >
        Entfernen
      </button>
    </div>
  );
}

export function DonationEditor({
  data,
  fields,
  onChange,
  renderField,
  disabled,
}: ContentEditorProps) {
  const [view, setView] = useState<"page" | "homepage">("page");
  const paragraphs = list(object(data.impact).paragraphs);
  const projects = list(object(data.projects).items);
  const [paragraphKeys, setParagraphKeys] = useState(() =>
    paragraphs.map(() => crypto.randomUUID()),
  );
  const [projectKeys, setProjectKeys] = useState(() => projects.map(() => crypto.randomUUID()));
  if (paragraphKeys.length !== paragraphs.length)
    setParagraphKeys(paragraphs.map((_, index) => paragraphKeys[index] ?? crypto.randomUUID()));
  if (projectKeys.length !== projects.length)
    setProjectKeys(projects.map((_, index) => projectKeys[index] ?? crypto.randomUUID()));
  const paragraphSort = useSortable({
    keys: paragraphKeys,
    disabled,
    onMove: (from, to) => moveItem("impact", from, to),
  });
  const projectSort = useSortable({
    keys: projectKeys,
    disabled,
    onMove: (from, to) => moveItem("projects", from, to),
  });

  function fieldAt(section: string, key?: string) {
    const group = fields.find((field) => field.key === section);
    const field = key ? group?.fields?.find((field) => field.key === key) : group;
    if (!field) throw new Error(`Das Spendenfeld ${section}.${key ?? ""} fehlt.`);
    return field;
  }
  const paragraphField = fieldAt("impact", "paragraphs");
  const projectField = fieldAt("projects", "items");
  function change(section: string, key: string, value: JsonValue) {
    onChange(section, { ...object(data[section]), [key]: value });
  }
  function text(section: string, key: string) {
    const field = fieldAt(section, key);
    return (
      <InlineText
        className="donation-inline-text"
        label={`${fieldAt(section).label}: ${field.label}`}
        value={String(object(data[section])[key])}
        disabled={disabled}
        onChange={(value) => change(section, key, value)}
      />
    );
  }
  function moveItem(section: "impact" | "projects", from: number, to: number) {
    const values = reorder(section === "impact" ? paragraphs : projects, from, to);
    const keys = reorder(section === "impact" ? paragraphKeys : projectKeys, from, to);
    if (section === "impact") setParagraphKeys(keys);
    else setProjectKeys(keys);
    change(section, section === "impact" ? "paragraphs" : "items", values);
  }

  return (
    <div className="donation-editor">
      <div className="donation-editor-toolbar">
        <p>Texte direkt anklicken und bearbeiten. Speichern veröffentlicht deine Änderungen.</p>
        <div className="donation-view-switch" role="group" aria-label="Spendenansicht">
          <button type="button" aria-pressed={view === "page"} onClick={() => setView("page")}>
            Spendenseite
          </button>
          <button
            type="button"
            aria-pressed={view === "homepage"}
            onClick={() => setView("homepage")}
          >
            Hinweis auf der Startseite
          </button>
        </div>
        <details className="donation-settings">
          <summary>Suchmaschinen und Vorschau</summary>
          {renderField(fieldAt("seo"))}
        </details>
      </div>

      <article
        className="donation-preview"
        aria-label={view === "page" ? "Spendenseite bearbeiten" : "Startseitenhinweis bearbeiten"}
      >
        {view === "homepage" ? (
          <section className="section section--light">
            <div className="container grid-2">
              <div>
                <div className="eyebrow">{text("homepage", "eyebrow")}</div>
                <h2>{text("homepage", "title")}</h2>
              </div>
              <div>
                <div className="lead">{text("homepage", "text")}</div>
                <div className="donation-text-link">
                  {text("homepage", "label")}
                  <span aria-hidden="true">→</span>
                </div>
              </div>
            </div>
          </section>
        ) : (
          <>
            <section className="page-intro">
              <div className="container page-intro__grid">
                <div className="eyebrow page-intro__eyebrow">{text("hero", "eyebrow")}</div>
                <h1>{text("hero", "title")}</h1>
                <div className="page-intro__aside lead">{text("hero", "intro")}</div>
              </div>
            </section>

            <section className="split">
              <div className="split__content">
                <div className="eyebrow">{text("impact", "eyebrow")}</div>
                <h2>{text("impact", "title")}</h2>
                <div ref={paragraphSort.containerRef}>
                  {paragraphs.map((paragraph, index) => (
                    <div
                      key={paragraphKeys[index]}
                      {...paragraphSort.itemProps(index)}
                      className={`donation-paragraph ${paragraphSort.itemProps(index).className}`}
                    >
                      <InlineText
                        className="donation-inline-text"
                        label={`Warum Unterstützung wirkt: Absatz ${index + 1}`}
                        value={String(paragraph)}
                        disabled={disabled}
                        onChange={(value) =>
                          change(
                            "impact",
                            "paragraphs",
                            paragraphs.map((entry, i) => (i === index ? value : entry)),
                          )
                        }
                      />
                      <ItemActions
                        label="Absatz"
                        index={index}
                        count={paragraphs.length}
                        minimum={paragraphField.min ?? 0}
                        disabled={disabled}
                        handleProps={paragraphSort.handleProps(index, `Absatz ${index + 1}`)}
                        onRemove={() => {
                          setParagraphKeys(paragraphKeys.filter((_, i) => i !== index));
                          change(
                            "impact",
                            "paragraphs",
                            paragraphs.filter((_, i) => i !== index),
                          );
                        }}
                      />
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="donation-add-item secondary"
                  disabled={disabled}
                  onClick={() => {
                    setParagraphKeys([...paragraphKeys, crypto.randomUUID()]);
                    change("impact", "paragraphs", [...paragraphs, ""]);
                  }}
                >
                  Absatz hinzufügen
                </button>
              </div>
              <div className="donation-image">
                <img src={donationImage} alt={String(object(data.impact).imageAlt)} />
                <details className="donation-image-settings">
                  <summary>Bildbeschreibung bearbeiten</summary>
                  {renderField(fieldAt("impact", "imageAlt"), ["impact", "imageAlt"])}
                </details>
              </div>
            </section>

            <section className="section section--light">
              <div className="container">
                <div className="section-heading">
                  <div className="eyebrow">{text("projects", "eyebrow")}</div>
                  <h2>{text("projects", "title")}</h2>
                  <div className="donation-copy">{text("projects", "intro")}</div>
                </div>
                <div className="editorial-cards donation-projects" ref={projectSort.containerRef}>
                  {projects.map((project, index) => (
                    <section
                      key={projectKeys[index]}
                      {...projectSort.itemProps(index)}
                      className={`editorial-card ${projectSort.itemProps(index).className}`}
                      aria-label={`Förderschwerpunkt ${index + 1}`}
                    >
                      <p className="eyebrow">{String(index + 1).padStart(2, "0")}</p>
                      <h3>
                        <InlineText
                          className="donation-inline-text"
                          label={`Förderschwerpunkt ${index + 1}: Titel`}
                          value={String(object(project).title)}
                          disabled={disabled}
                          onChange={(title) =>
                            change(
                              "projects",
                              "items",
                              projects.map((entry, i) =>
                                i === index ? { ...object(entry), title } : entry,
                              ),
                            )
                          }
                        />
                      </h3>
                      <InlineText
                        className="donation-inline-text"
                        label={`Förderschwerpunkt ${index + 1}: Beschreibung`}
                        value={String(object(project).description)}
                        disabled={disabled}
                        onChange={(description) =>
                          change(
                            "projects",
                            "items",
                            projects.map((entry, i) =>
                              i === index ? { ...object(entry), description } : entry,
                            ),
                          )
                        }
                      />
                      <ItemActions
                        label="Förderschwerpunkt"
                        index={index}
                        count={projects.length}
                        minimum={projectField.min ?? 0}
                        disabled={disabled}
                        handleProps={projectSort.handleProps(
                          index,
                          `Förderschwerpunkt ${index + 1}`,
                        )}
                        onRemove={() => {
                          setProjectKeys(projectKeys.filter((_, i) => i !== index));
                          change(
                            "projects",
                            "items",
                            projects.filter((_, i) => i !== index),
                          );
                        }}
                      />
                    </section>
                  ))}
                </div>
                <button
                  type="button"
                  className="donation-add-item secondary"
                  disabled={
                    disabled ||
                    (projectField.max !== undefined && projects.length >= projectField.max)
                  }
                  onClick={() => {
                    setProjectKeys([...projectKeys, crypto.randomUUID()]);
                    change("projects", "items", [...projects, { title: "", description: "" }]);
                  }}
                >
                  Förderschwerpunkt hinzufügen
                </button>
              </div>
            </section>

            <section className="section">
              <div className="container support-grid">
                <section className="support-option">
                  <div className="eyebrow">{text("directDonation", "eyebrow")}</div>
                  <h2>{text("directDonation", "title")}</h2>
                  <div className="donation-copy">{text("directDonation", "intro")}</div>
                  <div className="donation-account">
                    {renderField(fieldAt("directDonation", "account"), [
                      "directDonation",
                      "account",
                    ])}
                  </div>
                  <div className="support-note">{text("directDonation", "note")}</div>
                </section>
                <section className="support-option support-option--company">
                  <div className="eyebrow">{text("company", "eyebrow")}</div>
                  <h2>{text("company", "title")}</h2>
                  <div className="lead">{text("company", "text")}</div>
                  <div className="donation-copy">{text("company", "detail")}</div>
                  <div className="donation-preview-button">{text("company", "buttonLabel")}</div>
                  <details className="donation-link-settings">
                    <summary>E-Mail-Betreff bearbeiten</summary>
                    {renderField(fieldAt("company", "emailSubject"), ["company", "emailSubject"])}
                  </details>
                </section>
              </div>
            </section>

            <section className="section section--light">
              <div className="container grid-2">
                <div>
                  <div className="eyebrow">{text("receipt", "eyebrow")}</div>
                  <h2>{text("receipt", "title")}</h2>
                </div>
                <div>
                  <div className="lead">{text("receipt", "intro")}</div>
                  <div className="donation-copy">{text("receipt", "instruction")}</div>
                  <div className="donation-preview-button">{text("receipt", "buttonLabel")}</div>
                  <details className="donation-link-settings">
                    <summary>E-Mail-Betreff bearbeiten</summary>
                    {renderField(fieldAt("receipt", "emailSubject"), ["receipt", "emailSubject"])}
                  </details>
                </div>
              </div>
            </section>

            <section className="section section--brand">
              <div className="container grid-2">
                <div>
                  <div className="eyebrow">{text("otherSupport", "eyebrow")}</div>
                  <h2>{text("otherSupport", "title")}</h2>
                </div>
                <div>
                  <div className="lead">{text("otherSupport", "text")}</div>
                  <div className="donation-button-row">
                    <div className="donation-preview-button donation-preview-button--light">
                      {text("otherSupport", "primaryLabel")}
                    </div>
                    <div className="donation-preview-button">
                      {text("otherSupport", "secondaryLabel")}
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </>
        )}
      </article>
    </div>
  );
}
