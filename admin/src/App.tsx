import { useCallback, useEffect, useRef, useState } from "react";
import type {
  Change,
  ContentCollection,
  ContentData,
  ContentMutation,
  ContentRecord,
  EditableContentSnapshot,
  JsonValue,
  SessionInfo,
  UploadResult,
} from "../../src/admin/types";
import {
  contentDefinitions,
  getContentDefinition,
  calculateEffectiveFee,
} from "../../src/admin/content-model";
import { api, errorText, RequestError } from "./api";
import { contentUsage } from "../../src/admin/content-usage";
import { FieldInput, humanValue, EditableField, PdfReplaceInput } from "./Editor";
import { Access, Profile } from "./Access";
import {
  recordKey,
  titleOf,
  today,
  eventDate,
  nextEvents,
  recentContent,
  eventTemplates,
} from "./overview";
import { activeMedia, discardMedia, selectMedia, uploadMedia, type PendingMedia } from "./media";
import { loadProfileThumbnails, ProfileThumbnail } from "./ProfileThumbnail";

const capturedInvite = new URLSearchParams(location.hash.slice(1)).get("invite");
if (capturedInvite) history.replaceState(null, "", `${location.pathname}${location.search}`);

const areas = [
  "Termine",
  "Menschen",
  "Stellen",
  "Downloads",
  "Ganztag & Essen",
  "Kontakt & Zeiten",
  "Aufnahme",
  "Kosten",
  "Spenden",
];
const areaDescriptions: Record<string, string> = {
  Termine: "Was steht an? Termine anlegen, ändern und wiederverwenden.",
  Menschen: "Menschen und Aufgaben an der Monte. Einmal pflegen, überall aktuell.",
  Stellen: "Die nächste passende Person finden. Stellen einfach ergänzen und aktualisieren.",
  Downloads:
    "Unterlagen aktuell halten. Eine neue Datei ersetzt die alte an allen verknüpften Stellen.",
  "Ganztag & Essen": "Angebote, Schuljahre und gemeinsame Mahlzeiten.",
  "Kontakt & Zeiten": "So erreicht man uns. Diese Angaben werden auf mehreren Seiten verwendet.",
  Aufnahme: "Die nächsten Schritte für neue Familien – getrennt nach Schule und Kindergarten.",
  Kosten: "Beiträge und Gebühren übersichtlich an einem Ort.",
  Spenden: "Förderprojekte und Möglichkeiten, die Monte zu unterstützen.",
};
const statusLabels: Record<Change["status"], string> = {
  queued: "Gespeichert · Website wird aktualisiert",
  checking: "Gespeichert · Website wird aktualisiert",
  committed: "Gespeichert · Website wird aktualisiert",
  published: "Auf der Website sichtbar",
  failed: "Veröffentlichung fehlgeschlagen",
  conflict: "Gleichzeitig geändert",
};
const ongoing = (change: Change | undefined) =>
  change && ["queued", "checking", "committed"].includes(change.status);
const isVisible = (record: ContentRecord) => record.data.visible !== false;
const makeId = (data: ContentData) =>
  `${
    titleOf(data, "eintrag")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "eintrag"
  }-${crypto.randomUUID().slice(0, 8)}`;
const failureKey = (change: Change) => `${change.id}:${change.updatedAt}:${change.status}`;
function readSeenFailures(): string[] {
  try {
    return JSON.parse(localStorage.getItem("monte-seen-failures") ?? "[]") as string[];
  } catch {
    return [];
  }
}
function initialArea() {
  const collection = new URLSearchParams(location.search).get("collection");
  return (
    contentDefinitions.find((definition) => definition.collection === collection)?.area ??
    "Übersicht"
  );
}
type EditState = ContentMutation & {
  original: ContentData;
  pendingMedia: PendingMedia;
  mediaVersions: Record<string, string>;
  requestId: string;
  operationId?: string;
  savedPreviews: Record<string, string>;
  savedWithUploads?: boolean;
};
type YearPlan = {
  year: string;
  settings: ContentRecord;
  offers: ContentMutation[];
  requestId: string;
  operationId?: string;
};
function pendingChange(record: { collection: string; id: string }, changes: Change[]) {
  return changes.find(
    (change) =>
      ongoing(change) &&
      change.saved?.mutations.some((mutation) => recordKey(mutation) === recordKey(record)),
  );
}
function editorialRecords(records: ContentRecord[], changes: Change[]): ContentRecord[] {
  const result = new Map(records.map((record) => [recordKey(record), record]));
  // The API orders newest first. Apply older pending changes first.
  for (const change of [...changes].reverse()) {
    if (!ongoing(change)) continue;
    for (const mutation of change.saved?.mutations ?? [])
      result.set(recordKey(mutation), { ...mutation, version: mutation.baseVersion ?? "" });
  }
  return [...result.values()];
}
function toEdit(
  record: ContentRecord,
  mediaVersions: Record<string, string>,
  change?: Change,
): EditState {
  return {
    collection: record.collection,
    id: record.id,
    baseVersion: record.version || null,
    data: structuredClone(record.data),
    original: structuredClone(record.data),
    pendingMedia: {},
    mediaVersions: { ...mediaVersions },
    requestId: crypto.randomUUID(),
    operationId: change?.id,
    savedPreviews: change?.saved?.previews ?? {},
    savedWithUploads: change?.saved?.hasUploads,
  };
}

function Login({ invite, onEnrolled }: { invite: string | null; onEnrolled: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <main className="login-page">
      <div className="login-brand">
        MONTE <span>ALLGÄU</span>
      </div>
      <div className="login-content">
        <p className="eyebrow">Unsere Website gemeinsam pflegen</p>
        <h1>{invite ? "Willkommen an der Monte." : "Einfach aktuell halten."}</h1>
        <p>
          {invite
            ? "Richte deinen Passkey ein. Beim nächsten Besuch genügt die Bestätigung auf deinem Gerät."
            : "Termine, Menschen und alles, was Familien wissen sollen. Melde dich mit deinem Passkey an."}
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button
          className="button login-button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              if (invite) {
                await api.enroll(invite, "Mein Passkey");
                onEnrolled();
              } else await api.signIn();
            } catch (cause) {
              setError(errorText(cause));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy
            ? "Bitte auf deinem Gerät bestätigen …"
            : invite
              ? "Passkey einrichten"
              : "Mit Passkey anmelden"}
          <span aria-hidden="true">↗</span>
        </button>
        <p className="hint">
          {invite
            ? "Der Link ist nur einmal verwendbar. Du brauchst kein Passwort."
            : "Noch keinen Zugang oder Gerät verloren? Bitte einen Monte-Admin um einen Einrichtungslink."}
        </p>
        <a className="quiet-link" href="https://montessori-allgaeu.de">
          Zur Monte-Website ↗
        </a>
      </div>
      <p className="login-footer">Montessori-Gemeinschaft Allgäu</p>
    </main>
  );
}

function ChangeList({
  changes,
  onRetry,
  onOpen,
}: {
  changes: Change[];
  onOpen: (change: Change, mutation: ContentMutation) => void;
  onRetry: (change: Change) => void;
}) {
  return (
    <div className="plain-list change-list">
      {changes.length ? (
        changes.map((change) => (
          <article className="change-row" key={change.id}>
            <span className={`status-dot ${change.status}`} aria-hidden="true" />
            <div>
              <strong>{change.summary || "Website aktualisieren"}</strong>
              <p className={`change-state ${change.status}`}>{statusLabels[change.status]}</p>
              {change.error && <p className="error-detail">{change.error}</p>}
              {change.saved && (change.status === "failed" || change.status === "conflict") && (
                <div className="row-actions">
                  {change.saved.mutations.map((mutation) => (
                    <button
                      className="text-button"
                      key={recordKey(mutation)}
                      onClick={() => onOpen(change, mutation)}
                    >
                      {titleOf(mutation.data, getContentDefinition(mutation.collection).label)}{" "}
                      ansehen
                    </button>
                  ))}
                </div>
              )}
              <small>{new Date(change.updatedAt).toLocaleString("de-DE")}</small>
            </div>
            {change.status === "failed" && (
              <button className="text-button" onClick={() => onRetry(change)}>
                Erneut versuchen
              </button>
            )}
          </article>
        ))
      ) : (
        <p className="empty-state">
          Hier erscheinen die gespeicherten Änderungen und ihr Veröffentlichungsstand.
        </p>
      )}
    </div>
  );
}

