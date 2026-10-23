import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { createWorker, type Worker } from "tesseract.js";
import { parseReceipt } from "../lib/receipt";

const MAX_JSON_BYTES = 12 * 1024 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_BASE64_LENGTH = Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 4;
const TOTAL_OCR_TIMEOUT_MS = 95_000;
const MAX_CONCURRENT_OCR = 1;
const RATE_WINDOW_MS = 10 * 60_000;
const RATE_LIMIT = 6;
const MODEL_CACHE_PATH = join(tmpdir(), "pocketly-tesseract-eng");

// This directory contains only Tesseract language-model cache files. Receipt
// images and OCR text are passed through worker memory and are never written.
mkdirSync(MODEL_CACHE_PATH, { recursive: true });

let activeOcr = 0;
const attempts = new Map<string, { count: number; resetAt: number }>();

type ReceiptRequest = { image?: unknown; mimeType?: unknown };

function controlledError(res: Response, status: number, error: string): void {
  res.status(status).json({ error });
}

function isBase64(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= MAX_BASE64_LENGTH &&
    value.length % 4 === 0 &&
    /^[A-Za-z0-9+/]*={0,2}$/.test(value)
  );
}

function isValidImage(buffer: Buffer, mimeType: string): boolean {
  const jpeg =
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff;
  const png =
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a;
  return (
    (mimeType === "image/jpeg" && jpeg) || (mimeType === "image/png" && png)
  );
}

function mayScan(request: Request): boolean {
  const now = Date.now();
  if (attempts.size > 2_000) {
    for (const [key, value] of attempts) {
      if (value.resetAt <= now) attempts.delete(key);
    }
  }
  const key = request.ip || "unknown";
  const previous = attempts.get(key);
  const attempt =
    !previous || previous.resetAt <= now
      ? { count: 0, resetAt: now + RATE_WINDOW_MS }
      : previous;
  if (attempt.count >= RATE_LIMIT) return false;
  attempt.count += 1;
  attempts.set(key, attempt);
  return true;
}

/** Uses one deadline across worker initialization and recognition. */
function beforeDeadline<T>(
  operation: Promise<T>,
  deadlineAt: number,
): Promise<T> {
  const remaining = deadlineAt - Date.now();
  if (remaining <= 0) return Promise.reject(new Error("OCR_TIMEOUT"));
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback();
    };
    const timer = setTimeout(
      () => finish(() => reject(new Error("OCR_TIMEOUT"))),
      remaining,
    );
    operation.then(
      (value) => finish(() => resolve(value)),
      (error) => finish(() => reject(error)),
    );
  });
}

async function recognizeReceipt(
  image: Buffer,
  isClosed: () => boolean,
  setCancel: (cancel: () => void) => void,
) {
  const deadlineAt = Date.now() + TOTAL_OCR_TIMEOUT_MS;
  let worker: Worker | undefined;
  let cancelled = isClosed();
  let stopped: Promise<unknown> | undefined;
  const terminate = () => {
    if (!worker) return Promise.resolve();
    stopped ||= worker.terminate().catch(() => undefined);
    return stopped;
  };
  const cancel = () => {
    cancelled = true;
    void terminate();
  };
  const wasCancelled = () => cancelled || isClosed();
  setCancel(cancel);

  try {
    if (wasCancelled()) throw new Error("OCR_CANCELLED");
    const initialization = Promise.resolve().then(() =>
      createWorker("eng", 1, {
        cachePath: MODEL_CACHE_PATH,
        logger: () => undefined,
        errorHandler: () => undefined,
      }),
    );
    // If cancellation or timeout happens during initialization, a late worker is
    // still terminated as soon as it resolves.
    void initialization.then(
      (lateWorker) => {
        if (wasCancelled() || Date.now() >= deadlineAt) {
          void lateWorker.terminate().catch(() => undefined);
        }
      },
      () => undefined,
    );
    const initialized = await beforeDeadline(initialization, deadlineAt);
    if (wasCancelled()) {
      await initialized.terminate().catch(() => undefined);
      throw new Error("OCR_CANCELLED");
    }
    worker = initialized;
    const result = await beforeDeadline(
      Promise.resolve().then(() => worker!.recognize(image)),
      deadlineAt,
    );
    if (wasCancelled()) throw new Error("OCR_CANCELLED");
    return result.data;
  } finally {
    // This also marks a late initialization as unwanted after a timeout.
    cancelled = true;
    setCancel(() => undefined);
    await terminate();
  }
}

