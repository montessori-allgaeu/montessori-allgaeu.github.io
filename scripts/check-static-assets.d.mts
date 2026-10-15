export function checkStaticAssets(
  directory: string,
  limits?: { files: number; bytes: number },
): Promise<{ files: number; largestBytes: number }>;
