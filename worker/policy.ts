import { z } from "zod";
import {
  contentCollections,
  type AccessUser,
  type ContentData,
  type ContentMutation,
} from "../src/admin/types";
import { requireCondition } from "./http";

export const mutationSchema = z.strictObject({
  collection: z.enum(contentCollections),
  id: z.string().min(1).max(160),
  baseVersion: z
    .string()
    .regex(/^[0-9a-f]{40}$/)
    .nullable(),
  data: z.record(z.string(), z.json()),
  delete: z.literal(true).optional(),
});
export const changeSchema = z.strictObject({
  requestId: z.uuid(),
  mutations: z.array(mutationSchema).min(1).max(200),
  uploadIds: z.array(z.uuid()).max(30),
});
export const roleSchema = z.enum(["admin", "content-manager"]);
export const nameSchema = z.string().trim().min(1).max(100);
export const invitationSchema = z.strictObject({ name: nameSchema, role: roleSchema });
export const accessPatchSchema = z.strictObject({
  name: nameSchema.optional(),
  role: roleSchema.optional(),
  active: z.boolean().optional(),
});

function donationAccount(data: ContentData) {
  const direct = data.directDonation;
  if (!direct || typeof direct !== "object" || Array.isArray(direct)) return undefined;
  const account = direct.account;
  if (!account || typeof account !== "object" || Array.isArray(account)) return undefined;
  return Object.fromEntries(["recipient", "bank", "iban", "bic"].map((key) => [key, account[key]]));
}

export function changesBankDetails(mutation: ContentMutation, before?: ContentData) {
  return (
    mutation.collection === "donations" &&
    JSON.stringify(donationAccount(mutation.data)) !==
      JSON.stringify(before ? donationAccount(before) : undefined)
  );
}

export function requireAdmin(user: AccessUser) {
  requireCondition(
    user.active && user.role === "admin",
    403,
    "admin_required",
    "Das kann nur ein Admin ändern.",
  );
}
export function requireFresh(verifiedAt: number, now = Date.now()) {
  requireCondition(
    now - verifiedAt < 5 * 60_000,
    428,
    "reauth_required",
    "Bitte bestätige diese Änderung kurz mit deinem Passkey.",
  );
}
export function preserveLastAdmin(
  users: AccessUser[],
  target: AccessUser,
  next: Partial<AccessUser>,
) {
  const updated = { ...target, ...next };
  if (target.active && target.role === "admin" && (!updated.active || updated.role !== "admin")) {
    requireCondition(
      users.some(
        (user) =>
          user.id !== target.id && user.active && user.role === "admin" && user.passkeyCount > 0,
      ),
      409,
      "last_admin",
      "Mindestens ein aktiver Admin mit Passkey muss bleiben.",
    );
  }
}
