import { describe, expect, it } from "vitest";
import {
  closedEditor,
  editorReducer,
  openEditor,
  editorChange,
  editorLocked,
  editorUploads,
  type EditorState,
} from "../../admin/src/editor-machine";
import { needsReselection, stagedUploads } from "../../admin/src/media";
import type { Change, ContentRecord } from "./types";

const record: ContentRecord = {
  collection: "downloads",
  id: "document",
  version: "base",
  data: { title: "Original", file: "/downloads/info.pdf" },
};
const owner = "downloads:document";
const upload = { id: "upload", value: "/downloads/info.pdf", previewUrl: "/api/uploads/upload" };
const change = (status: Change["status"]): Change => ({
  id: "job",
  status,
  createdAt: "2026-11-07T10:00:00Z",
  updatedAt: "2026-11-07T10:00:00Z",
  summary: "Document",
  saved: { mutations: [], previews: { [upload.value]: upload.previewUrl }, hasUploads: true },
});
const opened = (): EditorState => ({ status: "open", editor: openEditor(record, {}) });
function current(state: EditorState) {
  if (state.status !== "open") throw new Error("Expected open editor");
  return state.editor;
}
function submitting(state = opened()) {
  return editorReducer(state, {
    type: "submit",
    requestId: current(state).requestId,
    intent: "save",
  });
}
function accepted(status: Change["status"] = "checking") {
  const state = submitting();
  return editorReducer(state, {
    type: "accepted",
    requestId: current(state).requestId,
    change: change(status),
  });
}

describe("record editor state machine", () => {
  it("locks accepted work and ignores edits and unrelated save completions", () => {
    const state = accepted();
    expect(editorLocked(current(state))).toBe(true);
    expect(
      editorReducer(state, { type: "edit", owner, data: { title: "Overwrite" }, requestId: "new" }),
    ).toBe(state);
    expect(
      editorReducer(opened(), {
        type: "accepted",
        requestId: "another",
        change: change("checking"),
      }).status,
    ).toBe("open");
    const another = opened();
    expect(
      editorReducer(another, {
        type: "accepted",
        requestId: "another",
        change: change("checking"),
      }),
    ).toBe(another);
  });

  it("preserves the request identity and staged binary after an uncertain save failure", () => {
    let state = opened();
    state = editorReducer(state, {
      type: "selectMedia",
      owner,
      path: ["file"],
      upload,
      requestId: "upload-request",
    });
    state = submitting(state);
    state = editorReducer(state, { type: "rejected", requestId: "upload-request" });
    expect(current(state).requestId).toBe("upload-request");
    expect(stagedUploads(current(state).media, current(state).data)).toEqual([upload]);
    expect(editorLocked(current(state))).toBe(false);
  });

  it("tracks overlapping uploads and rejects saving until all finish", () => {
    let state = opened();
    for (const requestId of ["one", "two"])
      state = editorReducer(state, { type: "uploadStarted", owner, requestId });
    expect(editorUploads(current(state))).toBe(2);
    expect(editorReducer(state, { type: "submit", requestId: "two", intent: "save" })).toBe(state);
    state = editorReducer(state, { type: "uploadFinished", owner });
    expect(editorLocked(current(state))).toBe(true);
    state = editorReducer(state, { type: "uploadFinished", owner });
    expect(current(submitting(state)).phase.status).toBe("submitting");
  });

  it("never lets an old upload finish or a different record change the current editor", () => {
    const state = accepted();
    expect(editorReducer(state, { type: "uploadFinished", owner })).toBe(state);
    expect(
      editorReducer(state, {
        type: "selectMedia",
        owner: "downloads:other",
        path: ["file"],
        upload,
        requestId: "old",
      }),
    ).toBe(state);
    expect(
      editorReducer(closedEditor, {
        type: "accepted",
        requestId: "old",
        change: change("checking"),
      }),
    ).toBe(closedEditor);
  });

  it("requires reselection when detaching job-owned files, including expired same-path replacements", () => {
    let state = accepted("failed");
    expect(stagedUploads(current(state).media, current(state).data)).toEqual([]);
    state = editorReducer(state, {
      type: "revise",
      original: record.data,
      requestId: "correction",
    });
    expect(needsReselection(current(state).media, current(state).data)).toBe(true);
    expect(editorReducer(state, { type: "submit", requestId: "correction", intent: "save" })).toBe(
      state,
    );
    state = editorReducer(state, {
      type: "selectMedia",
      owner,
      path: ["file"],
      upload: { ...upload, id: "new-binary" },
      requestId: "new",
    });
    expect(needsReselection(current(state).media, current(state).data)).toBe(false);
    expect(
      stagedUploads(current(state).media, current(state).data).map((upload) => upload.id),
    ).toEqual(["new-binary"]);
  });

  it("allows removing a job-owned file rather than uploading it again", () => {
    let state = editorReducer(accepted("failed"), {
      type: "revise",
      original: record.data,
      requestId: "correction",
    });
    state = editorReducer(state, {
      type: "edit",
      owner,
      data: { title: "No file" },
      requestId: "removed",
    });
    expect(needsReselection(current(state).media, current(state).data)).toBe(false);
  });

  it("rebases the published editor and cannot overwrite a subsequent local edit", () => {
    let state = accepted();
    const published = change("published");
    const content = {
      revision: "next",
      mediaVersions: { [upload.value]: "media-v2" },
      records: [{ ...record, version: "v2" }],
    };
    state = editorReducer(state, { type: "changes", changes: [published], content });
    expect(current(state).baseVersion).toBe("v2");
    expect(current(state).media.status).toBe("local");
    expect(editorLocked(current(state))).toBe(false);
    state = editorReducer(state, {
      type: "edit",
      owner,
      data: { ...record.data, title: "New draft" },
      requestId: "new-edit",
    });
    expect(editorChange(current(state))).toBeUndefined();
    expect(editorReducer(state, { type: "changes", changes: [published], content })).toBe(state);
  });

  it("comparison cancellation restores its source and resolution adopts the latest baseline", () => {
    const state = accepted("conflict");
    const latest = {
      ...record,
      version: "latest",
      data: { ...record.data, title: "Someone else" },
    };
    const comparing = editorReducer(state, {
      type: "compare",
      owner,
      latest,
      mediaVersions: { file: "new-media" },
    });
    expect(editorReducer(comparing, { type: "cancelComparison" })).toEqual(state);
    const resolved = current(
      editorReducer(comparing, { type: "resolve", data: record.data, requestId: "resolved" }),
    );
    expect(resolved.baseVersion).toBe("latest");
    expect(resolved.original).toEqual(latest.data);
    expect(resolved.mediaVersions).toEqual({ file: "new-media" });
    expect(editorChange(resolved)).toBeUndefined();
    expect(needsReselection(resolved.media, resolved.data)).toBe(true);
  });

  it("delete acceptance closes the editor, while rejection keeps the record", () => {
    const state = opened();
    const requestId = current(state).requestId;
    const deleting = editorReducer(state, { type: "submit", requestId, intent: "delete" });
    expect(
      editorReducer(deleting, { type: "accepted", requestId, change: change("checking") }),
    ).toEqual(closedEditor);
    expect(current(editorReducer(deleting, { type: "rejected", requestId })).data).toEqual(
      record.data,
    );
  });
});
