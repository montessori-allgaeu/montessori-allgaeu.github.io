import { useState } from "react";
import { z } from "zod";

const manifestSchema = z.record(
  z.string().regex(/^[a-f0-9]{40}$/),
  z.string().regex(/^\/profile-thumbnails\/[a-f0-9]{64}\.webp$/),
);

export async function loadProfileThumbnails(): Promise<Record<string, string>> {
  const response = await fetch("/profile-thumbnails.json", { cache: "no-store" });
  if (!response.ok) throw new Error("Die Profilvorschauen konnten nicht geladen werden.");
  return manifestSchema.parse(await response.json());
}

export function ProfileThumbnail({ src }: { src: string | undefined }) {
  const [failed, setFailed] = useState<string>();
  // New uploads may not be published yet. Never fall back to one original-image API call per row.
  if (!src || failed === src) return <span className="record-thumb" aria-hidden="true" />;
  return (
    <img
      className="record-thumb"
      alt=""
      width={48}
      height={57}
      loading="lazy"
      decoding="async"
      src={src}
      onError={() => setFailed(src)}
    />
  );
}
