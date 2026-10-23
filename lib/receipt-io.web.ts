import type { ReceiptDraft, ReceiptImage } from "./receipt";
import { parseReceipt } from "./receipt";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_OCR_PIXELS = 16_000_000;
const TOTAL_OCR_TIMEOUT_MS = 95_000;
const SCRIPT_LOAD_TIMEOUT_MS = 25_000;
const TESSERACT_SCRIPT =
  "https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js";
const TESSERACT_WORKER =
  "https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/worker.min.js";
const TESSERACT_CORE = "https://cdn.jsdelivr.net/npm/tesseract.js-core@6.1.2";

type BrowserWorker = {
  recognize: (
    image: Blob,
  ) => Promise<{ data: { text: string; confidence: number } }>;
  terminate: () => Promise<unknown>;
};
type BrowserTesseract = {
  createWorker: (
    language: string,
    oem: number,
    options: {
      workerPath: string;
      corePath: string;
      logger: (message: { progress?: number }) => void;
    },
  ) => Promise<BrowserWorker>;
};

declare global {
  interface Window {
    Tesseract?: BrowserTesseract;
  }
}

let tesseractScript: Promise<BrowserTesseract> | undefined;

function abortError(): Error {
  const error = new Error("Receipt scan cancelled.");
  error.name = "AbortError";
  return error;
}

function scanError(): Error {
  return new Error("Receipt scan could not be completed. Please try again.");
}

/** Settles at the shared scan deadline and always clears its success-path timer. */
function beforeDeadline<T>(
  operation: Promise<T>,
  deadlineAt: number,
  signal?: AbortSignal,
): Promise<T> {
  if (signal?.aborted) return Promise.reject(abortError());
  const remaining = deadlineAt - Date.now();
  if (remaining <= 0) return Promise.reject(scanError());

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      callback();
    };
    const abort = () => finish(() => reject(abortError()));
    const timer = window.setTimeout(
      () => finish(() => reject(scanError())),
      remaining,
    );
    signal?.addEventListener("abort", abort, { once: true });
    operation.then(
      (value) => finish(() => resolve(value)),
      () => finish(() => reject(scanError())),
    );
  });
}

function assertSupportedImage(blob: Blob): void {
  if (blob.size > MAX_IMAGE_BYTES) {
    throw new Error("Please choose a JPG or PNG receipt smaller than 8 MB.");
  }
  if (blob.type !== "image/jpeg" && blob.type !== "image/png") {
    throw new Error("Please choose a JPG or PNG receipt image.");
  }
}

async function assertImageMagic(blob: Blob): Promise<void> {
  const bytes = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png =
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a;
  if (
    (blob.type === "image/jpeg" && !jpeg) ||
    (blob.type === "image/png" && !png)
  ) {
    throw new Error("The selected file is not a valid JPG or PNG image.");
  }
}

/** Loads only the browser UMD bundle. A failed load is forgotten so retry works. */
function loadTesseract(): Promise<BrowserTesseract> {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (tesseractScript) return tesseractScript;

  const pending = new Promise<BrowserTesseract>((resolve, reject) => {
    const script = document.createElement("script");
    const fail = () => {
      window.clearTimeout(timer);
      script.onload = null;
      script.onerror = null;
      script.remove();
      reject(scanError());
    };
    const timer = window.setTimeout(fail, SCRIPT_LOAD_TIMEOUT_MS);
    script.src = TESSERACT_SCRIPT;
    script.async = true;
    script.onload = () => {
      window.clearTimeout(timer);
      script.onload = null;
      script.onerror = null;
      if (window.Tesseract) resolve(window.Tesseract);
      else fail();
    };
    script.onerror = fail;
    document.head.appendChild(script);
  });
  tesseractScript = pending;
  void pending.catch(() => {
    if (tesseractScript === pending) tesseractScript = undefined;
  });
  return pending;
}

