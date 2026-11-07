import type {
  Change,
  ContentData,
  ContentMutation,
  ContentRecord,
  EditableContentSnapshot,
  UploadResult,
} from "../../src/admin/types";
import { calculateEffectiveFee } from "../../src/admin/content-model";
import { recordKey as key } from "./overview";
import {
  bindMedia,
  changeMedia,
  localMedia,
  needsReselection,
  releaseMedia,
  stagedUploads,
  type EditorMedia,
} from "./media";

type Editing = { status: "editing"; uploads: number };
type Saved = { status: "saved"; change: Change };
type Comparing = {
  status: "comparing";
  latest: ContentRecord;
  mediaVersions: Record<string, string>;
  previous: Editing | Saved;
};
export type EditState = ContentMutation & {
  original: ContentData;
  media: EditorMedia;
  mediaVersions: Record<string, string>;
  requestId: string;
  phase: Editing | Saved | Comparing | { status: "submitting"; intent: "save" | "delete" };
};
export type EditorState = { status: "closed" } | { status: "open"; editor: EditState };
export const closedEditor: EditorState = { status: "closed" };
type Owner = { owner: string };
export type EditorEvent =
  | { type: "open"; editor: EditState }
  | { type: "close" }
  | ({ type: "edit"; data: ContentData; requestId: string } & Owner)
  | ({ type: "uploadStarted"; requestId: string } & Owner)
  | ({ type: "uploadFinished" } & Owner)
  | ({ type: "selectMedia"; path: string[]; upload: UploadResult; requestId: string } & Owner)
  | ({ type: "discardMedia"; path: string[]; requestId: string } & Owner)
  | { type: "submit"; requestId: string; intent: "save" | "delete" }
  | { type: "accepted"; requestId: string; change: Change }
  | { type: "rejected"; requestId: string }
  | { type: "changes"; changes: Change[]; content?: EditableContentSnapshot }
  | ({ type: "compare"; latest: ContentRecord; mediaVersions: Record<string, string> } & Owner)
  | { type: "cancelComparison" }
  | { type: "resolve"; data: ContentData; requestId: string }
  | { type: "revise"; original: ContentData; requestId: string };

export function openEditor(
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
    media: change ? bindMedia(change, record.data, localMedia()) : localMedia(),
    mediaVersions: { ...mediaVersions },
    requestId: crypto.randomUUID(),
    phase: change ? { status: "saved", change } : { status: "editing", uploads: 0 },
  };
}

export function editorChange(editor: EditState | null): Change | undefined {
  const phase = editor?.phase;
  if (phase?.status === "saved") return phase.change;
  if (phase?.status === "comparing" && phase.previous.status === "saved")
    return phase.previous.change;
}

export function editorUploads(editor: EditState | null): number {
  return editor?.phase.status === "editing" ? editor.phase.uploads : 0;
}

export function editorDirty(editor: EditState | null): boolean {
  return (
    !!editor &&
    (stagedUploads(editor.media, editor.data).length > 0 ||
      JSON.stringify(editor.data) !== JSON.stringify(editor.original))
  );
}

export function editorLocked(editor: EditState | null): boolean {
  if (!editor) return false;
  switch (editor.phase.status) {
    case "editing":
      return editor.phase.uploads > 0;
    case "saved":
      return editor.phase.change.status !== "published";
    case "submitting":
    case "comparing":
      return true;
  }
}

function editable(editor: EditState): boolean {
  return (
    editor.phase.status === "editing" ||
    (editor.phase.status === "saved" && editor.phase.change.status === "published")
  );
}