export function App() {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [snapshot, setSnapshot] = useState<EditableContentSnapshot | null>(null);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [changes, setChanges] = useState<Change[]>([]);
  const [seenFailures, setSeenFailures] = useState(readSeenFailures);
  const [area, setArea] = useState(initialArea);
  const [query, setQuery] = useState("");
  const [editor, setEditor] = useState<EditState | null>(null);
  const [yearPlan, setYearPlan] = useState<YearPlan | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [archive, setArchive] = useState(false);
  const [past, setPast] = useState(false);
  const [offerYear, setOfferYear] = useState("");
  const [uploadsInProgress, setUploadsInProgress] = useState(0);
  const [conflictMediaVersions, setConflictMediaVersions] = useState<Record<string, string>>({});
  const [conflict, setConflict] = useState<ContentRecord | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ path: string; message: string }[]>([]);
  const [sortingCollection, setSortingCollection] = useState<ContentCollection | null>(null);
  const [dragged, setDragged] = useState<string | null>(null);
  const [invite, setInvite] = useState<string | null>(capturedInvite);
  const editorRef = useRef(editor);
  editorRef.current = editor;
  const changesRef = useRef(changes);
  changesRef.current = changes;
  const pendingUploads = editor ? activeMedia(editor.pendingMedia, editor.data) : [];
  const previews = {
    ...editor?.savedPreviews,
    ...Object.fromEntries(pendingUploads.map((upload) => [upload.value, upload.previewUrl])),
  };
  const dirty =
    !!editor &&
    (pendingUploads.length > 0 || JSON.stringify(editor.data) !== JSON.stringify(editor.original));
  const currentChange = changes.find((change) => change.id === editor?.operationId);
  const saving = busy || uploadsInProgress > 0 || !!ongoing(currentChange);
  const editingLocked =
    saving || currentChange?.status === "failed" || currentChange?.status === "conflict";
  const needsFileReselection =
    !!editor &&
    !editor.operationId &&
    (editor.savedWithUploads
      ? [editor.data.file, editor.data.image].filter(
          (value): value is string => typeof value === "string",
        )
      : Object.keys(editor.savedPreviews)
    ).some(
      (value) =>
        (editor.data.file === value || editor.data.image === value) &&
        !pendingUploads.some((upload) => upload.value === value),
    );
  const uploadBusy = (uploading: boolean) => {
    setUploadsInProgress((count) => Math.max(0, count + (uploading ? 1 : -1)));
    if (uploading)
      setEditor((current) =>
        current ? { ...current, operationId: undefined, requestId: crypto.randomUUID() } : current,
      );
  };
  api.onSession = setSession;

  useEffect(() => {
    let current = true;
    void api
      .request<SessionInfo>("/me")
      .then((value) => {
        if (current) api.setSession(value);
      })
      .catch((cause) => {
        if (current && !(cause instanceof RequestError && cause.status === 401))
          setError(errorText(cause));
      })
      .finally(() => {
        if (current) setInitializing(false);
      });
    return () => {
      current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    const [content, result, images] = await Promise.all([
      api.request<EditableContentSnapshot>("/content"),
      api.request<{ changes: Change[] }>("/changes"),
      loadProfileThumbnails(),
    ]);
    setSnapshot(content);
    setThumbnails(images);
    setChanges(result.changes);
    changesRef.current = result.changes;
    return content;
  }, []);

  useEffect(() => {
    if (!session) return;
    let current = true;
    void refresh()
      .then((content) => {
        if (!current || editorRef.current) return;
        const params = new URLSearchParams(location.search);
        const match = editorialRecords(content.records, changesRef.current).find(
          (record) =>
            record.collection === params.get("collection") && record.id === params.get("id"),
        );
        if (match)
          setEditor(toEdit(match, content.mediaVersions, pendingChange(match, changesRef.current)));
      })
      .catch((cause) => {
        if (current) setError(errorText(cause));
      });
    return () => {
      current = false;
    };
  }, [session?.user.id, refresh]);

  useEffect(() => {
    if (!session) return;
    let running = false;
    const interval = window.setInterval(async () => {
      if (running || document.visibilityState === "hidden") return;
      running = true;
      try {
        const before = changesRef.current;
        const result = await api.request<{ changes: Change[] }>("/changes");
        if (before !== changesRef.current) return;
        const newlyPublished = result.changes.some(
          (change) =>
            change.status === "published" &&
            changesRef.current.find((previous) => previous.id === change.id)?.status !==
              "published",
        );
        if (newlyPublished) {
          const [content, images] = await Promise.all([
            api.request<EditableContentSnapshot>("/content"),
            loadProfileThumbnails(),
          ]);
          if (before !== changesRef.current) return;
          setSnapshot(content);
          setThumbnails(images);
          const current = editorRef.current;
          if (
            current &&
            result.changes.find((change) => change.id === current.operationId)?.status ===
              "published"
          ) {
            const record = content.records.find((item) => recordKey(item) === recordKey(current));
            if (record)
              setEditor({
                ...toEdit(record, content.mediaVersions),
                operationId: current.operationId,
              });
          }
          setYearPlan((plan) =>
            plan &&
            result.changes.find((change) => change.id === plan.operationId)?.status === "published"
              ? null
              : plan,
          );
        }
        setChanges(result.changes);
      } catch (cause) {
        setError(errorText(cause));
      } finally {
        running = false;
      }
    }, 5000);
    return () => window.clearInterval(interval);
  }, [session?.user.id]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if ((dirty && !editor?.operationId) || (yearPlan && !yearPlan.operationId))
        event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, editor?.operationId, yearPlan]);

  useEffect(() => {
    if (area !== "Änderungen") return;
    const failures = changes
      .filter((change) => change.status === "failed" || change.status === "conflict")
      .map(failureKey);
    if (failures.every((key) => seenFailures.includes(key))) return;
    const next = [...new Set([...failures, ...seenFailures])].slice(0, 50);
    setSeenFailures(next);
    try {
      localStorage.setItem("monte-seen-failures", JSON.stringify(next));
    } catch {
      /* Acknowledgement remains available for this session. */
    }
  }, [area, changes, seenFailures]);

  function leaveEditor() {
    if (busy) {
      setError("Bitte warte kurz, bis deine Änderung sicher gespeichert ist.");
      return false;
    }
    if (uploadsInProgress > 0) {
      setError(
        "Bitte warte, bis die Datei vollständig hochgeladen ist. Deine Eingaben bleiben erhalten.",
      );
      return false;
    }
    if (
      ((dirty && !editor?.operationId) || (yearPlan && !yearPlan.operationId)) &&
      !window.confirm(
        "Du hast noch nicht gespeicherte Änderungen. Diesen Bereich trotzdem verlassen?",
      )
    )
      return false;
    setEditor(null);
    setYearPlan(null);
    setConflict(null);
    setFieldErrors([]);
    setError("");
    return true;
  }
  function navigate(next: string) {
    if (!leaveEditor()) return;
    setArea(next);
    setSortingCollection(null);
    setQuery("");
    setArchive(false);
    setPast(false);
    setOfferYear("");
    setMobileNav(false);
    history.replaceState(null, "", location.pathname);
    window.scrollTo(0, 0);
  }
  function openRecord(record: ContentRecord) {
    if (!leaveEditor()) return false;
    setArea(getContentDefinition(record.collection).area);
    setEditor(toEdit(record, snapshot?.mediaVersions ?? {}, pendingChange(record, changes)));
    setQuery("");
    window.scrollTo(0, 0);
    history.replaceState(
      null,
      "",
      `?collection=${encodeURIComponent(record.collection)}&id=${encodeURIComponent(record.id)}`,
    );
    return true;
  }
  async function replacePdf(record: ContentRecord, file: File) {
    if (pendingChange(record, changes) || busy || uploadsInProgress || !openRecord(record)) return;
    const owner = recordKey(record);
    uploadBusy(true);
    try {
      const upload = await uploadMedia(
        file,
        record.collection,
        "pdf",
        record.data.file,
        snapshot?.mediaVersions,
      );
      acceptUpload(owner, ["file"], upload);
      updateField(owner, "file", upload.value);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      uploadBusy(false);
    }
  }
  function openSavedChange(change: Change, mutation: ContentMutation) {
    if (!leaveEditor()) return;
    setArea(getContentDefinition(mutation.collection).area);
    setQuery("");
    setEditor(
      toEdit(
        { ...mutation, version: mutation.baseVersion ?? "" },
        snapshot?.mediaVersions ?? {},
        change,
      ),
    );
  }
  function newRecord(collection: ContentCollection, source?: ContentRecord) {
    if (!leaveEditor()) return;
    const definition = getContentDefinition(collection);
    const data = source
      ? structuredClone(source.data)
      : definition.defaults({
          schoolYear:
            String(
              snapshot?.records.find((record) => record.collection === "afternoonProgramSettings")
                ?.data.activeSchoolYear ?? "",
            ) || undefined,
          position:
            snapshot?.records.filter((record) => record.collection === collection).length ?? 0,
        });
    if (source) {
      if (typeof data.title === "string" && collection !== "events") data.title += " (Kopie)";
      if (collection === "events") data.date = today();
      if (typeof data.name === "string") data.name += " (Kopie)";
      if (collection === "jobs") data.datePosted = today();
      data.visible = true;
    }
    const id = makeId(data);
    setArea(definition.area);
    setEditor({
      collection,
      id,
      baseVersion: null,
      data,
      original: source ? {} : structuredClone(data),
      pendingMedia: {},
      mediaVersions: {},
      savedPreviews: {},
      requestId: crypto.randomUUID(),
    });
    setQuery("");
  }
  function updateField(owner: string, key: string, value: JsonValue | undefined) {
    setEditor((current) => {
      if (!current || recordKey(current) !== owner) return current;
      const data = { ...current.data };
      if (value === undefined) delete data[key];
      else data[key] = value;
      if (current.collection === "kindergartenFeeSettings" && Array.isArray(data.rows))
        data.rows = data.rows.map((row) => {
          if (!row || typeof row !== "object" || Array.isArray(row)) return row;
          const calculated = calculateEffectiveFee(
            String(row.amount ?? ""),
            String(data.subsidyAmount ?? ""),
          );
          return calculated === undefined ? row : { ...row, effectiveAmount: calculated };
        });
      return { ...current, data, operationId: undefined, requestId: crypto.randomUUID() };
    });
    setFieldErrors([]);
  }
  function acceptUpload(owner: string, path: string[], upload: UploadResult) {
    setEditor((current) =>
      current && recordKey(current) === owner
        ? {
            ...current,
            pendingMedia: selectMedia(current.pendingMedia, path, upload),
            operationId: undefined,
            requestId: crypto.randomUUID(),
          }
        : current,
    );
  }
  function discardUpload(owner: string, path: string[]) {
    setEditor((current) =>
      current && recordKey(current) === owner
        ? {
            ...current,
            pendingMedia: discardMedia(current.pendingMedia, path),
            operationId: undefined,
            requestId: crypto.randomUUID(),
          }
        : current,
    );
  }
  async function submit(mutations: ContentMutation[], uploadIds: string[], requestId: string) {
    setBusy(true);
    setError("");
    setFieldErrors([]);
    try {
      const accepted = await api.post<Change>("/changes", { requestId, mutations, uploadIds });
      const change = { ...accepted, saved: accepted.saved ?? { mutations, previews } };
      setChanges((current) => [change, ...current.filter((item) => item.id !== change.id)]);
      return change;
    } catch (cause) {
      setError(errorText(cause));
      if (cause instanceof RequestError) {
        setFieldErrors(cause.detail.fields ?? []);
        if (cause.status === 409 && editorRef.current) {
          const current = editorRef.current;
          try {
            const latest = await api.request<EditableContentSnapshot>("/content");
            const record = latest.records.find((entry) => recordKey(entry) === recordKey(current));
            if (record) {
              setConflict(record);
              setConflictMediaVersions(latest.mediaVersions);
            }
          } catch {
            /* Keep the original conflict and all user input visible. */
          }
        }
      }
      return null;
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!editor || needsFileReselection) return;
    const change = await submit(
      [
        {
          collection: editor.collection,
          id: editor.id,
          baseVersion: editor.baseVersion,
          data: editor.data,
        },
      ],
      activeMedia(editor.pendingMedia, editor.data).map((upload) => upload.id),
      editor.requestId,
    );
    if (change)
      setEditor((current) =>
        current && current.requestId === editor.requestId
          ? {
              ...current,
              original: structuredClone(current.data),
              savedPreviews: change.saved?.previews ?? previews,
              savedWithUploads: change.saved?.hasUploads ?? pendingUploads.length > 0,
              operationId: change.id,
            }
          : current,
      );
  }
  async function retry(change: Change) {
    setBusy(true);
    setError("");
    try {
      await api.post(`/changes/${encodeURIComponent(change.id)}/retry`);
      setChanges((await api.request<{ changes: Change[] }>("/changes")).changes);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }
  async function resolveConflict() {
    if (!editor) return;
    setBusy(true);
    setError("");
    try {
      const content = await api.request<EditableContentSnapshot>("/content");
      setSnapshot(content);
      const latest = content.records.find((record) => recordKey(record) === recordKey(editor));
      if (!latest)
        throw new Error(
          "Dieser Eintrag wurde inzwischen entfernt. Deine Eingaben bleiben erhalten. Bitte lege ihn bei Bedarf als neuen Eintrag an.",
        );
      setConflict(latest);
      setConflictMediaVersions(content.mediaVersions);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }
  async function moveRecord(records: ContentRecord[], from: number, to: number) {
    if (
      from === to ||
      to < 0 ||
      to >= records.length ||
      busy ||
      changes.some((change) => ongoing(change))
    )
      return;
    const sorted = [...records];
    const [record] = sorted.splice(from, 1);
    sorted.splice(to, 0, record);
    const change = await submit(
      sorted.map((item, index) => ({
        collection: item.collection,
        id: item.id,
        baseVersion: item.version,
        data: { ...item.data, position: index + 1 },
      })),
      [],
      crypto.randomUUID(),
    );
    if (change) setError("");
  }
  function startYearPlan() {
    if (!snapshot || !leaveEditor()) return;
    const settings = snapshot.records.find(
      (record) => record.collection === "afternoonProgramSettings",
    );
    if (!settings) {
      setError("Die Angaben zum Nachmittagsprogramm konnten nicht geladen werden.");
      return;
    }
    const active = String(settings.data.activeSchoolYear ?? "");
    const yearMatch = /^(\d{4})\/(\d{2}|\d{4})$/.exec(active);
    const nextYear = yearMatch
      ? `${Number(yearMatch[1]) + 1}/${String(Number(yearMatch[2]) + 1).padStart(yearMatch[2].length, "0")}`
      : active;
    const offers = snapshot.records
      .filter(
        (record) =>
          record.collection === "afternoonOffers" &&
          record.data.schoolYear === active &&
          isVisible(record),
      )
      .map((record) => {
        const data = { ...structuredClone(record.data), schoolYear: nextYear };
        return { collection: record.collection, id: makeId(data), baseVersion: null, data };
      });
    setYearPlan({ year: nextYear, settings, offers, requestId: crypto.randomUUID() });
  }
  async function refreshYearSettings() {
    if (!yearPlan) return;
    setBusy(true);
    try {
      const content = await api.request<EditableContentSnapshot>("/content");
      const settings = content.records.find(
        (record) => record.collection === "afternoonProgramSettings",
      );
      if (!settings)
        throw new Error("Die aktuellen Programmeinstellungen konnten nicht geladen werden.");
      if (
        window.confirm(
          `Auf der Website ist derzeit das Schuljahr ${String(settings.data.activeSchoolYear)} aktiv. Deine vorbereiteten Angebote für ${yearPlan.year} behalten und mit den aktuellen Einstellungen weiterbearbeiten?`,
        )
      ) {
        setSnapshot(content);
        setYearPlan({
          ...yearPlan,
          settings,
          operationId: undefined,
          requestId: crypto.randomUUID(),
        });
        setError("");
      }
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }
  async function saveYearPlan() {
    if (!yearPlan) return;
    if (!yearPlan.year.trim() || !yearPlan.offers.length) {
      setError("Bitte gib das Schuljahr an und füge mindestens ein Angebot hinzu.");
      return;
    }
    if (
      snapshot?.records.some(
        (record) =>
          record.collection === "afternoonOffers" && record.data.schoolYear === yearPlan.year,
      )
    ) {
      setError(
        "Für dieses Schuljahr gibt es bereits Angebote. Bitte bearbeite sie im bestehenden Programm oder wähle ein neues Schuljahr.",
      );
      return;
    }
    const settings = yearPlan.settings;
    const change = await submit(
      [
        {
          collection: settings.collection,
          id: settings.id,
          baseVersion: settings.version,
          data: { ...settings.data, activeSchoolYear: yearPlan.year },
        },
        ...yearPlan.offers.map((offer) => ({
          ...offer,
          data: { ...offer.data, schoolYear: yearPlan.year },
        })),
      ],
      [],
      yearPlan.requestId,
    );
    if (change)
      setYearPlan((current) => (current ? { ...current, operationId: change.id } : current));
  }

  if (initializing)
    return (
      <main className="loading-page" role="status">
        Monte-Verwaltung wird geladen …
      </main>
    );
  if (!session || invite) return <Login invite={invite} onEnrolled={() => setInvite(null)} />;
  const definition = editor ? getContentDefinition(editor.collection) : null;
  const recordList = editorialRecords(snapshot?.records ?? [], changes);
  const searched = query.trim().toLocaleLowerCase("de-DE");
  const matches = searched
    ? recordList.filter((record) =>
        `${titleOf(record.data)} ${getContentDefinition(record.collection).label} ${JSON.stringify(record.data)}`
          .toLocaleLowerCase("de-DE")
          .includes(searched),
      )
    : [];
  const areaDefinitions = contentDefinitions.filter((item) => item.area === area);
  const recent = recentContent(recordList, changes);
  const upcoming = nextEvents(recordList);
  const usage = editor ? contentUsage(editor, recordList) : null;
  const templates =
    editor?.collection === "events" && editor.baseVersion === null
      ? eventTemplates(recordList, String(editor.data.title ?? ""))
      : [];
  const currentYear = String(
    recordList.find((record) => record.collection === "afternoonProgramSettings")?.data
      .activeSchoolYear ?? "",
  );
  const pendingCount = changes.filter((change) => ongoing(change)).length;
  const failedCount = changes.filter(
    (change) =>
      (change.status === "failed" || change.status === "conflict") &&
      !seenFailures.includes(failureKey(change)),
  ).length;
  const yearChange = changes.find((change) => change.id === yearPlan?.operationId);

  return (
    <div className="app-shell">
      <header className="mobile-header">
        <button
          className="icon-button"
          aria-label={mobileNav ? "Menü schließen" : "Menü öffnen"}
          aria-expanded={mobileNav}
          onClick={() => setMobileNav(!mobileNav)}
        >
          ☰
        </button>
        <span>MONTE · VERWALTUNG</span>
        <button className="text-button" onClick={() => navigate("Dein Zugang")}>
          {session.user.name.split(" ")[0]}
        </button>
      </header>
      <aside className={`sidebar${mobileNav ? " open" : ""}`}>
        <button className="brand" onClick={() => navigate("Übersicht")}>
          MONTE<span>VERWALTUNG</span>
        </button>
        <nav aria-label="Verwaltungsbereiche">
          <button
            className={area === "Übersicht" && !query ? "active" : ""}
            onClick={() => navigate("Übersicht")}
          >
            Übersicht
          </button>
          <div className="nav-divider" />
          {areas.map((item) => (
            <button
              key={item}
              className={area === item && !query ? "active" : ""}
              aria-current={area === item && !query ? "page" : undefined}
              onClick={() => navigate(item)}
            >
              {item}
            </button>
          ))}
        </nav>
        <nav className="sidebar-bottom" aria-label="Verwaltung und Konto">
          <button
            className={area === "Änderungen" ? "active" : ""}
            onClick={() => navigate("Änderungen")}
          >
            Änderungen {pendingCount > 0 && <span className="count-badge">{pendingCount}</span>}
          </button>
          {session.user.role === "admin" && (
            <button
              className={area === "Zugänge" ? "active" : ""}
              onClick={() => navigate("Zugänge")}
            >
              Zugänge
            </button>
          )}
          <button
            className={area === "Dein Zugang" ? "active account-link" : "account-link"}
            onClick={() => navigate("Dein Zugang")}
          >
            {session.user.name}
            <small>{session.user.role === "admin" ? "Admin" : "Content Manager"}</small>
          </button>
          <a href="https://montessori-allgaeu.de" target="_blank" rel="noreferrer">
            Website ansehen ↗
          </a>
        </nav>
      </aside>
      {mobileNav && (
        <button
          className="nav-backdrop"
          aria-label="Menü schließen"
          onClick={() => setMobileNav(false)}
        />
      )}
      <main id="main-content" className="main-content" tabIndex={-1}>
        <div className={`topbar${editor ? " editing-topbar" : ""}`}>
          <label className="search-box">
            <span aria-hidden="true">⌕</span>
            <input
              type="search"
              aria-label="Inhalte durchsuchen"
              placeholder="Was möchtest du ändern?"
              value={query}
              onChange={(event) => {
                if (!query && !leaveEditor()) return;
                setQuery(event.currentTarget.value);
              }}
            />
          </label>
          <span className="topbar-note">Einmal pflegen. Überall aktuell.</span>
        </div>
        {((pendingCount > 0 && !(ongoing(currentChange) && pendingCount === 1)) ||
          failedCount > 0) &&
          area !== "Änderungen" && (
            <div className={`publication-notice${failedCount ? " failed" : ""}`} role="status">
              <span>
                {failedCount
                  ? `${failedCount === 1 ? "Eine gespeicherte Änderung konnte" : `${failedCount} gespeicherte Änderungen konnten`} nicht veröffentlicht werden.`
                  : "Gespeichert. Die Website wird im Hintergrund aktualisiert."}
              </span>
              <button className="text-button" onClick={() => navigate("Änderungen")}>
                {failedCount ? "Problem ansehen" : "Stand ansehen"}
              </button>
            </div>
          )}
        {error && (
          <div className="global-error" role="alert">
            <p>{error}</p>
            <button className="text-button" onClick={() => setError("")}>
              Schließen
            </button>
          </div>
        )}
        {!snapshot && !["Dein Zugang", "Zugänge"].includes(area) ? (
          <div className="page-content">
            <p role="status">Inhalte werden geladen …</p>
            {error && (
              <button
                className="button secondary"
                onClick={() => void refresh().catch((cause) => setError(errorText(cause)))}
              >
                Erneut laden
              </button>
            )}
          </div>
        ) : query ? (
          <section className="page-content">
            <p className="eyebrow">Schnell finden</p>
            <h1>Suchergebnisse</h1>
            <p className="page-intro">
              {matches.length} {matches.length === 1 ? "Treffer" : "Treffer"} für „{query}“
            </p>
            <div className="plain-list">
              {matches.map((record) => (
                <button
                  className="record-row search-result"
                  key={recordKey(record)}
                  onClick={() => openRecord(record)}
                >
                  <span>
                    <strong>
                      {titleOf(record.data, getContentDefinition(record.collection).label)}
                    </strong>
                    <small>
                      {getContentDefinition(record.collection).area} ·{" "}
                      {getContentDefinition(record.collection).label}
                      {!isVisible(record) ? " · Ausgeblendet" : ""}
                    </small>
                  </span>
                  <span aria-hidden="true">→</span>
                </button>
              ))}
            </div>
          </section>
        ) : area === "Dein Zugang" ? (
          <Profile session={session} />
        ) : area === "Zugänge" ? (
          session.user.role === "admin" ? (
            <Access session={session} />
          ) : (
            <section className="page-content">
              <h1>Zugänge</h1>
              <p>Dieser Bereich ist für Admins vorgesehen.</p>
            </section>
          )
        ) : area === "Änderungen" ? (
          <section className="page-content">
            <p className="eyebrow">Von der Änderung zur Website</p>
            <h1>Änderungen</h1>
            <p className="page-intro">
              Nach dem Speichern prüfen wir die Website und veröffentlichen sie automatisch.
            </p>
            <ChangeList
              changes={changes}
              onRetry={(change) => void retry(change)}
              onOpen={openSavedChange}
            />
          </section>
        ) : editor && definition ? (
          <section className="page-content editor-page">
            <button className="text-button back-link" onClick={() => navigate(area)}>
              ← {area}
            </button>
            <div className="editor-heading">
              <div>
                <p className="eyebrow">
                  {definition.label}
                  {editor.baseVersion === null ? " · Neu" : ""}
                </p>
                <h1>{titleOf(editor.data, definition.label)}</h1>
              </div>
            </div>
            <div className="save-controls" role="region" aria-label="Änderungen speichern">
              <span aria-live="polite" className="save-hint">
                {uploadsInProgress > 0
                  ? "Datei wird vorbereitet"
                  : ongoing(currentChange)
                    ? "Website wird aktualisiert"
                    : currentChange?.status === "failed" || currentChange?.status === "conflict"
                      ? "Gespeichert · Bitte Veröffentlichung prüfen"
                      : dirty
                        ? "Noch nicht gespeichert"
                        : currentChange?.status === "published"
                          ? "Auf der Website sichtbar"
                          : editor.baseVersion === null
                            ? "Neuen Eintrag ausfüllen"
                            : "Alles gespeichert"}
              </span>
              <button
                className="button"
                disabled={
                  saving ||
                  needsFileReselection ||
                  !dirty ||
                  currentChange?.status === "conflict" ||
                  currentChange?.status === "failed" ||
                  !!conflict
                }
                onClick={() => void save()}
              >
                {uploadsInProgress > 0
                  ? "Datei lädt …"
                  : busy
                    ? "Wird gespeichert …"
                    : ongoing(currentChange) || (currentChange && !dirty)
                      ? "Gespeichert ✓"
                      : "Speichern"}
              </button>
            </div>
            {usage && (
              <div className="used-on">
                {usage.pages.length > 0 && (
                  <>
                    Verknüpft mit:{" "}
                    {usage.pages.map((page, index) => (
                      <span key={page.href}>
                        {index > 0 && " · "}
                        <a
                          href={`https://montessori-allgaeu.de${page.href}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {page.label} ↗
                        </a>
                      </span>
                    ))}
                  </>
                )}
                {usage.note && <span>{usage.note}</span>}
                {dirty && usage.pages.length > 0 && (
                  <span className="usage-note">Links zeigen den veröffentlichten Stand.</span>
                )}
              </div>
            )}
            {currentChange && (
              <div className={`operation-banner ${currentChange.status}`} role="status">
                <strong>{statusLabels[currentChange.status]}</strong>
                {ongoing(currentChange) && (
                  <>
                    <p>
                      Du kannst jetzt weiterarbeiten oder diese Seite schließen. Auf der Website
                      erscheint die Änderung automatisch in etwa 2–3 Minuten. Diesen Eintrag kannst
                      du danach wieder bearbeiten.
                    </p>
                    <button className="text-button" onClick={() => navigate(area)}>
                      Zurück zu {area} →
                    </button>
                  </>
                )}
                {currentChange.error && <p>{currentChange.error}</p>}
                {currentChange.status === "failed" && (
                  <div className="row-actions">
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() => void retry(currentChange)}
                    >
                      Erneut versuchen
                    </button>
                    <button
                      className="text-button"
                      onClick={() =>
                        setEditor({
                          ...editor,
                          pendingMedia: {},
                          original:
                            snapshot?.records.find(
                              (record) => recordKey(record) === recordKey(editor),
                            )?.data ?? {},
                          operationId: undefined,
                          requestId: crypto.randomUUID(),
                        })
                      }
                    >
                      Eingaben überarbeiten
                    </button>
                  </div>
                )}
                {currentChange.status === "conflict" && (
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => void resolveConflict()}
                  >
                    Änderungen vergleichen
                  </button>
                )}
              </div>
            )}
            {needsFileReselection && (
              <p className="operation-banner" role="alert">
                Bitte wähle die Datei noch einmal aus, bevor du diese überarbeitete Änderung
                speicherst. Deine Texte bleiben erhalten. Die vorherige Datei gehört zum
                ursprünglichen Veröffentlichungsauftrag.
              </p>
            )}
            {fieldErrors.length > 0 && (
              <div className="error" role="alert">
                <strong>Bitte prüfe diese Angaben:</strong>
                <ul>
                  {fieldErrors.map((item, index) => (
                    <li key={index}>{item.message}</li>
                  ))}
                </ul>
              </div>
            )}
            {conflict && (
              <ConflictEditor
                latest={conflict}
                local={editor}
                onCancel={() => setConflict(null)}
                onResolve={(data) => {
                  setEditor({
                    ...editor,
                    data,
                    original: conflict.data,
                    baseVersion: conflict.version,
                    mediaVersions: conflictMediaVersions,
                    pendingMedia: editor.operationId ? {} : editor.pendingMedia,
                    operationId: undefined,
                    requestId: crypto.randomUUID(),
                  });
                  setConflict(null);
                }}
              />
            )}
            {templates.length > 0 && (
              <details className="event-templates">
                <summary>Ähnlichen Termin übernehmen</summary>
                <p className="hint">
                  Titel, Kategorie, Uhrzeit, Ort und Beschreibung übernehmen. Dein ausgewähltes
                  Datum bleibt erhalten.
                </p>
                <label>
                  Vorhandenen Termin auswählen
                  <select
                    aria-label="Termin als Vorlage"
                    value=""
                    disabled={editingLocked}
                    onChange={(event) => {
                      const source = templates.find(
                        (record) => record.id === event.currentTarget.value,
                      );
                      if (!source) return;
                      const owner = recordKey(editor);
                      setEditor((current) =>
                        current && recordKey(current) === owner
                          ? {
                              ...current,
                              data: {
                                ...current.data,
                                ...Object.fromEntries(
                                  ["title", "category", "time", "location", "description"].map(
                                    (key) => [key, source.data[key]],
                                  ),
                                ),
                              },
                              requestId: crypto.randomUUID(),
                            }
                          : current,
                      );
                    }}
                  >
                    <option value="">Bitte auswählen …</option>
                    {templates.map((record) => (
                      <option key={record.id} value={record.id}>
                        {titleOf(record.data)} · {eventDate(String(record.data.date))}
                      </option>
                    ))}
                  </select>
                </label>
              </details>
            )}
            {editor.collection === "events" &&
              typeof editor.data.date === "string" &&
              editor.data.date &&
              editor.data.date < today() && (
                <p className="editor-notice">
                  Dieser Termin liegt in der Vergangenheit. Prüfe das Datum, wenn du einen neuen
                  Termin ankündigen möchtest.
                </p>
              )}
            <div
              className={`editor-fields${editor.collection === "events" ? " event-fields" : ""}`}
            >
              {definition.fields
                .filter((field) => field.key !== "visible" && field.key !== "position")
                .filter((field) => !field.optional || editor.original[field.key] !== undefined)
                .map((field) => (
                  <EditableField
                    key={`${recordKey(editor)}:${field.key}`}
                    field={field}
                    value={editor.data[field.key]}
                    onChange={(value) => updateField(recordKey(editor), field.key, value)}
                    collection={editor.collection}
                    role={session.user.role}
                    originalValue={editor.original[field.key]}
                    mediaVersions={editor.mediaVersions}
                    onUpload={(upload, path) => acceptUpload(recordKey(editor), path, upload)}
                    onDiscardUpload={(path) => discardUpload(recordKey(editor), path)}
                    context={editor.data}
                    onUploadBusy={uploadBusy}
                    previews={previews}
                    disabled={editingLocked || !!conflict}
                  />
                ))}
              {definition.fields.some(
                (field) => field.optional && editor.original[field.key] === undefined,
              ) && (
                <details className="optional-fields">
                  <summary>Weitere Angaben ergänzen</summary>
                  {definition.fields
                    .filter(
                      (field) =>
                        field.optional &&
                        editor.original[field.key] === undefined &&
                        field.key !== "visible",
                    )
                    .map((field) => (
                      <EditableField
                        key={`${recordKey(editor)}:${field.key}`}
                        field={field}
                        value={editor.data[field.key]}
                        onChange={(value) => updateField(recordKey(editor), field.key, value)}
                        collection={editor.collection}
                        role={session.user.role}
                        originalValue={editor.original[field.key]}
                        mediaVersions={editor.mediaVersions}
                        onUpload={(upload, path) => acceptUpload(recordKey(editor), path, upload)}
                        onDiscardUpload={(path) => discardUpload(recordKey(editor), path)}
                        context={editor.data}
                        onUploadBusy={uploadBusy}
                        previews={previews}
                        disabled={editingLocked}
                      />
                    ))}
                </details>
              )}
            </div>
            {!definition.singleton && editor.baseVersion !== null && (
              <div className="record-actions">
                <button
                  className="button secondary"
                  disabled={saving || pendingUploads.length > 0}
                  title={
                    pendingUploads.length > 0
                      ? "Bitte die Dateiänderung zuerst speichern oder zurücksetzen."
                      : undefined
                  }
                  onClick={() =>
                    newRecord(editor.collection, {
                      collection: editor.collection,
                      id: editor.id,
                      version: editor.baseVersion ?? "",
                      data: editor.data,
                    })
                  }
                >
                  Als Vorlage verwenden
                </button>
                <button
                  className="text-button danger-text"
                  disabled={editingLocked}
                  onClick={() => {
                    if (
                      window.confirm(
                        editor.data.visible === false
                          ? "Diesen Eintrag wieder auf der Website anzeigen? Bitte anschließend speichern."
                          : "Diesen Eintrag ausblenden? Er bleibt in der Verwaltung erhalten. Bitte anschließend speichern.",
                      )
                    )
                      updateField(recordKey(editor), "visible", editor.data.visible === false);
                  }}
                >
                  {editor.data.visible === false ? "Wieder einblenden" : "Ausblenden"}
                </button>
              </div>
            )}
          </section>
        ) : yearPlan ? (
          <section className="page-content editor-page">
            <button className="text-button back-link" onClick={() => navigate(area)}>
              ← Ganztag & Essen
            </button>
            <p className="eyebrow">Nachmittagsprogramm übernehmen</p>
            <div className="editor-heading">
              <h1>Neues Schuljahr</h1>
            </div>
            <div className="save-controls" role="region" aria-label="Änderungen speichern">
              <span className="save-hint" aria-live="polite">
                {yearPlan.operationId
                  ? statusLabels[yearChange?.status ?? "checking"]
                  : "Angebote prüfen und gemeinsam speichern"}
              </span>
              <button
                className="button"
                disabled={busy || !!ongoing(yearChange) || !!yearPlan.operationId}
                onClick={() => void saveYearPlan()}
              >
                {busy
                  ? "Wird gespeichert …"
                  : yearPlan.operationId
                    ? "Gespeichert ✓"
                    : "Programm speichern"}
              </button>
            </div>
            <p className="page-intro">
              Prüfe die übernommenen Angebote. Beim Speichern wechseln alle Angebote und das aktive
              Schuljahr gemeinsam. Bisherige Schuljahre bleiben erhalten.
            </p>
            {yearChange && (
              <div className={`operation-banner ${yearChange.status}`} role="status">
                {statusLabels[yearChange.status]}
                {ongoing(yearChange) && (
                  <>
                    <p>
                      Du kannst weiterarbeiten oder die Seite schließen. Das Programm wird im
                      Hintergrund veröffentlicht.
                    </p>
                    <button className="text-button" onClick={() => navigate(area)}>
                      Zurück zu Ganztag & Essen →
                    </button>
                  </>
                )}
                {yearChange.error && <p>{yearChange.error}</p>}
                {yearChange.status === "failed" && (
                  <div className="row-actions">
                    <button className="text-button" onClick={() => void retry(yearChange)}>
                      Erneut versuchen
                    </button>
                    <button
                      className="text-button"
                      onClick={() =>
                        setYearPlan({
                          ...yearPlan,
                          operationId: undefined,
                          requestId: crypto.randomUUID(),
                        })
                      }
                    >
                      Eingaben überarbeiten
                    </button>
                  </div>
                )}
                {yearChange.status === "conflict" && (
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => void refreshYearSettings()}
                  >
                    Aktuelle Einstellungen laden und meine Angebote behalten
                  </button>
                )}
              </div>
            )}
            {error && (
              <button
                className="text-button"
                disabled={busy}
                onClick={() => void refreshYearSettings()}
              >
                Aktuelle Einstellungen laden und meine Angebote behalten
              </button>
            )}
            <label className="year-input">
              Neues Schuljahr
              <input
                value={yearPlan.year}
                disabled={!!yearPlan.operationId}
                onChange={(event) =>
                  setYearPlan({
                    ...yearPlan,
                    year: event.currentTarget.value,
                    requestId: crypto.randomUUID(),
                  })
                }
              />
            </label>
            {yearPlan.offers.map((offer, index) => (
              <details className="year-offer" key={offer.id}>
                <summary>
                  {titleOf(offer.data)} <span>{String(offer.data.weekday ?? "")}</span>
                </summary>
                <div className="year-offer-fields">
                  {getContentDefinition("afternoonOffers")
                    .fields.filter(
                      (field) => !["schoolYear", "position", "visible"].includes(field.key),
                    )
                    .map((field) => (
                      <div className="input-field" key={field.key}>
                        <div className="field-label">{field.label}</div>
                        <FieldInput
                          field={field}
                          value={offer.data[field.key]}
                          onChange={(value) => {
                            const data = { ...offer.data };
                            if (value === undefined) delete data[field.key];
                            else data[field.key] = value;
                            setYearPlan({
                              ...yearPlan,
                              offers: yearPlan.offers.map((item, position) =>
                                position === index ? { ...item, data } : item,
                              ),
                              requestId: crypto.randomUUID(),
                            });
                          }}
                          collection="afternoonOffers"
                          role={session.user.role}
                          onUpload={() => {}}
                          previews={previews}
                          disabled={!!yearPlan.operationId}
                        />
                      </div>
                    ))}
                  <button
                    className="text-button danger-text"
                    disabled={!!yearPlan.operationId}
                    onClick={() =>
                      setYearPlan({
                        ...yearPlan,
                        offers: yearPlan.offers.filter((_, position) => position !== index),
                        requestId: crypto.randomUUID(),
                      })
                    }
                  >
                    Nicht übernehmen
                  </button>
                </div>
              </details>
            ))}
            <button
              className="button secondary"
              disabled={!!yearPlan.operationId}
              onClick={() => {
                const data = getContentDefinition("afternoonOffers").defaults({
                  schoolYear: yearPlan.year,
                  position: yearPlan.offers.length + 1,
                });
                setYearPlan({
                  ...yearPlan,
                  offers: [
                    ...yearPlan.offers,
                    { collection: "afternoonOffers", id: makeId(data), baseVersion: null, data },
                  ],
                  requestId: crypto.randomUUID(),
                });
              }}
            >
              + Angebot hinzufügen
            </button>
          </section>
        ) : area === "Übersicht" ? (
          <section className="page-content dashboard">
            <p className="eyebrow">Monte-Verwaltung</p>
            <h1>Was steht heute an?</h1>
            <p className="page-intro">
              Inhalte ändern, speichern, fertig. Die Veröffentlichung läuft automatisch.
            </p>
            <div className="quick-actions">
              <button className="button" onClick={() => newRecord("events")}>
                + Termin hinzufügen
              </button>
              <button className="button secondary" onClick={() => navigate("Downloads")}>
                PDF ersetzen
              </button>
              <button className="button secondary" onClick={() => navigate("Menschen")}>
                Team aktualisieren
              </button>
            </div>
            <div className="dashboard-columns">
              <section aria-labelledby="recent-heading">
                <div className="section-heading">
                  <h2 id="recent-heading">Zuletzt bearbeitet</h2>
                  <button className="text-button" onClick={() => navigate("Änderungen")}>
                    Alle Änderungen →
                  </button>
                </div>
                <div className="record-list">
                  {recent.length ? (
                    recent.map(({ record, change, mutation }) => (
                      <button
                        className="record-row dashboard-row"
                        key={recordKey(record)}
                        onClick={() => {
                          if (
                            mutation &&
                            (change.status === "failed" || change.status === "conflict")
                          )
                            openSavedChange(change, mutation);
                          else openRecord(record);
                        }}
                      >
                        <span>
                          <strong>
                            {titleOf(
                              mutation?.data ?? record.data,
                              getContentDefinition(record.collection).label,
                            )}
                          </strong>
                          <small>
                            {getContentDefinition(record.collection).label} ·{" "}
                            {new Date(change.createdAt).toLocaleString("de-DE", {
                              day: "numeric",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                              timeZone: "Europe/Berlin",
                            })}
                          </small>
                          {change.status !== "published" && (
                            <small className={`change-state ${change.status}`}>
                              {statusLabels[change.status]}
                            </small>
                          )}
                          {!isVisible(record) && <small>Ausgeblendet</small>}
                        </span>
                        <span className="record-arrow" aria-hidden="true">
                          →
                        </span>
                      </button>
                    ))
                  ) : (
                    <p className="empty-state">
                      Hier erscheinen Inhalte, sobald jemand aus dem Team speichert.
                    </p>
                  )}
                </div>
              </section>
              <section aria-labelledby="upcoming-heading">
                <div className="section-heading">
                  <h2 id="upcoming-heading">Nächste Termine</h2>
                  <button className="text-button" onClick={() => navigate("Termine")}>
                    Alle Termine →
                  </button>
                </div>
                <div className="record-list">
                  {upcoming.length ? (
                    upcoming.map((record) => (
                      <button
                        className="record-row dashboard-row"
                        key={recordKey(record)}
                        onClick={() => openRecord(record)}
                      >
                        <span>
                          <small className="event-date">
                            <time dateTime={String(record.data.date)}>
                              {eventDate(String(record.data.date))}
                            </time>
                            {record.data.time ? ` · ${record.data.time}` : ""}
                          </small>
                          <strong>{titleOf(record.data)}</strong>
                          {record.data.location ? (
                            <small>{String(record.data.location)}</small>
                          ) : null}
                          {pendingChange(record, changes) && (
                            <small>Gespeichert · Website wird aktualisiert</small>
                          )}
                        </span>
                        <span className="record-arrow" aria-hidden="true">
                          →
                        </span>
                      </button>
                    ))
                  ) : (
                    <p className="empty-state">
                      Noch keine kommenden Termine. Über „Termin hinzufügen“ legst du den nächsten
                      an.
                    </p>
                  )}
                </div>
              </section>
            </div>
          </section>
        ) : (
          <section className="page-content">
            <p className="eyebrow">Website pflegen</p>
            <h1>{area}</h1>
            <p className="page-intro">{areaDescriptions[area]}</p>
            <div className="collection-tools">
              {areaDefinitions.some((item) => !item.singleton) && (
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={archive}
                    onChange={(event) => setArchive(event.currentTarget.checked)}
                  />
                  Ausgeblendete anzeigen
                </label>
              )}
              {area === "Termine" && (
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={past}
                    onChange={(event) => setPast(event.currentTarget.checked)}
                  />
                  Vergangene anzeigen
                </label>
              )}
              {area === "Ganztag & Essen" && (
                <button
                  className="button secondary"
                  disabled={changes.some(
                    (change) =>
                      ongoing(change) &&
                      change.saved?.mutations.some(
                        (mutation) => mutation.collection === "afternoonProgramSettings",
                      ),
                  )}
                  onClick={startYearPlan}
                >
                  Programm für neues Schuljahr übernehmen
                </button>
              )}
            </div>
            {area === "Ganztag & Essen" && (
              <label className="year-filter">
                Angebote für
                <select
                  value={offerYear || currentYear}
                  onChange={(event) => setOfferYear(event.currentTarget.value)}
                >
                  {[
                    ...new Set(
                      recordList
                        .filter((record) => record.collection === "afternoonOffers")
                        .map((record) => String(record.data.schoolYear ?? "")),
                    ),
                  ]
                    .sort()
                    .reverse()
                    .map((year) => (
                      <option key={year} value={year}>
                        {year}
                        {year === currentYear ? " · Aktuelles Programm" : ""}
                      </option>
                    ))}
                </select>
              </label>
            )}
            {areaDefinitions.map((item) => {
              let records = recordList
                .filter((record) => record.collection === item.collection)
                .filter((record) => archive || isVisible(record));
              if (item.collection === "events" && !past)
                records = records.filter((record) => String(record.data.date ?? "") >= today());
              records = [...records].sort((left, right) =>
                item.collection === "events"
                  ? String(left.data.date).localeCompare(String(right.data.date))
                  : Number(left.data.position ?? 0) - Number(right.data.position ?? 0) ||
                    titleOf(left.data).localeCompare(titleOf(right.data), "de"),
              );
              if (item.collection === "afternoonOffers")
                records = records.filter(
                  (record) => record.data.schoolYear === (offerYear || currentYear),
                );
              const canSort =
                item.fields.some((field) => field.key === "position") &&
                !archive &&
                records.length > 1;
              const sortable = canSort && sortingCollection === item.collection;
              if (item.singleton)
                return (
                  <div className="singleton-section" key={item.collection}>
                    {records[0] ? (
                      <button className="singleton-link" onClick={() => openRecord(records[0])}>
                        <div>
                          <h2>{item.label}</h2>
                          <p>
                            {contentUsage(records[0], recordList)
                              .pages.map((page) => page.label)
                              .join(" · ")}
                          </p>
                        </div>
                        <span aria-hidden="true">→</span>
                      </button>
                    ) : (
                      <p className="error">{item.label} konnte nicht geladen werden.</p>
                    )}
                  </div>
                );
              return (
                <section className="collection-section" key={item.collection}>
                  <div className="section-heading">
                    <h2>
                      {item.label}
                      <span className="subtle count">{records.length}</span>
                    </h2>
                    <div className="row-actions">
                      {canSort && (
                        <button
                          className="text-button"
                          aria-pressed={sortable}
                          onClick={() => {
                            setSortingCollection(sortable ? null : item.collection);
                            setDragged(null);
                          }}
                        >
                          {sortable ? "Sortierung beenden" : "Reihenfolge ändern"}
                        </button>
                      )}
                      <button
                        className="button secondary"
                        onClick={() => newRecord(item.collection)}
                      >
                        + Hinzufügen
                      </button>
                    </div>
                  </div>
                  {sortable && (
                    <p className="hint">
                      Mit den Pfeilen verschieben. Jede Änderung wird direkt gespeichert.
                    </p>
                  )}
                  {!records.length ? (
                    <p className="empty-state">
                      {item.collection === "events"
                        ? "Keine kommenden Termine. Vergangene Termine lassen sich oben einblenden."
                        : "Hier sind noch keine sichtbaren Einträge."}
                    </p>
                  ) : (
                    <div className="record-list">
                      {records.map((record, index) => (
                        <article
                          className={`record-item${!isVisible(record) ? " hidden-record" : ""}`}
                          key={recordKey(record)}
                          onDragOver={(event) => {
                            if (dragged) event.preventDefault();
                          }}
                          onDrop={(event) => {
                            event.preventDefault();
                            const from = records.findIndex((entry) => recordKey(entry) === dragged);
                            if (from >= 0 && sortable) void moveRecord(records, from, index);
                            setDragged(null);
                          }}
                        >
                          <button className="record-row" onClick={() => openRecord(record)}>
                            {typeof record.data.image === "string" && (
                              <ProfileThumbnail
                                src={
                                  pendingChange(record, changes)?.saved?.previews[
                                    record.data.image
                                  ] ?? thumbnails[snapshot?.mediaVersions[record.data.image] ?? ""]
                                }
                              />
                            )}
                            <span>
                              <strong>{titleOf(record.data)}</strong>
                              <small>
                                {[
                                  record.data.date
                                    ? eventDate(String(record.data.date))
                                    : undefined,
                                  record.data.time,
                                  record.data.area,
                                  record.data.weekday,
                                  record.data.schoolYear,
                                  record.data.role,
                                  record.data.group,
                                ]
                                  .filter(Boolean)
                                  .map(String)
                                  .join(" · ")}
                                {item.collection === "afternoonOffers" &&
                                record.data.schoolYear !== currentYear
                                  ? " · Früheres / anderes Schuljahr"
                                  : ""}
                                {!isVisible(record) ? " · Ausgeblendet" : ""}
                              </small>
                            </span>
                            <span className="record-arrow" aria-hidden="true">
                              →
                            </span>
                          </button>
                          {item.collection === "downloads" && (
                            <PdfReplaceInput
                              title={titleOf(record.data)}
                              disabled={
                                busy || uploadsInProgress > 0 || !!pendingChange(record, changes)
                              }
                              onSelect={(file) => void replacePdf(record, file)}
                            />
                          )}
                          {sortable && (
                            <div className="sort-controls">
                              <span
                                className="drag-handle"
                                draggable={!busy}
                                onDragStart={() => setDragged(recordKey(record))}
                                onDragEnd={() => setDragged(null)}
                                title="Zum Verschieben ziehen"
                                aria-hidden="true"
                              >
                                ⋮⋮
                              </span>
                              <button
                                className="icon-button"
                                disabled={busy || index === 0 || pendingCount > 0}
                                aria-label={`${titleOf(record.data)} nach oben`}
                                onClick={() => void moveRecord(records, index, index - 1)}
                              >
                                ↑
                              </button>
                              <button
                                className="icon-button"
                                disabled={busy || index === records.length - 1 || pendingCount > 0}
                                aria-label={`${titleOf(record.data)} nach unten`}
                                onClick={() => void moveRecord(records, index, index + 1)}
                              >
                                ↓
                              </button>
                            </div>
                          )}
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </section>
        )}
      </main>
    </div>
  );
}

function ConflictEditor({
  latest,
  local,
  onResolve,
  onCancel,
}: {
  latest: ContentRecord;
  local: EditState;
  onResolve: (data: ContentData) => void;
  onCancel: () => void;
}) {
  const [selection, setSelection] = useState<Record<string, "latest" | "local">>({});
  const definition = getContentDefinition(local.collection);
  const changed = definition.fields.filter(
    (field) => JSON.stringify(local.data[field.key]) !== JSON.stringify(latest.data[field.key]),
  );
  const unresolved = changed.filter((field) => !selection[field.key]);
  return (
    <section className="conflict-panel">
      <h2>Gemeinsam auf den aktuellen Stand bringen</h2>
      <p>
        Deine Eingaben sind erhalten. Wähle für jede abweichende Angabe den gewünschten Stand.
        Anschließend kannst du speichern.
      </p>
      {changed.map((field) => (
        <fieldset key={field.key}>
          <legend>{field.label}</legend>
          <label>
            <input
              type="radio"
              name={`conflict-${field.key}`}
              checked={selection[field.key] === "latest"}
              onChange={() => setSelection({ ...selection, [field.key]: "latest" })}
            />
            <span>
              <strong>Aktueller Stand</strong>
              <span>{humanValue(latest.data[field.key])}</span>
            </span>
          </label>
          <label>
            <input
              type="radio"
              name={`conflict-${field.key}`}
              checked={selection[field.key] === "local"}
              onChange={() => setSelection({ ...selection, [field.key]: "local" })}
            />
            <span>
              <strong>Deine Eingabe</strong>
              <span>{humanValue(local.data[field.key])}</span>
            </span>
          </label>
        </fieldset>
      ))}
      <div className="row-actions">
        <button
          className="button"
          disabled={unresolved.length > 0}
          onClick={() => {
            const data = structuredClone(latest.data);
            for (const field of changed)
              if (selection[field.key] === "local") {
                if (local.data[field.key] === undefined) delete data[field.key];
                else data[field.key] = local.data[field.key];
              }
            onResolve(data);
          }}
        >
          Auswahl übernehmen
        </button>
        <button className="text-button" onClick={onCancel}>
          Später entscheiden
        </button>
      </div>
    </section>
  );
}
