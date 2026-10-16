import { useEffect, useId, useRef, useState } from "react";
import type {
  ContentCollection,
  ContentData,
  JsonValue,
  Role,
  UploadResult,
} from "../../src/admin/types";
import { calculateEffectiveFee, type EditorField } from "../../src/admin/content-model";
import { errorText } from "./api";
import { uploadMedia } from "./media";

export function humanValue(value: JsonValue | undefined): string {
  if (value === undefined || value === null || value === "") return "Noch nicht angegeben";
  if (typeof value === "boolean") return value ? "Ja" : "Nein";
  if (Array.isArray(value))
    return value.length ? value.map(humanValue).join(" · ") : "Noch keine Einträge";
  if (typeof value === "object")
    return Object.entries(value)
      .filter(([key, part]) => key !== "position" && part !== "" && part !== undefined)
      .map(([, part]) => humanValue(part))
      .join(" · ");
  return String(value);
}

function newFieldValue(field: EditorField): JsonValue {
  if (field.defaultValue !== undefined) return structuredClone(field.defaultValue);
  if (field.type === "object")
    return Object.fromEntries(
      (field.fields ?? [])
        .filter((child) => !child.optional)
        .map((child) => [child.key, newFieldValue(child)]),
    );
  if (field.type === "list" || field.type === "multiselect") return [];
  if (field.type === "boolean") return false;
  if (field.type === "number") return field.min ?? 0;
  if (field.type === "select") return field.options?.[0]?.value ?? "";
  return "";
}

function shown(field: EditorField, siblings: ContentData) {
  return (
    !field.showWhen || field.showWhen.values.includes(String(siblings[field.showWhen.field] ?? ""))
  );
}

function setChild(
  value: ContentData,
  field: EditorField,
  next: JsonValue | undefined,
  fields: EditorField[],
) {
  const result = { ...value };
  if (next === undefined) delete result[field.key];
  else result[field.key] = next;
  for (const sibling of fields)
    if (sibling.showWhen && !shown(sibling, result)) delete result[sibling.key];
  return result;
}

type EditorProps = {
  field: EditorField;
  value: JsonValue | undefined;
  onChange: (value: JsonValue | undefined) => void;
  collection: ContentCollection;
  role: Role;
  onUpload: (upload: UploadResult, path: string[]) => void;
  onDiscardUpload?: (path: string[]) => void;
  fieldPath?: string[];
  originalValue?: JsonValue;
  mediaVersions?: Record<string, string>;
  previews: Record<string, string>;
  disabled?: boolean;
  context?: ContentData;
  onUploadBusy?: (busy: boolean) => void;
};