// All changes to the record lifecycle go through this reducer. Async completions
// are scoped to the original record/request so they cannot replace another edit.
export function editorReducer(state: EditorState, event: EditorEvent): EditorState {
  if (event.type === "open") return { status: "open", editor: event.editor };
  if (event.type === "close") return closedEditor;
  if (state.status === "closed") return state;
  const editor = state.editor;
  if ("owner" in event && event.owner !== key(editor)) return state;
  const update = (next: EditState): EditorState => ({ status: "open", editor: next });
  switch (event.type) {
    case "edit": {
      if (!editable(editor)) return state;
      let data = event.data;
      if (editor.collection === "kindergartenFeeSettings" && Array.isArray(data.rows)) {
        data = {
          ...data,
          rows: data.rows.map((row) => {
            if (!row || typeof row !== "object" || Array.isArray(row)) return row;
            const amount = calculateEffectiveFee(
              String(row.amount ?? ""),
              String(data.subsidyAmount ?? ""),
            );
            return amount === undefined ? row : { ...row, effectiveAmount: amount };
          }),
        };
      }
      return update({
        ...editor,
        data,
        requestId: event.requestId,
        phase: { status: "editing", uploads: editorUploads(editor) },
      });
    }
    case "uploadStarted":
      if (!editable(editor)) return state;
      return update({
        ...editor,
        requestId: event.requestId,
        phase: { status: "editing", uploads: editorUploads(editor) + 1 },
      });
    case "uploadFinished":
      if (editor.phase.status !== "editing" || editor.phase.uploads === 0) return state;
      return update({ ...editor, phase: { status: "editing", uploads: editor.phase.uploads - 1 } });
    case "selectMedia":
    case "discardMedia":
      if (!editable(editor)) return state;
      return update({
        ...editor,
        requestId: event.requestId,
        media: changeMedia(
          editor.media,
          event.path,
          event.type === "selectMedia" ? event.upload : undefined,
        ),
        phase: { status: "editing", uploads: editorUploads(editor) },
      });
    case "submit":
      if (
        event.requestId !== editor.requestId ||
        !editable(editor) ||
        editorUploads(editor) > 0 ||
        (event.intent === "save" && needsReselection(editor.media, editor.data))
      )
        return state;
      return update({ ...editor, phase: { status: "submitting", intent: event.intent } });
    case "accepted":
      if (editor.requestId !== event.requestId || editor.phase.status !== "submitting")
        return state;
      if (editor.phase.intent === "delete") return closedEditor;
      return update({
        ...editor,
        original: structuredClone(editor.data),
        media: bindMedia(event.change, editor.data, editor.media),
        phase: { status: "saved", change: event.change },
      });
    case "rejected":
      if (editor.requestId !== event.requestId || editor.phase.status !== "submitting")
        return state;
      return update({ ...editor, phase: { status: "editing", uploads: 0 } });
    case "changes": {
      if (editor.phase.status !== "saved") return state;
      // Capture the saved phase separately for type narrowing inside callbacks.
      const previous = editor.phase.change;
      const next = event.changes.find((change) => change.id === previous.id);
      if (!next) return state;
      const record =
        next.status === "published"
          ? event.content?.records.find((record) => key(record) === key(editor))
          : undefined;
      if (record && event.content)
        return update(openEditor(record, event.content.mediaVersions, next));
      return update({ ...editor, phase: { status: "saved", change: next } });
    }
    case "compare":
      if (key(event.latest) !== key(editor) || editor.phase.status === "comparing") return state;
      return update({
        ...editor,
        phase: {
          status: "comparing",
          latest: event.latest,
          mediaVersions: event.mediaVersions,
          previous:
            editor.phase.status === "saved" ? editor.phase : { status: "editing", uploads: 0 },
        },
      });
    case "cancelComparison":
      return editor.phase.status === "comparing"
        ? update({ ...editor, phase: editor.phase.previous })
        : state;
    case "resolve":
      if (editor.phase.status !== "comparing") return state;
      return update({
        ...editor,
        data: event.data,
        original: editor.phase.latest.data,
        baseVersion: editor.phase.latest.version,
        mediaVersions: editor.phase.mediaVersions,
        media: releaseMedia(editor.media),
        requestId: event.requestId,
        phase: { status: "editing", uploads: 0 },
      });
    case "revise":
      if (editor.phase.status !== "saved" || editor.phase.change.status !== "failed") return state;
      return update({
        ...editor,
        original: event.original,
        media: releaseMedia(editor.media),
        requestId: event.requestId,
        phase: { status: "editing", uploads: 0 },
      });
  }
}
