import { expect, test } from "vitest";
import {
  decodePublication,
  encodePublication,
  initialPublication,
  transitionPublication,
  type Publication,
} from "./publication-state";
import { decodeUpload, encodeUpload, transitionUpload, uploadExpired } from "./upload-state";

const commit = "a".repeat(40);
function claimed() {
  return transitionPublication(
    transitionPublication(initialPublication(), { type: "dispatch", token: "nonce", at: 1000 }),
    { type: "claim", runId: "123", runAttempt: "1" },
  );
}
function report(
  state: Publication,
  status: "checking" | "committed" | "published" | "failed" | "conflict",
  value?: string,
) {
  return transitionPublication(state, { type: "report", report: { status, commit: value } });
}

test("dispatch has bounded attempts, a claim requires dispatch, and retries invalidate ownership", () => {
  expect(() =>
    transitionPublication(initialPublication(), { type: "claim", runId: "123", runAttempt: "1" }),
  ).toThrow();
  let state = transitionPublication(initialPublication(), {
    type: "dispatch",
    token: "first",
    at: 1000,
  });
  expect(() =>
    transitionPublication(state, { type: "dispatch", token: "early", at: 2000 }),
  ).toThrow();
  state = transitionPublication(state, { type: "dispatch", token: "second", at: 902000 });
  state = transitionPublication(state, { type: "dispatch", token: "third", at: 1803000 });
  expect(() =>
    transitionPublication(state, { type: "dispatch", token: "fourth", at: 2704000 }),
  ).toThrow();
  const failed = transitionPublication(state, { type: "fail", error: "dispatch failed" });
  expect(transitionPublication(failed, { type: "retry" })).toEqual(initialPublication());
});

test("publication only advances through a committed version and rejects backwards or terminal changes", () => {
  const checking = claimed();
  expect(() => report(checking, "checking", commit)).toThrow();
  expect(() => report(checking, "conflict", commit)).toThrow();
  expect(() => report(checking, "published", commit)).toThrow();
  expect(() => report(checking, "committed")).toThrow();
  const committed = report(checking, "committed", commit);
  expect(() => report(committed, "checking")).toThrow();
  expect(() => report(committed, "conflict")).toThrow();
  expect(() => report(committed, "committed", "b".repeat(40))).toThrow();
  const published = report(committed, "published", commit);
  expect(report(published, "published", commit)).toEqual(published);
  expect(() => report(published, "failed")).toThrow();
  expect(() => transitionPublication(published, { type: "retry" })).toThrow();
});

test("failed committed work keeps its exact commit and resumes as committed after retry and claim", () => {
  const failed = report(report(claimed(), "committed", commit), "failed");
  const queued = transitionPublication(failed, { type: "retry" });
  expect(queued).toEqual({ ...initialPublication(), commit });
  const dispatched = transitionPublication(queued, { type: "dispatch", token: "retry", at: 2000 });
  expect(
    transitionPublication(dispatched, { type: "claim", runId: "456", runAttempt: "1" }),
  ).toMatchObject({
    status: "committed",
    commit,
    attempt: { kind: "claimed", token: "retry", runId: "456" },
  });
});

test("existing persisted publication rows round-trip without resetting active attempts", () => {
  const legacy = {
    status: "committed" as const,
    commit,
    attempt: "existing-attempt",
    runId: "123",
    runAttempt: "2",
    dispatchedAt: 1000,
    dispatchCount: 2,
    runUrl: "https://github.com/fixture/monte/actions/runs/123",
  };
  expect(encodePublication(decodePublication(legacy), "fixture/monte")).toEqual(legacy);
  expect(decodePublication({ ...legacy, status: "checking" })).toMatchObject({
    status: "committed",
    commit,
    attempt: { kind: "claimed", runId: "123", runAttempt: "2" },
  });
  expect(() => decodePublication({ ...legacy, runAttempt: undefined })).toThrow();
  expect(() => decodePublication({ ...legacy, commit: undefined })).toThrow();
});

test("upload ownership binds once, enforces the uploader, and retains existing bound rows", () => {
  const stored = {
    id: "upload",
    ownerId: "owner",
    path: "public/downloads/file.pdf",
    sha256: "a".repeat(64),
    size: 100,
    contentType: "application/pdf",
    baseVersion: null,
    createdAt: 0,
  };
  const staged = decodeUpload(stored);
  expect(() =>
    transitionUpload(staged, { type: "bind", ownerId: "other", changeId: "change" }),
  ).toThrow();
  const bound = transitionUpload(staged, { type: "bind", ownerId: "owner", changeId: "change" });
  expect(() =>
    transitionUpload(bound, { type: "bind", ownerId: "owner", changeId: "other" }),
  ).toThrow();
  expect(encodeUpload(decodeUpload({ ...stored, changeId: "change" }))).toEqual({
    ...stored,
    changeId: "change",
  });
  expect(uploadExpired(staged, undefined, 86400_001)).toBe(true);
  expect(
    uploadExpired(
      bound,
      { publication: claimed(), updatedAt: new Date(0).toISOString() },
      8 * 86400_000,
    ),
  ).toBe(false);
  expect(
    uploadExpired(
      bound,
      { publication: report(claimed(), "failed"), updatedAt: new Date(0).toISOString() },
      8 * 86400_000,
    ),
  ).toBe(true);
});