async function scaledForOcr(blob: Blob): Promise<Blob> {
  const url = URL.createObjectURL(blob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () =>
        reject(new Error("The receipt image could not be read."));
      element.src = url;
    });
    const pixels = image.naturalWidth * image.naturalHeight;
    if (!pixels || pixels <= MAX_OCR_PIXELS) return blob;

    const scale = Math.sqrt(MAX_OCR_PIXELS / pixels);
    const width = Math.max(1, Math.floor(image.naturalWidth * scale));
    const height = Math.max(1, Math.floor(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context)
      throw new Error("Receipt OCR is unavailable in this browser.");
    context.drawImage(image, 0, 0, width, height);
    const mimeType = blob.type === "image/png" ? "image/png" : "image/jpeg";
    const result = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, mimeType, 0.92),
    );
    if (!result) throw new Error("The receipt image could not be prepared.");
    return result;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function chooseReceipt(
  source: "camera" | "library" | "file",
): Promise<ReceiptImage | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/jpeg,image/png";
    if (source === "camera") input.setAttribute("capture", "environment");
    input.onchange = async () => {
      try {
        const blob = input.files?.[0];
        if (!blob) return resolve(null);
        assertSupportedImage(blob);
        await assertImageMagic(blob);
        resolve({
          uri: URL.createObjectURL(blob),
          blob,
          mimeType: blob.type,
          name: blob.name,
        });
      } catch (error) {
        reject(error);
      }
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

export async function scanReceipt(
  image: ReceiptImage,
  onProgress: (progress: number) => void,
  signal?: AbortSignal,
): Promise<ReceiptDraft> {
  const blob = image.blob;
  if (!blob)
    throw new Error(
      "The selected receipt is unavailable. Please choose it again.",
    );
  assertSupportedImage(blob);
  await assertImageMagic(blob);
  if (signal?.aborted) throw abortError();

  const deadlineAt = Date.now() + TOTAL_OCR_TIMEOUT_MS;
  let worker: BrowserWorker | undefined;
  let acceptWorker = true;
  let terminating: Promise<unknown> | undefined;
  const terminate = () => {
    if (!worker) return Promise.resolve();
    terminating ||= worker.terminate().catch(() => undefined);
    return terminating;
  };
  const cancel = () => {
    void terminate();
  };
  signal?.addEventListener("abort", cancel, { once: true });

  try {
    onProgress(2);
    const tesseract = await beforeDeadline(loadTesseract(), deadlineAt, signal);
    const initialization = Promise.resolve().then(() =>
      tesseract.createWorker("eng", 1, {
        workerPath: TESSERACT_WORKER,
        corePath: TESSERACT_CORE,
        // Tesseract's documented default langPath is retained. It downloads only
        // English model data locally in the browser cache.
        logger: ({ progress }) => {
          if (!signal?.aborted && typeof progress === "number") {
            onProgress(Math.max(2, Math.min(99, Math.round(progress * 100))));
          }
        },
      }),
    );
    // If the deadline or cancellation wins, Tesseract can still resolve its
    // initialization later. Terminate that late worker instead of leaving it alive.
    void initialization.then(
      (lateWorker) => {
        if (!acceptWorker || signal?.aborted) {
          void lateWorker.terminate().catch(() => undefined);
        }
      },
      () => undefined,
    );
    const initialized = await beforeDeadline(
      initialization,
      deadlineAt,
      signal,
    );
    if (signal?.aborted) {
      await initialized.terminate().catch(() => undefined);
      throw abortError();
    }
    worker = initialized;

    const ocrImage = await beforeDeadline(
      scaledForOcr(blob),
      deadlineAt,
      signal,
    );
    const result = await beforeDeadline(
      Promise.resolve().then(() => worker!.recognize(ocrImage)),
      deadlineAt,
      signal,
    );
    if (signal?.aborted) throw abortError();
    onProgress(100);
    return parseReceipt(result.data.text, result.data.confidence);
  } catch (error) {
    if (
      signal?.aborted ||
      (error instanceof Error && error.name === "AbortError")
    ) {
      throw abortError();
    }
    throw scanError();
  } finally {
    acceptWorker = false;
    signal?.removeEventListener("abort", cancel);
    await terminate();
  }
}

export function releaseReceipt(image: ReceiptImage): void {
  if (image.uri.startsWith("blob:")) URL.revokeObjectURL(image.uri);
}
