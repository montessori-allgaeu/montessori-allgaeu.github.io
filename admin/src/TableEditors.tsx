import type { ReactNode } from "react";
import { calculateEffectiveFee, type EditorField } from "../../src/admin/content-model";
import type { ContentCollection, ContentData, JsonValue } from "../../src/admin/types";
import type { ContentEditorProps } from "./content-editor";
import { newFieldValue } from "./Editor";
import "./table-editors.css";

function object(value: JsonValue | undefined): ContentData {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value: JsonValue | undefined): JsonValue[] {
  return Array.isArray(value) ? value : [];
}

function RowActions({
  field,
  items,
  index,
  disabled,
  onChange,
}: {
  field: EditorField;
  items: JsonValue[];
  index: number;
  disabled: boolean;
  onChange: (items: JsonValue[]) => void;
}) {
  function move(to: number) {
    if (disabled || to < 0 || to >= items.length) return;
    const next = [...items];
    const [item] = next.splice(index, 1);
    next.splice(to, 0, item);
    onChange(next);
  }
  return (
    <div className="compact-row-actions">
      <button
        type="button"
        className="icon-button"
        disabled={disabled || index === 0}
        aria-label={`${field.label}: Eintrag ${index + 1} nach oben`}
        onClick={() => move(index - 1)}
      >
        ↑
      </button>
      <button
        type="button"
        className="icon-button"
        disabled={disabled || index === items.length - 1}
        aria-label={`${field.label}: Eintrag ${index + 1} nach unten`}
        onClick={() => move(index + 1)}
      >
        ↓
      </button>
      <button
        type="button"
        className="icon-button danger-text"
        disabled={disabled || items.length <= (field.min ?? 0)}
        aria-label={`${field.label}: Eintrag ${index + 1} entfernen`}
        title="Eintrag entfernen"
        onClick={() => {
          if (
            !disabled &&
            items.length > (field.min ?? 0) &&
            window.confirm(
              "Diesen Eintrag entfernen? Die Änderung wird erst mit Speichern übernommen.",
            )
          )
            onChange(items.filter((_, position) => position !== index));
        }}
      >
        ×
      </button>
    </div>
  );
}

type Column = {
  key: string;
  label: string;
  render: (item: JsonValue, index: number) => ReactNode;
};

function CompactTable({
  field,
  items,
  columns,
  disabled,
  onChange,
}: {
  field: EditorField;
  items: JsonValue[];
  columns: Column[];
  disabled: boolean;
  onChange: (items: JsonValue[]) => void;
}) {
  return (
    <section className="table-editor-section" aria-label={field.label}>
      <h3>{field.label}</h3>
      {field.description && <p className="hint">{field.description}</p>}
      <table className="compact-editor-table">
        <caption className="visually-hidden">{field.label} bearbeiten</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col">
                {column.label}
              </th>
            ))}
            <th className="compact-actions-heading" scope="col">
              Reihenfolge
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={index}>
              {columns.map((column) => (
                <td key={column.key}>
                  <span className="compact-cell-label" aria-hidden="true">
                    {column.label}
                  </span>
                  {column.render(item, index)}
                </td>
              ))}
              <td className="compact-actions-cell">
                <RowActions {...{ field, items, index, disabled, onChange }} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        type="button"
        className="button secondary compact-add"
        disabled={disabled || (field.max !== undefined && items.length >= field.max)}
        onClick={() => {
          if (!disabled && field.item && (field.max === undefined || items.length < field.max))
            onChange([...items, newFieldValue(field.item)]);
        }}
      >
        + Eintrag hinzufügen
      </button>
      {field.max !== undefined && <small>Bis zu {field.max} Einträge</small>}
    </section>
  );
}

