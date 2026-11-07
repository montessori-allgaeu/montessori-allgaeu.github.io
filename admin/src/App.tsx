import { useCallback, useEffect, useReducer, useRef, useState } from "react";
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
  canDeleteContent,
  contentDefinitions,
  getContentDefinition,
  type EditorField,
} from "../../src/admin/content-model";
import {
  contentSections,
  reorderMutations,
  transferMutations,
  type ContentSection,
  type ContentListEntry,
} from "../../src/admin/content-sections";
import { api, errorText, RequestError } from "./api";
import { contentUsage } from "../../src/admin/content-usage";
import { FieldInput, humanValue, EditableField, PdfReplaceInput } from "./Editor";
import { ContentEditor } from "./ContentEditor";
import { AfternoonWeek } from "./AfternoonWeek";
import { SortableRecordList } from "./SortableRecordList";
import { PeopleTransferProvider } from "./PeopleTransfer";
import { PublicationNotice } from "./PublicationNotice";
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
import { stagedUploads, mediaPreviews, needsReselection, uploadMedia, mediaValueAt } from "./media";
import { loadProfileThumbnails, ProfileThumbnail } from "./ProfileThumbnail";
import {
  closedEditor,
  editorReducer,
  editorChange,
  editorDirty,
  editorLocked,
  editorUploads,
  openEditor,
  type EditState,
} from "./editor-machine";

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
const changeStatusLabel = (change: Change) =>
  change.deleted && change.status === "published"
    ? "Von der Website entfernt"
    : statusLabels[change.status];
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
    for (const mutation of change.saved?.mutations ?? []) {
      if (mutation.delete) result.delete(recordKey(mutation));
      else result.set(recordKey(mutation), { ...mutation, version: mutation.baseVersion ?? "" });
    }
  }
  return [...result.values()];
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
              <p className={`change-state ${change.status}`}>{changeStatusLabel(change)}</p>
              {change.error && <p className="error-detail">{change.error}</p>}
              {change.retry?.reason === "uploads_expired" && (
                <p className="error-detail">
                  Die Datei ist abgelaufen. Öffne die gespeicherten Eingaben und wähle die Datei
                  erneut aus.
                </p>
              )}
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
              <button
                className="text-button"
                disabled={change.retry?.available === false}
                onClick={() => onRetry(change)}
              >
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
  const [movingPeople, setMovingPeople] = useState<ContentMutation[]>([]);
  const transferring = useRef(false);
  const [seenFailures, setSeenFailures] = useState(readSeenFailures);
  const [area, setArea] = useState(initialArea);
  const [query, setQuery] = useState("");
  const [editorState, dispatchEditor] = useReducer(editorReducer, closedEditor);
  const editor = editorState.status === "open" ? editorState.editor : null;
  const [yearPlan, setYearPlan] = useState<YearPlan | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [past, setPast] = useState(false);
  const [offerYear, setOfferYear] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ path: string; message: string }[]>([]);
  const [invite, setInvite] = useState<string | null>(capturedInvite);
  const editorRef = useRef(editor);
  editorRef.current = editor;
  const changesRef = useRef(changes);
  changesRef.current = changes;
  const pendingUploads = editor ? stagedUploads(editor.media, editor.data) : [];
  const previews = editor ? mediaPreviews(editor.media, editor.data) : {};
  const dirty = editorDirty(editor);
  const currentChange = editorChange(editor);
  const uploadsInProgress = editorUploads(editor);
  const saving = busy || uploadsInProgress > 0 || !!ongoing(currentChange);
  const editingLocked = busy || editorLocked(editor);
  const conflict = editor?.phase.status === "comparing" ? editor.phase.latest : null;
  const needsFileReselection = !!editor && needsReselection(editor.media, editor.data);
  const uploadBusy = (uploading: boolean, owner = editor ? recordKey(editor) : "") => {
    dispatchEditor(
      uploading
        ? { type: "uploadStarted", owner, requestId: crypto.randomUUID() }
        : { type: "uploadFinished", owner },
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
          dispatchEditor({
            type: "open",
            editor: openEditor(
              match,
              content.mediaVersions,
              pendingChange(match, changesRef.current),
            ),
          });
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
          dispatchEditor({ type: "changes", changes: result.changes, content });
          setYearPlan((plan) =>
            plan &&
            result.changes.find((change) => change.id === plan.operationId)?.status === "published"
              ? null
              : plan,
          );
        }
        dispatchEditor({ type: "changes", changes: result.changes });
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
      if ((dirty && !editorChange(editor)) || (yearPlan && !yearPlan.operationId))
        event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, currentChange?.id, yearPlan]);

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
      ((dirty && !editorChange(editor)) || (yearPlan && !yearPlan.operationId)) &&
      !window.confirm(
        "Du hast noch nicht gespeicherte Änderungen. Diesen Bereich trotzdem verlassen?",
      )
    )
      return false;
    dispatchEditor({ type: "close" });
    setYearPlan(null);
    setFieldErrors([]);
    setError("");
    return true;
  }
  function navigate(next: string) {
    if (!leaveEditor()) return;
    setArea(next);
    setQuery("");
    setPast(false);
    setOfferYear("");
    setMobileNav(false);
    history.replaceState(null, "", location.pathname);
    window.scrollTo(0, 0);
  }
  function openRecord(record: ContentRecord) {
    if (!leaveEditor()) return false;
    setArea(getContentDefinition(record.collection).area);
    dispatchEditor({
      type: "open",
      editor: openEditor(record, snapshot?.mediaVersions ?? {}, pendingChange(record, changes)),
    });
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
    uploadBusy(true, owner);
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
      uploadBusy(false, owner);
    }
  }
  async function openSavedChange(change: Change, mutation: ContentMutation) {
    if (!leaveEditor()) return;
    if (mutation.delete) {
      try {
        const content = await refresh();
        const record = content.records.find((item) => recordKey(item) === recordKey(mutation));
        if (record) openRecord(record);
        else setError("Dieser Eintrag ist bereits gelöscht.");
      } catch (cause) {
        setError(errorText(cause));
      }
      return;
    }
    setArea(getContentDefinition(mutation.collection).area);
    setQuery("");
    dispatchEditor({
      type: "open",
      editor: openEditor(
        { ...mutation, version: mutation.baseVersion ?? "" },
        snapshot?.mediaVersions ?? {},
        change,
      ),
    });
  }

  function newRecord(
    collection: ContentCollection,
    source?: ContentRecord,
    newValues?: ContentData,
  ) {
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
    }
    if (newValues) Object.assign(data, newValues);
    const id = makeId(data);
    setArea(definition.area);
    const next = openEditor({ collection, id, version: "", data }, {});
    if (source) next.original = {};
    dispatchEditor({ type: "open", editor: next });
    setQuery("");
  }
  function updateField(owner: string, key: string, value: JsonValue | undefined) {
    const current = editorRef.current;
    if (!current || recordKey(current) !== owner) return;
    const data = { ...current.data };
    if (value === undefined) delete data[key];
    else data[key] = value;
    dispatchEditor({ type: "edit", owner, data, requestId: crypto.randomUUID() });
    setFieldErrors([]);
  }
  function acceptUpload(owner: string, path: string[], upload: UploadResult) {
    dispatchEditor({ type: "selectMedia", owner, path, upload, requestId: crypto.randomUUID() });
  }
  function discardUpload(owner: string, path: string[]) {
    dispatchEditor({ type: "discardMedia", owner, path, requestId: crypto.randomUUID() });
  }
  async function submit(mutations: ContentMutation[], uploadIds: string[], requestId: string) {
    dispatchEditor({
      type: "submit",
      requestId,
      intent: mutations.some((mutation) => mutation.delete) ? "delete" : "save",
    });
    setBusy(true);
    setError("");
    setFieldErrors([]);
    try {
      const accepted = await api.post<Change>("/changes", { requestId, mutations, uploadIds });
      const change = {
        ...accepted,
        saved: accepted.saved ?? { mutations, previews, hasUploads: uploadIds.length > 0 },
      };
      dispatchEditor({ type: "accepted", requestId, change });
      setChanges((current) => [change, ...current.filter((item) => item.id !== change.id)]);
      return change;
    } catch (cause) {
      setError(errorText(cause));
      if (cause instanceof RequestError) {
        setFieldErrors(cause.detail.fields ?? []);
        if (cause.status === 409 && editorRef.current?.requestId === requestId) {
          const current = editorRef.current;
          try {
            const latest = await api.request<EditableContentSnapshot>("/content");
            const record = latest.records.find((entry) => recordKey(entry) === recordKey(current));
            if (mutations.some((mutation) => mutation.delete)) {
              setSnapshot(latest);
              dispatchEditor(
                record
                  ? { type: "open", editor: openEditor(record, latest.mediaVersions) }
                  : { type: "close" },
              );
            } else if (record) {
              dispatchEditor({
                type: "compare",
                owner: recordKey(current),
                latest: record,
                mediaVersions: latest.mediaVersions,
              });
            }
          } catch {
            /* Keep the original conflict and all user input visible. */
          }
        }
      }
      return null;
    } finally {
      dispatchEditor({ type: "rejected", requestId });
      setBusy(false);
    }
  }
  async function deleteRecord() {
    if (!editor || !canDeleteContent(editor) || editor.baseVersion === null) return;
    if (
      !window.confirm(
        `„${titleOf(editor.data)}“ löschen? Der Eintrag wird aus der Verwaltung und von der Website entfernt. Nicht gespeicherte Änderungen werden verworfen.`,
      )
    )
      return;
    const change = await submit(
      [
        {
          collection: editor.collection,
          id: editor.id,
          baseVersion: editor.baseVersion,
          data: editor.original,
          delete: true,
        },
      ],
      [],
      editor.requestId,
    );
    if (change) {
      dispatchEditor({ type: "close" });
      history.replaceState(null, "", location.pathname);
      window.scrollTo(0, 0);
    }
  }
  async function save() {
    if (!editor || needsFileReselection) return;
    await submit(
      [
        {
          collection: editor.collection,
          id: editor.id,
          baseVersion: editor.baseVersion,
          data: editor.data,
        },
      ],
      stagedUploads(editor.media, editor.data).map((upload) => upload.id),
      editor.requestId,
    );
  }
  async function retry(change: Change) {
    if (change.retry?.available === false) return;
    setBusy(true);
    setError("");
    try {
      const accepted = await api.post<Change>(`/changes/${encodeURIComponent(change.id)}/retry`);
      dispatchEditor({ type: "changes", changes: [accepted] });
      const result = await api.request<{ changes: Change[] }>("/changes");
      dispatchEditor({ type: "changes", changes: result.changes });
      setChanges(result.changes);
    } catch (cause) {
      setError(errorText(cause));
      if (cause instanceof RequestError && cause.detail.code === "uploads_expired") {
        const expired: Change = {
          ...change,
          retry: { available: false, reason: "uploads_expired" },
        };
        setChanges((current) => current.map((item) => (item.id === change.id ? expired : item)));
        dispatchEditor({ type: "changes", changes: [expired] });
      }
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
      dispatchEditor({
        type: "compare",
        owner: recordKey(editor),
        latest,
        mediaVersions: content.mediaVersions,
      });
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }
  async function moveRecord(entries: ContentListEntry[], from: number, to: number) {
    if (
      from === to ||
      to < 0 ||
      to >= entries.length ||
      busy ||
      changes.some((change) => ongoing(change))
    )
      return false;
    const change = await submit(reorderMutations(entries, from, to), [], crypto.randomUUID());
    if (change) setError("");
    return !!change;
  }
  async function transferPeople(
    source: ContentSection,
    target: ContentSection,
    key: string,
    index: number,
  ) {
    if (busy || transferring.current || changesRef.current.some(ongoing)) return;
    transferring.current = true;
    try {
      const mutations = transferMutations(source, target, key, index);
      setMovingPeople(mutations);
      await submit(mutations, [], crypto.randomUUID());
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setMovingPeople([]);
      transferring.current = false;
    }
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
        (record) => record.collection === "afternoonOffers" && record.data.schoolYear === active,
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
  const recordList = editorialRecords(snapshot?.records ?? [], changes).map((record) => {
    const mutation = movingPeople.find((item) => recordKey(item) === recordKey(record));
    return mutation ? { ...record, data: mutation.data } : record;
  });
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

  function renderEditorField(field: EditorField, path: string[] = [field.key]) {
    if (!editor || !session) return null;
    const owner = recordKey(editor);
    return (
      <EditableField
        key={`${owner}:${path.join(".")}`}
        field={field}
        fieldPath={path}
        value={mediaValueAt(editor.data, path)}
        originalValue={mediaValueAt(editor.original, path)}
        onChange={(value) => {
          const current = editorRef.current;
          if (!current || recordKey(current) !== owner) return;
          if (path.length === 1) return updateField(owner, path[0], value);
          const data = structuredClone(current.data);
          let parent: JsonValue = data;
          for (const part of path.slice(0, -1)) {
            if (parent === null || typeof parent !== "object")
              throw new Error("Ungültiger Inhaltspfad.");
            parent = Array.isArray(parent) ? parent[Number(part)] : parent[part];
          }
          if (parent === null || typeof parent !== "object")
            throw new Error("Ungültiger Feldpfad.");
          const key = path[path.length - 1];
          if (Array.isArray(parent)) {
            if (value === undefined) parent.splice(Number(key), 1);
            else parent[Number(key)] = value;
          } else if (value === undefined) delete parent[key];
          else parent[key] = value;
          updateField(owner, path[0], data[path[0]]);
        }}
        collection={editor.collection}
        role={session.user.role}
        mediaVersions={editor.mediaVersions}
        onUpload={(upload, uploadPath) => acceptUpload(owner, uploadPath, upload)}
        onDiscardUpload={(uploadPath) => discardUpload(owner, uploadPath)}
        context={editor.data}
        onUploadBusy={(uploading) => uploadBusy(uploading, owner)}
        previews={previews}
        disabled={editingLocked || !!conflict}
      />
    );
  }

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
        <PublicationNotice
          visible={
            ((pendingCount > 0 && !(ongoing(currentChange) && pendingCount === 1)) ||
              failedCount > 0) &&
            area !== "Änderungen"
          }
          failedCount={failedCount}
          onOpen={() => navigate("Änderungen")}
        />
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
                  <span className="record-description">
                    <strong>
                      {titleOf(record.data, getContentDefinition(record.collection).label)}
                    </strong>
                    <small>
                      {getContentDefinition(record.collection).area} ·{" "}
                      {getContentDefinition(record.collection).label}
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
                <h1>
                  {editor.collection === "jobs"
                    ? "Stellenanzeige bearbeiten"
                    : titleOf(editor.data, definition.label)}
                </h1>
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
                      disabled={busy || currentChange.retry?.available === false}
                      onClick={() => void retry(currentChange)}
                    >
                      Erneut versuchen
                    </button>
                    <button
                      className="text-button"
                      onClick={() =>
                        dispatchEditor({
                          type: "revise",
                          original:
                            snapshot?.records.find(
                              (record) => recordKey(record) === recordKey(editor),
                            )?.data ?? {},
                          requestId: crypto.randomUUID(),
                        })
                      }
                    >
                      Eingaben überarbeiten
                    </button>
                  </div>
                )}
                {currentChange.retry?.reason === "uploads_expired" && (
                  <p>
                    Die Datei ist abgelaufen. Wähle „Eingaben überarbeiten“ und lade sie erneut
                    hoch. Deine Texte bleiben erhalten.
                  </p>
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
                onCancel={() => dispatchEditor({ type: "cancelComparison" })}
                onResolve={(data) =>
                  dispatchEditor({ type: "resolve", data, requestId: crypto.randomUUID() })
                }
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
                      dispatchEditor({
                        type: "edit",
                        owner,
                        requestId: crypto.randomUUID(),
                        data: {
                          ...editor.data,
                          ...Object.fromEntries(
                            ["title", "category", "time", "location", "description"].map((key) => [
                              key,
                              source.data[key],
                            ]),
                          ),
                        },
                      });
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
            <ContentEditor
              key={recordKey(editor)}
              collection={editor.collection}
              data={editor.data}
              originalData={editor.original}
              fields={definition.fields}
              role={session.user.role}
              previews={previews}
              onChange={(key, value) => updateField(recordKey(editor), key, value)}
              disabled={editingLocked || !!conflict}
              renderField={renderEditorField}
            />
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
                {canDeleteContent(editor) ? (
                  <button
                    className="text-button danger-text"
                    disabled={editingLocked || !!conflict}
                    onClick={() => void deleteRecord()}
                  >
                    Löschen
                  </button>
                ) : (
                  <p className="hint">
                    Dieses Dokument ist fest verknüpft und kann ersetzt werden.
                  </p>
                )}
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
                    .fields.filter((field) => !["schoolYear", "position"].includes(field.key))
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
                        <span className="record-description">
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
                              {changeStatusLabel(change)}
                            </small>
                          )}
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
                        <span className="record-description">
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
            {(area === "Termine" || area === "Ganztag & Essen") && (
              <div className="collection-tools">
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
            )}
            {area === "Ganztag & Essen" && (
              <label className="year-filter">
                Angebote für
                <select
                  aria-label="Angebote für"
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
            <PeopleTransferProvider
              disabled={busy || pendingCount > 0}
              onTransfer={(source, target, key, index) => {
                void transferPeople(source, target, key, index);
              }}
            >
              {areaDefinitions
                .filter((item) => item.collection !== "afternoonOffers")
                .flatMap((item) => {
                  let records = recordList.filter(
                    (record) => record.collection === item.collection,
                  );
                  if (item.collection === "events" && !past)
                    records = records.filter((record) => String(record.data.date ?? "") >= today());
                  records = [...records].sort((left, right) =>
                    item.collection === "events"
                      ? String(left.data.date).localeCompare(String(right.data.date))
                      : Number(left.data.position ?? 0) - Number(right.data.position ?? 0) ||
                        titleOf(left.data).localeCompare(titleOf(right.data), "de"),
                  );
                  return contentSections(item, records).map((section) => {
                    const entries = section.entries;
                    if (item.singleton)
                      return (
                        <div className="singleton-section" key={item.collection}>
                          {records[0] ? (
                            <button
                              className="singleton-link"
                              onClick={() => openRecord(records[0])}
                            >
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
                      <section
                        className={`collection-section${section.newValues ? " people-section" : ""}`}
                        key={section.key}
                        aria-labelledby={`heading-${section.key}`}
                      >
                        <div className="section-heading">
                          <h2 id={`heading-${section.key}`}>
                            {section.label}
                            <span className="subtle count">{entries.length}</span>
                          </h2>
                          <div className="row-actions">
                            <button
                              className="button secondary"
                              onClick={() =>
                                newRecord(item.collection, undefined, section.newValues)
                              }
                            >
                              + Hinzufügen
                            </button>
                          </div>
                        </div>
                        {!entries.length && !section.newValues ? (
                          <p className="empty-state">
                            {item.collection === "events"
                              ? "Keine kommenden Termine. Vergangene Termine lassen sich oben einblenden."
                              : "Hier sind noch keine Einträge."}
                          </p>
                        ) : (
                          <SortableRecordList
                            entries={entries}
                            section={section.newValues ? section : undefined}
                            sortable={section.sortable}
                            disabled={busy || pendingCount > 0}
                            onMove={moveRecord}
                          >
                            {({ record, role }) => (
                              <>
                                <button className="record-row" onClick={() => openRecord(record)}>
                                  {(record.collection === "team" ||
                                    record.collection === "parentCouncil") && (
                                    <ProfileThumbnail
                                      name={String(record.data.name)}
                                      src={
                                        typeof record.data.image === "string"
                                          ? (pendingChange(record, changes)?.saved?.previews[
                                              record.data.image
                                            ] ??
                                            thumbnails[
                                              snapshot?.mediaVersions[record.data.image] ?? ""
                                            ])
                                          : undefined
                                      }
                                    />
                                  )}
                                  <span className="record-description">
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
                                        role ?? record.data.role,
                                        record.data.group,
                                      ]
                                        .filter(Boolean)
                                        .map(String)
                                        .join(" · ")}
                                      {item.collection === "afternoonOffers" &&
                                      record.data.schoolYear !== currentYear
                                        ? " · Früheres / anderes Schuljahr"
                                        : ""}
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
                                      busy ||
                                      uploadsInProgress > 0 ||
                                      !!pendingChange(record, changes)
                                    }
                                    onSelect={(file) => void replacePdf(record, file)}
                                  />
                                )}
                              </>
                            )}
                          </SortableRecordList>
                        )}
                      </section>
                    );
                  });
                })}
            </PeopleTransferProvider>
            {area === "Ganztag & Essen" && (
              <AfternoonWeek
                records={recordList.filter(
                  (record) =>
                    record.collection === "afternoonOffers" &&
                    record.data.schoolYear === (offerYear || currentYear),
                )}
                disabled={busy || pendingCount > 0}
                onOpen={openRecord}
                onAdd={(weekday) =>
                  newRecord("afternoonOffers", undefined, {
                    weekday,
                    schoolYear: offerYear || currentYear,
                  })
                }
                onMove={moveRecord}
                statuses={Object.fromEntries(
                  recordList
                    .filter((record) => record.collection === "afternoonOffers")
                    .flatMap((record) => {
                      const pending = pendingChange(record, changes);
                      return pending ? [[recordKey(record), statusLabels[pending.status]]] : [];
                    }),
                )}
              />
            )}
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
