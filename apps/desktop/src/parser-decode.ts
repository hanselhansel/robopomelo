import { assertPdfPageCount, DEFAULT_INGESTION_LIMITS, preflightAttachment } from '@robopomelo/ingestion';
import type { PDFPageProxy } from 'pdfjs-dist';
import type { ParserRequest, ParserResponse, ParserWarning } from './parser-contracts.js';

const MAX_TEXT = 100_000;
const MAX_PREVIEWS = 3;
const MAX_EDGE = 1024;
const MAX_PREVIEW_BYTES = 2 * 1024 ** 2;

function empty(
  request: ParserRequest,
  state: 'failed' | 'unsupported',
  warning: ParserWarning,
): ParserResponse {
  return {
    jobId: request.jobId,
    generation: request.generation,
    state,
    textExcerpt: '',
    pageCount: 0,
    pageImages: [],
    warnings: [warning],
  };
}

function canvasFor(width: number, height: number): HTMLCanvasElement {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0)
    throw new Error('Invalid dimensions');
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(width * scale));
  canvas.height = Math.max(1, Math.floor(height * scale));
  return canvas;
}

async function pngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => (value ? resolve(value) : reject(new Error('PNG failed'))), 'image/png');
  });
  if (blob.size > MAX_PREVIEW_BYTES) {
    // At most 1024 pixels on either edge. Halving converges to a bounded PNG.
    if (canvas.width === 1 && canvas.height === 1) throw new Error('PNG too large');
    const smaller = canvasFor(
      Math.max(1, Math.floor(canvas.width / 2)),
      Math.max(1, Math.floor(canvas.height / 2)),
    );
    try {
      const context = smaller.getContext('2d');
      if (!context) throw new Error('Canvas unavailable');
      context.drawImage(canvas, 0, 0, smaller.width, smaller.height);
      return await pngBytes(smaller);
    } finally {
      smaller.width = smaller.height = 0;
    }
  }
  return new Uint8Array(await blob.arrayBuffer());
}

async function imagePreview(request: ParserRequest): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(
    new Blob([new Uint8Array(request.bytes)], {
      type: request.format === 'png' ? 'image/png' : 'image/jpeg',
    }),
  );
  try {
    if (bitmap.width * bitmap.height > DEFAULT_INGESTION_LIMITS.maxImagePixels)
      throw new Error('Image too large');
    const canvas = canvasFor(bitmap.width, bitmap.height);
    try {
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas unavailable');
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      return await pngBytes(canvas);
    } finally {
      canvas.width = canvas.height = 0;
    }
  } finally {
    bitmap.close();
  }
}

async function pageText(
  page: PDFPageProxy,
  remaining: number,
): Promise<{ text: string; truncated: boolean }> {
  const reader = page.streamTextContent({ includeMarkedContent: false }).getReader();
  let text = '';
  let finished = false;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) {
        finished = true;
        return { text, truncated: false };
      }
      for (const item of chunk.value.items) {
        if (!('str' in item)) continue;
        const part = item.str + (item.hasEOL ? '\n' : ' ');
        const room = remaining - text.length;
        text += part.slice(0, room);
        if (part.length > room || text.length === remaining) return { text, truncated: true };
      }
    }
  } finally {
    if (!finished) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

async function pdfPreview(page: PDFPageProxy, annotationMode: number): Promise<Uint8Array> {
  const original = page.getViewport({ scale: 1 });
  const canvas = canvasFor(original.width, original.height);
  try {
    const viewport = page.getViewport({
      scale: Math.min(canvas.width / original.width, canvas.height / original.height),
    });
    await page.render({ canvas, viewport, annotationMode }).promise;
    return await pngBytes(canvas);
  } finally {
    canvas.width = canvas.height = 0;
  }
}

async function decodePdf(request: ParserRequest): Promise<ParserResponse> {
  const { getDocument, GlobalWorkerOptions, AnnotationMode } = await import('pdfjs-dist');
  GlobalWorkerOptions.workerSrc = 'rp-parser://local/worker.mjs';
  const task = getDocument({
    data: request.bytes,
    enableXfa: false,
    useWorkerFetch: false,
    useWasm: false,
    disableFontFace: true,
    useSystemFonts: false,
    stopAtErrors: true,
    standardFontDataUrl: 'rp-parser://local/fonts/',
    cMapUrl: 'rp-parser://local/cmaps/',
    cMapPacked: true,
    maxImageSize: DEFAULT_INGESTION_LIMITS.maxImagePixels,
    canvasMaxAreaInBytes: DEFAULT_INGESTION_LIMITS.maxImagePixels * 4,
    disableAutoFetch: true,
    disableRange: true,
    disableStream: true,
    verbosity: 0,
  });
  try {
    const pdf = await task.promise;
    if (pdf.numPages > DEFAULT_INGESTION_LIMITS.maxPdfPages)
      return empty(request, 'unsupported', 'PAGE_LIMIT');
    assertPdfPageCount(pdf.numPages);
    let textExcerpt = '';
    const pageImages: Uint8Array[] = [];
    const warnings: ParserWarning[] = [];
    if (pdf.numPages > MAX_PREVIEWS) warnings.push('PREVIEW_LIMIT');
    for (let index = 1; index <= pdf.numPages; index++) {
      if (textExcerpt.length === MAX_TEXT && index > MAX_PREVIEWS) break;
      const page = await pdf.getPage(index);
      try {
        if (textExcerpt.length < MAX_TEXT) {
          const result = await pageText(page, MAX_TEXT - textExcerpt.length);
          textExcerpt += result.text;
          if (result.truncated && !warnings.includes('EXCERPT_TRUNCATED')) warnings.push('EXCERPT_TRUNCATED');
        }
        if (index <= MAX_PREVIEWS) pageImages.push(await pdfPreview(page, AnnotationMode.DISABLE));
      } finally {
        page.cleanup();
      }
    }
    textExcerpt = textExcerpt.trim();
    if (!textExcerpt) warnings.push('SCANNED_PDF');
    return {
      jobId: request.jobId,
      generation: request.generation,
      state: warnings.length ? 'partial' : 'parsed',
      textExcerpt,
      pageCount: pdf.numPages,
      pageImages,
      warnings,
    };
  } catch (error) {
    return error instanceof Error && error.name === 'PasswordException'
      ? empty(request, 'unsupported', 'PASSWORD_REQUIRED')
      : empty(request, 'failed', 'PARSE_FAILED');
  } finally {
    // Loading-task destruction also destroys the document transport and worker.
    await task.destroy();
  }
}

/** Called only in the disposable, network-denied browser renderer. */
export async function decodeAttachment(request: ParserRequest): Promise<ParserResponse> {
  try {
    const header = preflightAttachment({ displayName: 'Attachment', bytes: request.bytes });
    if (header.format !== request.format) return empty(request, 'failed', 'PARSE_FAILED');
    if (request.format === 'pdf') return await decodePdf(request);
    const preview = await imagePreview(request);
    return {
      jobId: request.jobId,
      generation: request.generation,
      state: 'parsed',
      textExcerpt: '',
      pageCount: 1,
      pageImages: [preview],
      warnings: [],
    };
  } catch {
    return empty(request, 'failed', 'PARSE_FAILED');
  }
}