function MediaInput({
  field,
  value,
  onChange,
  collection,
  onUpload,
  previews,
  disabled,
  onUploadBusy,
  onDiscardUpload,
  fieldPath = [field.key],
  originalValue,
  mediaVersions,
}: EditorProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputId = useId();
  const mounted = useRef(true);
  const latestRequest = useRef(0);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      latestRequest.current += 1;
    };
  }, []);
  const path = typeof value === "string" ? value : "";
  const isImage = field.type === "image";
  const mediaUrl = path
    ? (previews[path] ??
      `/api/media?path=${encodeURIComponent(path)}&collection=${encodeURIComponent(collection)}`)
    : "";
  async function upload(file: File | undefined) {
    if (!file) return;
    const request = ++latestRequest.current;
    setBusy(true);
    onUploadBusy?.(true);
    setError("");
    try {
      const result = await uploadMedia(
        file,
        collection,
        isImage ? "image" : "pdf",
        originalValue,
        mediaVersions,
      );
      if (!mounted.current || request !== latestRequest.current) return;
      onUpload(result, fieldPath);
      onChange(result.value);
    } catch (cause) {
      if (mounted.current && request === latestRequest.current) setError(errorText(cause));
    } finally {
      if (mounted.current && request === latestRequest.current) setBusy(false);
      onUploadBusy?.(false);
    }
  }
  return (
    <div className="media-editor">
      {path &&
        (isImage ? (
          <img className="person-photo" src={mediaUrl} alt="Aktuell ausgewähltes Foto" />
        ) : (
          <a
            href={previews[path] ?? `https://montessori-allgaeu.de${path}`}
            target="_blank"
            rel="noreferrer"
          >
            PDF ansehen ↗
          </a>
        ))}
      <div className="media-actions">
        <input
          id={inputId}
          className="visually-hidden"
          type="file"
          accept={isImage ? "image/jpeg,image/png,image/webp" : "application/pdf"}
          disabled={busy || disabled}
          onChange={(event) => {
            void upload(event.currentTarget.files?.[0]);
            event.currentTarget.value = "";
          }}
        />
        <label
          className={`button secondary${busy || disabled ? " is-disabled" : ""}`}
          htmlFor={inputId}
        >
          {busy
            ? "Datei wird hochgeladen …"
            : path
              ? isImage
                ? "Foto ersetzen"
                : "PDF ersetzen"
              : isImage
                ? "Foto auswählen"
                : "PDF auswählen"}
        </label>
        <small>{isImage ? "JPG, PNG oder WebP" : "PDF"} · maximal 10 MB</small>
        {path && <small className="file-name">{path.split("/").at(-1)}</small>}
        {path && previews[path] && (
          <button
            type="button"
            className="text-button"
            disabled={busy || disabled}
            onClick={() => {
              onDiscardUpload?.(fieldPath);
              onChange(originalValue);
            }}
          >
            Dateiaustausch zurücknehmen
          </button>
        )}
        {field.optional && path && (
          <button
            type="button"
            className="text-button"
            disabled={busy || disabled}
            onClick={() => {
              onDiscardUpload?.(fieldPath);
              onChange(undefined);
            }}
          >
            Entfernen
          </button>
        )}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function FieldInput(props: EditorProps) {
  const {
    field,
    value,
    onChange,
    collection,
    role,
    onUpload,
    previews,
    disabled,
    onUploadBusy,
    context,
    fieldPath = [field.key],
    originalValue,
    mediaVersions,
    onDiscardUpload,
  } = props;
  const id = useId();
  const nestedProps = {
    collection,
    role,
    onUpload,
    previews,
    disabled,
    onUploadBusy,
    context,
    mediaVersions,
    onDiscardUpload,
  };
  if (field.adminOnly && role !== "admin")
    return (
      <p className="locked">
        {humanValue(value)} <small>Nur Admins können diese Angabe ändern.</small>
      </p>
    );
  if (field.type === "image" || field.type === "pdf") return <MediaInput {...props} />;
  if (field.type === "object") {
    const object = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const fields = field.fields ?? [];
    return (
      <div className="nested-fields">
        {fields
          .filter((child) => shown(child, object))
          .map((child) => (
            <div className="input-field" key={child.key}>
              <div className="field-label">
                {child.label}
                {child.optional && <small>optional</small>}
              </div>
              {child.description && <p className="hint">{child.description}</p>}
              {collection === "kindergartenFeeSettings" &&
              child.key === "effectiveAmount" &&
              calculateEffectiveFee(
                String(object.amount ?? ""),
                String(context?.subsidyAmount ?? ""),
              ) !== undefined ? (
                <p className="computed-value">
                  {calculateEffectiveFee(
                    String(object.amount ?? ""),
                    String(context?.subsidyAmount ?? ""),
                  )}
                  <small>Automatisch berechnet</small>
                </p>
              ) : (
                <FieldInput
                  {...nestedProps}
                  field={child}
                  value={object[child.key]}
                  fieldPath={[...fieldPath, child.key]}
                  originalValue={
                    originalValue &&
                    typeof originalValue === "object" &&
                    !Array.isArray(originalValue)
                      ? originalValue[child.key]
                      : undefined
                  }
                  onChange={(next) => onChange(setChild(object, child, next, fields))}
                />
              )}
            </div>
          ))}
      </div>
    );
  }
  if (field.type === "list") return <ListInput {...props} />;
  if (field.type === "boolean")
    return (
      <label className="checkbox">
        <input
          type="checkbox"
          checked={value === true}
          disabled={disabled}
          onChange={(event) => onChange(event.currentTarget.checked)}
        />
        {field.label}
      </label>
    );
  if (field.type === "multiselect") {
    const values = Array.isArray(value) ? value : [];
    return (
      <div className="option-list">
        {field.options?.map((option) => (
          <label className="checkbox" key={option.value}>
            <input
              type="checkbox"
              disabled={disabled}
              checked={values.includes(option.value)}
              onChange={(event) =>
                onChange(
                  event.currentTarget.checked
                    ? [...values, option.value]
                    : values.filter((part) => part !== option.value),
                )
              }
            />
            {option.label}
          </label>
        ))}
      </div>
    );
  }
  if (field.type === "select")
    return (
      <select
        aria-label={field.label}
        value={String(value ?? "")}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.value || undefined)}
      >
        {field.optional && <option value="">Keine Angabe</option>}
        {!field.optional && !value && (
          <option value="" disabled>
            Bitte auswählen
          </option>
        )}
        {field.options?.map((option) => (
          <option value={option.value} key={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  if (field.type === "textarea")
    return (
      <textarea
        id={id}
        aria-label={field.label}
        rows={Math.min(12, Math.max(3, String(value ?? "").split("\n").length + 1))}
        value={String(value ?? "")}
        disabled={disabled}
        maxLength={field.max}
        onChange={(event) =>
          onChange(event.currentTarget.value || (field.optional ? undefined : ""))
        }
      />
    );
  return (
    <input
      id={id}
      aria-label={field.label}
      type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
      value={typeof value === "string" || typeof value === "number" ? value : ""}
      disabled={disabled}
      min={field.min}
      max={field.type === "number" ? field.max : undefined}
      maxLength={field.type === "text" ? field.max : undefined}
      onChange={(event) => {
        const raw = event.currentTarget.value;
        onChange(
          raw === ""
            ? field.optional
              ? undefined
              : ""
            : field.type === "number"
              ? Number(raw)
              : raw,
        );
      }}
    />
  );
}

function ListInput(props: EditorProps) {
  const { field, value, onChange, disabled } = props;
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const items = Array.isArray(value) ? value : [];
  const itemField = field.item;
  if (!itemField) return null;
  function move(from: number, to: number) {
    if (to < 0 || to >= items.length || from === to) return;
    const next = [...items];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(
      next.map((entry, index) =>
        entry && typeof entry === "object" && !Array.isArray(entry) && "position" in entry
          ? { ...entry, position: index + 1 }
          : entry,
      ),
    );
  }
  return (
    <div className="list-editor">
      {items.map((item, index) => (
        <div
          key={index}
          className="list-entry"
          onDragOver={(event) => {
            if (dragIndex !== null) event.preventDefault();
          }}
          onDrop={(event) => {
            event.preventDefault();
            if (dragIndex !== null) move(dragIndex, index);
            setDragIndex(null);
          }}
        >
          <div className="list-entry-toolbar">
            <span
              className="entry-number"
              draggable={!disabled}
              onDragStart={() => setDragIndex(index)}
              onDragEnd={() => setDragIndex(null)}
              title="Zum Verschieben ziehen"
            >
              ⋮⋮ {index + 1}
            </span>
            <div className="row-actions">
              <button
                type="button"
                className="icon-button"
                disabled={disabled || index === 0}
                aria-label={`${field.label}: Eintrag ${index + 1} nach oben`}
                onClick={() => move(index, index - 1)}
              >
                ↑
              </button>
              <button
                type="button"
                className="icon-button"
                disabled={disabled || index === items.length - 1}
                aria-label={`${field.label}: Eintrag ${index + 1} nach unten`}
                onClick={() => move(index, index + 1)}
              >
                ↓
              </button>
              <button
                type="button"
                className="text-button danger-text"
                disabled={disabled || (field.min !== undefined && items.length <= field.min)}
                onClick={() => {
                  if (
                    window.confirm(
                      "Diesen Eintrag entfernen? Die Änderung wird erst mit Speichern übernommen.",
                    )
                  )
                    onChange(items.filter((_, position) => position !== index));
                }}
              >
                Entfernen
              </button>
            </div>
          </div>
          <FieldInput
            {...props}
            field={{ ...itemField, label: `${itemField.label} ${index + 1}` }}
            value={item}
            fieldPath={[...(props.fieldPath ?? [field.key]), String(index)]}
            originalValue={
              Array.isArray(props.originalValue) ? props.originalValue[index] : undefined
            }
            onChange={(next) =>
              onChange(
                items.map((current, position) =>
                  position === index ? (next ?? newFieldValue(itemField)) : current,
                ),
              )
            }
          />
        </div>
      ))}
      <button
        type="button"
        className="button secondary"
        disabled={disabled || (field.max !== undefined && items.length >= field.max)}
        onClick={() => onChange([...items, newFieldValue(itemField)])}
      >
        + {itemField.label === "Eintrag" ? "Eintrag" : itemField.label} hinzufügen
      </button>
      {field.max !== undefined && <small>Bis zu {field.max} Einträge</small>}
    </div>
  );
}

export function EditableField({ field, ...props }: EditorProps) {
  return (
    <section className={`editable-field field-${field.key}`}>
      <h3>{field.label}</h3>
      {field.description && <p className="hint">{field.description}</p>}
      <FieldInput {...props} field={field} />
    </section>
  );
}

export function PdfReplaceInput({
  title,
  disabled,
  onSelect,
}: {
  title: string;
  disabled: boolean;
  onSelect: (file: File) => void;
}) {
  const id = useId();
  return (
    <div className="pdf-replace">
      <input
        id={id}
        className="visually-hidden"
        type="file"
        accept="application/pdf"
        aria-label={`PDF ersetzen: ${title}`}
        disabled={disabled}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file) onSelect(file);
        }}
      />
      <label htmlFor={id} className={`button secondary${disabled ? " is-disabled" : ""}`}>
        PDF ersetzen
      </label>
    </div>
  );
}