function FieldTable({
  editor,
  field,
  path,
  items,
  onChange,
  renderCell,
}: {
  editor: ContentEditorProps;
  field: EditorField;
  path: string[];
  items: JsonValue[];
  onChange: (items: JsonValue[]) => void;
  renderCell?: (field: EditorField, item: JsonValue, index: number) => ReactNode | undefined;
}) {
  const columns = (field.item?.fields ?? []).map((child) => ({
    key: child.key,
    label: child.label,
    render: (item: JsonValue, index: number) =>
      renderCell?.(child, item, index) ??
      editor.renderField({ ...child, description: undefined }, [...path, String(index), child.key]),
  }));
  return (
    <CompactTable
      {...{ field, items, columns, onChange }}
      disabled={editor.disabled || (field.adminOnly === true && editor.role !== "admin")}
    />
  );
}

// Keep the original separator and the complete text on either side. In particular,
// office exceptions and membership conditions must never be parsed as numeric times/prices.
function splitLine(value: JsonValue) {
  const text = String(value ?? "");
  const separator = text.indexOf(":");
  if (separator < 0) return { label: "", separator: "", text };
  const spaces = /^\s*/.exec(text.slice(separator + 1))![0];
  return {
    label: text.slice(0, separator),
    separator: `:${spaces}`,
    text: text.slice(separator + 1 + spaces.length),
  };
}

function TextRows({
  editor,
  field,
  items,
  labels,
  onChange,
}: {
  editor: ContentEditorProps;
  field: EditorField;
  items: JsonValue[];
  labels: [string, string];
  onChange: (items: JsonValue[]) => void;
}) {
  const disabled = editor.disabled || (field.adminOnly === true && editor.role !== "admin");
  const columns = labels.map((label, column) => ({
    key: String(column),
    label,
    render: (item: JsonValue, index: number) => {
      const parts = splitLine(item);
      return (
        <input
          aria-label={`${field.label}: ${label} ${index + 1}`}
          value={column === 0 ? parts.label : parts.text}
          disabled={disabled}
          onChange={(event) => {
            const nextLabel = column === 0 ? event.currentTarget.value : parts.label;
            const nextText = column === 1 ? event.currentTarget.value : parts.text;
            const next = `${nextLabel}${parts.separator || (nextLabel ? ": " : "")}${nextText}`;
            onChange(items.map((current, position) => (position === index ? next : current)));
          }}
        />
      );
    },
  }));
  return <CompactTable {...{ field, items, columns, disabled, onChange }} />;
}

export function isCostCollection(collection: ContentCollection) {
  return ["schoolFeeSettings", "kindergartenFeeSettings", "communityContributionSettings"].includes(
    collection,
  );
}

export function CostEditor(props: ContentEditorProps) {
  const { collection, fields, data, onChange, renderField } = props;
  if (collection === "communityContributionSettings")
    return (
      <div className="table-editor">
        {fields.map((field) => {
          if (field.key !== "deposit" && field.key !== "membership")
            return <div key={field.key}>{renderField(field)}</div>;
          const value = object(data[field.key]);
          return (
            <section className="table-editor-group" key={field.key}>
              <h2>{field.label}</h2>
              {field.fields?.map((child) =>
                child.key !== "rows" ? (
                  <div key={child.key}>{renderField(child, [field.key, child.key])}</div>
                ) : field.key === "membership" ? (
                  <TextRows
                    key={child.key}
                    editor={props}
                    field={child}
                    items={list(value.rows)}
                    labels={["Mitgliedschaft", "Beitrag und Hinweise"]}
                    onChange={(rows) => onChange(field.key, { ...value, rows })}
                  />
                ) : (
                  <FieldTable
                    key={child.key}
                    editor={props}
                    field={child}
                    path={[field.key, child.key]}
                    items={list(value.rows)}
                    onChange={(rows) => onChange(field.key, { ...value, rows })}
                  />
                ),
              )}
            </section>
          );
        })}
      </div>
    );

  const order = ["intro", "subsidyAmount", "subsidyNote", "rows"];
  return (
    <div className="table-editor">
      {[...fields]
        .sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key))
        .map((field) =>
          field.key !== "rows" ? (
            <div key={field.key}>{renderField(field)}</div>
          ) : (
            <FieldTable
              key={field.key}
              editor={props}
              field={field}
              path={[field.key]}
              items={list(data.rows)}
              onChange={(rows) => onChange("rows", rows)}
              renderCell={(child, row) => {
                if (collection !== "kindergartenFeeSettings" || child.key !== "effectiveAmount")
                  return undefined;
                const computed = calculateEffectiveFee(
                  String(object(row).amount ?? ""),
                  String(data.subsidyAmount ?? ""),
                );
                return computed === undefined ? undefined : (
                  <p className="computed-value">
                    <strong>{computed}</strong>
                    <small>Automatisch berechnet</small>
                  </p>
                );
              }}
            />
          ),
        )}
    </div>
  );
}

