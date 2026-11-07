import type { ChangeStatus } from "../src/admin/types";
import { requireCondition } from "./http";

type Waiting = { kind: "waiting" };
type Dispatched = { kind: "dispatched"; token: string; at: number; count: number };
type Claimed = Omit<Dispatched, "kind"> & {
  kind: "claimed";
  runId: string;
  runAttempt: string;
};
type Attempt = Waiting | Dispatched | Claimed;
export type Publication =
  | { status: "queued"; attempt: Waiting | Dispatched; commit?: string }
  | { status: "checking"; attempt: Claimed; commit?: never }
  | { status: "committed"; attempt: Claimed; commit: string }
  | { status: "published"; attempt: Claimed; commit: string; releaseCommit: string }
  | { status: "failed" | "conflict"; attempt: Attempt; commit?: string; error?: string };

// The persisted representation stays compatible with operations already in production.
export type StoredPublication = {
  status: ChangeStatus;
  attempt?: string;
  runId?: string;
  runAttempt?: string;
  dispatchedAt?: number;
  dispatchCount: number;
  commit?: string;
  releaseCommit?: string;
  error?: string;
  runUrl?: string;
};
export type PublicationReport = {
  status: "checking" | "committed" | "published" | "failed" | "conflict";
  commit?: string;
  releaseCommit?: string;
  error?: string;
};
type Event =
  | { type: "dispatch"; token: string; at: number }
  | { type: "claim"; runId: string; runAttempt: string }
  | { type: "report"; report: PublicationReport }
  | { type: "fail"; error: string }
  | { type: "retry" };

export function initialPublication(): Extract<Publication, { status: "queued" }> {
  return { status: "queued", attempt: { kind: "waiting" } };
}
export function publicationActive(state: Publication) {
  return state.status === "checking" || state.status === "committed";
}
export function publicationFinished(state: Publication) {
  return state.status === "published" || state.status === "failed" || state.status === "conflict";
}
export function decodePublication(row: StoredPublication): Publication {
  const valid: (condition: unknown) => asserts condition = (condition) =>
    requireCondition(
      condition,
      503,
      "publication_state",
      "Der gespeicherte Veröffentlichungsstand ist ungültig.",
    );
  let attempt: Attempt;
  if (!row.attempt) {
    valid(
      !row.runId && !row.runAttempt && row.dispatchedAt === undefined && row.dispatchCount === 0,
    );
    attempt = { kind: "waiting" };
  } else {
    valid(
      typeof row.dispatchedAt === "number" &&
        Number.isInteger(row.dispatchCount) &&
        row.dispatchCount > 0,
    );
    if (row.runId || row.runAttempt) {
      valid(row.runId && row.runAttempt);
      attempt = {
        kind: "claimed",
        token: row.attempt,
        at: row.dispatchedAt,
        count: row.dispatchCount,
        runId: row.runId,
        runAttempt: row.runAttempt,
      };
    } else {
      attempt = {
        kind: "dispatched",
        token: row.attempt,
        at: row.dispatchedAt,
        count: row.dispatchCount,
      };
    }
  }
  switch (row.status) {
    case "queued":
      valid(attempt.kind !== "claimed");
      return { status: row.status, attempt, commit: row.commit };
    case "checking":
      valid(attempt.kind === "claimed");
      // Older retries kept the immutable commit while marking a claimed run as checking.
      return row.commit
        ? { status: "committed", attempt, commit: row.commit }
        : { status: "checking", attempt };
    case "committed":
      valid(attempt.kind === "claimed" && row.commit);
      return { status: row.status, attempt, commit: row.commit };
    case "published":
      valid(attempt.kind === "claimed" && row.commit);
      return {
        status: row.status,
        attempt,
        commit: row.commit,
        releaseCommit: row.releaseCommit ?? row.commit,
      };
    case "failed":
    case "conflict":
      return { status: row.status, attempt, commit: row.commit, error: row.error };
  }
}
export function encodePublication(state: Publication, repository: string): StoredPublication {
  const { attempt } = state;
  return {
    status: state.status,
    commit: state.commit,
    ...(state.status === "published" ? { releaseCommit: state.releaseCommit } : {}),
    ...(state.status === "failed" || state.status === "conflict" ? { error: state.error } : {}),
    dispatchCount: attempt.kind === "waiting" ? 0 : attempt.count,
    ...(attempt.kind === "waiting" ? {} : { attempt: attempt.token, dispatchedAt: attempt.at }),
    ...(attempt.kind === "claimed"
      ? {
          runId: attempt.runId,
          runAttempt: attempt.runAttempt,
          runUrl: `https://github.com/${repository}/actions/runs/${attempt.runId}`,
        }
      : {}),
  };
}

export function transitionPublication(state: Publication, event: Event): Publication {
  const allowed: (condition: unknown) => asserts condition = (condition) =>
    requireCondition(
      condition,
      409,
      "publish_state",
      "Dieser Übergang der Veröffentlichung ist nicht erlaubt.",
    );
  switch (event.type) {
    case "dispatch": {
      allowed(state.status === "queued");
      const count = state.attempt.kind === "waiting" ? 0 : state.attempt.count;
      allowed(
        count < 3 &&
          (state.attempt.kind === "waiting" || event.at - state.attempt.at > 15 * 60_000),
      );
      return {
        ...state,
        attempt: { kind: "dispatched", token: event.token, at: event.at, count: count + 1 },
      };
    }
    case "claim": {
      allowed(state.status === "queued" && state.attempt.kind === "dispatched");
      const attempt: Claimed = {
        ...state.attempt,
        kind: "claimed",
        runId: event.runId,
        runAttempt: event.runAttempt,
      };
      return state.commit
        ? { status: "committed", attempt, commit: state.commit }
        : { status: "checking", attempt };
    }
    case "retry":
      allowed(state.status === "failed");
      return { ...initialPublication(), commit: state.commit };
    case "fail":
      allowed(state.status === "queued" || publicationActive(state));
      return { status: "failed", attempt: state.attempt, commit: state.commit, error: event.error };
    case "report": {
      const report = event.report;
      requireCondition(
        !state.commit || !report.commit || state.commit === report.commit,
        409,
        "commit_mismatch",
        "Die Änderung gehört zu einem anderen Commit.",
      );
      const commit = report.commit ?? state.commit;
      switch (report.status) {
        case "checking":
          allowed(state.status === "checking");
          allowed(!report.commit);
          return state;
        case "committed":
          allowed(state.status === "checking" || state.status === "committed");
          requireCondition(commit, 400, "commit_missing", "Die veröffentlichte Version fehlt.");
          return { status: "committed", attempt: state.attempt, commit };
        case "published": {
          allowed(state.status === "committed" || state.status === "published");
          requireCondition(commit, 400, "commit_missing", "Die veröffentlichte Version fehlt.");
          const releaseCommit = report.releaseCommit ?? commit;
          requireCondition(
            state.status !== "published" || state.releaseCommit === releaseCommit,
            409,
            "release_mismatch",
            "Diese Veröffentlichung wurde bereits für eine andere Version bestätigt.",
          );
          return { status: "published", attempt: state.attempt, commit, releaseCommit };
        }
        case "failed":
          allowed(
            state.status === "checking" ||
              state.status === "committed" ||
              state.status === "failed",
          );
          return { status: "failed", attempt: state.attempt, commit, error: report.error };
        case "conflict":
          allowed(state.status === "checking" || state.status === "conflict");
          allowed(!commit);
          return { status: "conflict", attempt: state.attempt, commit, error: report.error };
      }
    }
  }
}