/**
 * Registers temporary receipt OCR with its own bounded parser. Mount after CORS
 * and before any global JSON/body parser so the 12 MB ceiling is effective.
 */
export function registerReceiptOCR(app: Express): void {
  app.post(
    "/api/receipts/ocr",
    (request: Request, response: Response, next: NextFunction) => {
      const declaredLength = Number(request.headers["content-length"] || 0);
      if (Number.isFinite(declaredLength) && declaredLength > MAX_JSON_BYTES) {
        return controlledError(
          response,
          413,
          "Receipt request is too large. Use a JPG or PNG smaller than 8 MB.",
        );
      }
      if (!mayScan(request)) {
        return controlledError(
          response,
          429,
          "Please wait a moment before scanning another receipt.",
        );
      }
      if (activeOcr >= MAX_CONCURRENT_OCR) {
        return controlledError(
          response,
          429,
          "Receipt scanning is busy. Please try again shortly.",
        );
      }

      next();
    },
    express.json({ limit: MAX_JSON_BYTES }),
    (
      error: unknown,
      _request: Request,
      response: Response,
      next: NextFunction,
    ) => {
      if (!error) return next();
      const tooLarge =
        typeof error === "object" &&
        error !== null &&
        "type" in error &&
        error.type === "entity.too.large";
      controlledError(
        response,
        tooLarge ? 413 : 400,
        tooLarge
          ? "Receipt request is too large. Use a JPG or PNG smaller than 8 MB."
          : "The receipt request could not be read. Please try again.",
      );
    },
    async (request: Request, response: Response) => {
      // Another parsed request may have started while this body was arriving.
      if (activeOcr >= MAX_CONCURRENT_OCR)
        return controlledError(
          response,
          429,
          "Receipt scanning is busy. Please try again shortly.",
        );
      const body = request.body as ReceiptRequest;
      if (
        !body ||
        typeof body.image !== "string" ||
        (body.mimeType !== "image/jpeg" && body.mimeType !== "image/png") ||
        !isBase64(body.image)
      ) {
        return controlledError(
          response,
          400,
          "Please choose a valid JPG or PNG receipt smaller than 8 MB.",
        );
      }

      const image = Buffer.from(body.image, "base64");
      if (
        image.length === 0 ||
        image.length > MAX_IMAGE_BYTES ||
        !isValidImage(image, body.mimeType)
      ) {
        return controlledError(
          response,
          400,
          "Please choose a valid JPG or PNG receipt smaller than 8 MB.",
        );
      }

      activeOcr += 1;
      let clientClosed = false;
      let cancelOcr: () => void = () => {};
      const onResponseClose = () => {
        // `close` also follows a normal finished response. Only mark cancellation
        // when the response was not fully written; never attach this to `request`.
        if (!response.writableEnded) {
          clientClosed = true;
          cancelOcr();
        }
      };
      response.once("close", onResponseClose);

      try {
        const result = await recognizeReceipt(
          image,
          () => clientClosed,
          (cancel) => {
            cancelOcr = cancel;
            if (clientClosed) cancel();
          },
        );
        if (!clientClosed && !response.headersSent) {
          response.json(parseReceipt(result.text, result.confidence));
        }
      } catch {
        if (!clientClosed && !response.headersSent) {
          controlledError(
            response,
            503,
            "Receipt scan could not be completed. Please try again.",
          );
        }
      } finally {
        response.removeListener("close", onResponseClose);
        activeOcr -= 1;
      }
    },
  );
}

export const __receiptOcrTestUtils = { isBase64, isValidImage };
