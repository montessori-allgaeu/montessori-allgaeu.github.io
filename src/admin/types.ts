export const contentCollections = [
  "events",
  "jobs",
  "team",
  "parentCouncil",
  "downloads",
  "afternoonOffers",
  "donations",
  "contactSettings",
  "openingHoursSettings",
  "mealSettings",
  "kindergartenAdmissionSettings",
  "schoolAdmissionSettings",
  "afternoonProgramSettings",
  "schoolFeeSettings",
  "kindergartenFeeSettings",
  "communityContributionSettings",
] as const;

export type ContentCollection = (typeof contentCollections)[number];
export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type ContentData = { [key: string]: JsonValue };
export type Role = "admin" | "content-manager";
export type ContentRecord = {
  collection: ContentCollection;
  id: string;
  version: string;
  data: ContentData;
};
export type ContentSnapshot = { revision: string; records: ContentRecord[] };
export type EditableContentSnapshot = ContentSnapshot & {
  mediaVersions: Record<string, string>;
};
export type ContentMutation = {
  collection: ContentCollection;
  id: string;
  baseVersion: string | null;
  data: ContentData;
};
export type ChangeRequest = {
  requestId: string;
  mutations: ContentMutation[];
  uploadIds: string[];
};
export type ChangeStatus =
  "queued" | "checking" | "committed" | "published" | "failed" | "conflict";
export type Change = {
  id: string;
  status: ChangeStatus;
  createdAt: string;
  updatedAt: string;
  summary: string;
  error?: string;
  commit?: string;
  runUrl?: string;
  targets?: { collection: ContentCollection; id: string }[];
  saved?: { mutations: ContentMutation[]; previews: Record<string, string>; hasUploads?: boolean };
};
export type AccessUser = {
  id: string;
  name: string;
  role: Role;
  active: boolean;
  createdAt: string;
  lastLoginAt?: string;
  passkeyCount: number;
};
export type PasskeyInfo = { id: string; label: string; createdAt: string; lastUsedAt?: string };
export type SessionInfo = {
  user: AccessUser;
  csrfToken: string;
  passkeys: PasskeyInfo[];
  expiresAt: string;
};
export type InvitationInfo = {
  id: string;
  userId: string;
  name: string;
  role: Role;
  expiresAt: string;
};
export type InvitationResult = InvitationInfo & { url: string };
export type UploadResult = { id: string; value: string; previewUrl: string };
export type ApiError = {
  error: string;
  code: string;
  fields?: { path: string; message: string }[];
};
