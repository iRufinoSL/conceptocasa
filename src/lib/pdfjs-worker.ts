import * as pdfjsLib from "pdfjs-dist";

// Vite can bundle pdf.js worker and expose its URL at build time.
// This avoids relying on external CDNs (which can be blocked) and fixes
// "Setting up fake worker failed" errors.
//
// Note: pdfjs-dist ships the worker as ESM.
// The `?url` suffix makes Vite return the final URL string.
// eslint-disable-next-line import/no-duplicates
// @ts-ignore - Vite handles ?url at build time
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

let configured = false;

export function ensurePdfjsWorker() {
  if (configured) return;
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
  configured = true;
}