function CareDetails({
  editor,
  field,
  items,
  rowIndex,
  onChange,
}: {
  editor: ContentEditorProps;
  field: EditorField;
  items: JsonValue[];
  rowIndex: number;
  onChange: (items: JsonValue[]) => void;
}) {
  const disabled = editor.disabled || (field.adminOnly === true && editor.role !== "admin");
  return (
    <div className="compact-care-details">
      {items.map((item, index) => (
        <div className="compact-care-detail" key={index}>
          <input
            aria-label={`Verlängerte Betreuung ${rowIndex + 1}, Ergänzung ${index + 1}`}
            value={String(item ?? "")}
            disabled={disabled}
            onChange={(event) =>
              onChange(
                items.map((current, position) =>
                  position === index ? event.currentTarget.value : current,
                ),
              )
            }
          />
          <RowActions {...{ field, items, index, disabled, onChange }} />
        </div>
      ))}
      <button
        type="button"
        className="text-button"
        disabled={disabled || (field.max !== undefined && items.length >= field.max)}
        onClick={() => {
          if (!disabled && field.item && (field.max === undefined || items.length < field.max))
            onChange([...items, newFieldValue(field.item)]);
        }}
      >
        + Ergänzung
      </button>
    </div>
  );
}

export function OpeningHoursEditor(props: ContentEditorProps) {
  const { fields, data, onChange, renderField } = props;
  return (
    <div className="table-editor">
      {fields.map((field) => {
        if (field.key === "ganztag") return null;
        if (field.key === "schoolOffice")
          return (
            <TextRows
              key={field.key}
              editor={props}
              field={field}
              items={list(data.schoolOffice)}
              labels={["Tag(e)", "Zeit oder Ergänzung"]}
              onChange={(rows) => onChange(field.key, rows)}
            />
          );
        if (field.key === "kindergarten") {
          const rows = list(data.kindergarten);
          return (
            <FieldTable
              key={field.key}
              editor={props}
              field={field}
              path={[field.key]}
              items={rows}
              onChange={(next) => onChange(field.key, next)}
              renderCell={(child, row, index) =>
                child.key === "details" ? (
                  <CareDetails
                    editor={props}
                    field={child}
                    items={list(object(row).details)}
                    rowIndex={index}
                    onChange={(details) =>
                      onChange(
                        field.key,
                        rows.map((current, position) =>
                          position === index ? { ...object(current), details } : current,
                        ),
                      )
                    }
                  />
                ) : undefined
              }
            />
          );
        }
        if (field.key === "kindergartenClosures") {
          const closures = object(data[field.key]);
          return (
            <section className="table-editor-group" key={field.key}>
              <h2>{field.label}</h2>
              {field.fields?.map((child) =>
                child.key === "periods" ? (
                  <FieldTable
                    key={child.key}
                    editor={props}
                    field={child}
                    path={[field.key, child.key]}
                    items={list(closures.periods)}
                    onChange={(periods) => onChange(field.key, { ...closures, periods })}
                  />
                ) : (
                  <div key={child.key}>{renderField(child, [field.key, child.key])}</div>
                ),
              )}
            </section>
          );
        }
        return <div key={field.key}>{renderField(field)}</div>;
      })}
    </div>
  );
}
