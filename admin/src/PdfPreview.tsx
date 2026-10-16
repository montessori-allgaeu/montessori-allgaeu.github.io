import { useEffect, useRef, useState } from "react";
import type { PDFDocumentLoadingTask, RenderTask } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

export type PdfMetadata = { source: string; bytes: number };

export function PdfPreview({
  url,
  title,
  onMetadata,
}: {
  url: string;
  title: string;
  onMetadata: (metadata: PdfMetadata) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [result, setResult] = useState<{ source: string; status: "ready" | "error" } | null>(null);
  const status = result?.source === url ? result.status : "loading";

  useEffect(() => {
    const controller = new AbortController();
    let loading: PDFDocumentLoadingTask | undefined;
    let rendering: RenderTask | undefined;
    let disposed = false;

    async function render() {
      try {
        const [pdfjs, response] = await Promise.all([
          import("pdfjs-dist"),
          fetch(url, { credentials: "same-origin", signal: controller.signal }),
        ]);
        if (disposed) return;
        if (!response.ok || !response.headers.get("content-type")?.includes("application/pdf")) {
          throw new Error("Die PDF-Datei ist nicht erreichbar.");
        }
        const data = new Uint8Array(await response.arrayBuffer());
        if (disposed) return;
        onMetadata({ source: url, bytes: data.byteLength });
        pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
        loading = pdfjs.getDocument({
          data,
          useWasm: false,
          disableFontFace: true,
          useSystemFonts: true,
          enableXfa: false,
        });
        const document = await loading.promise;
        const page = await document.getPage(1);
        if (disposed || !canvas.current) return;
        const natural = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({
          scale: Math.min(1.5, 1600 / Math.max(natural.width, natural.height)),
        });
        canvas.current.width = Math.ceil(viewport.width);
        canvas.current.height = Math.ceil(viewport.height);
        rendering = page.render({ canvas: canvas.current, viewport });
        await rendering.promise;
        if (!disposed) setResult({ source: url, status: "ready" });
      } catch {
        if (!disposed) setResult({ source: url, status: "error" });
      }
    }
    void render();
    return () => {
      disposed = true;
      controller.abort();
      rendering?.cancel();
      void loading?.destroy();
    };
  }, [url, onMetadata]);

  return (
    <div className="content-pdf-preview">
      <p className="content-preview-label">Erste PDF-Seite</p>
      <div className="content-pdf-page" aria-busy={status === "loading"}>
        <canvas
          ref={canvas}
          role="img"
          aria-label={`Erste Seite: ${title}`}
          hidden={status !== "ready"}
        />
        {status === "loading" && <p role="status">PDF-Vorschau wird geladen …</p>}
        {status === "error" && (
          <p role="status">Die Vorschau ist nicht verfügbar. Du kannst die PDF direkt öffnen.</p>
        )}
      </div>
      <a href={url} target="_blank" rel="noreferrer">
        Vollständige PDF öffnen ↗
      </a>
    </div>
  );
}
