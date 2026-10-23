import { afterEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { request as httpRequest, type Server } from "node:http";

const mocks = vi.hoisted(() => ({ createWorker: vi.fn() }));
vi.mock("tesseract.js", () => ({ createWorker: mocks.createWorker }));

import { registerReceiptOCR } from "../server/receipt-ocr";

let server: Server | undefined;

async function start(): Promise<string> {
  const app = express();
  registerReceiptOCR(app);
  app.use(express.json({ limit: "50mb" }));
  server = app.listen(0);
  await new Promise<void>((resolve) => server?.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("server unavailable");
  return `http://127.0.0.1:${address.port}`;
}

afterEach(async () => {
  vi.clearAllMocks();
  if (!server) return;
  await new Promise<void>((resolve, reject) =>
    server?.close((error) => (error ? reject(error) : resolve())),
  );
  server = undefined;
});

describe("temporary receipt OCR route", () => {
  it("rejects an image whose declared MIME type does not match its magic bytes", async () => {
    const base = await start();
    const response = await fetch(`${base}/api/receipts/ocr`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image: Buffer.from("not a receipt").toString("base64"),
        mimeType: "image/jpeg",
      }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Please choose a valid JPG or PNG receipt smaller than 8 MB.",
    });
    expect(mocks.createWorker).not.toHaveBeenCalled();
  });

  it("rejects an oversized declared request before parsing or initializing OCR", async () => {
    const base = await start();
    const result = await new Promise<{ status: number; text: string }>(
      (resolve, reject) => {
        const request = httpRequest(
          `${base}/api/receipts/ocr`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Content-Length": String(13 * 1024 * 1024),
              Connection: "close",
            },
          },
          (response) => {
            let text = "";
            response.on("data", (chunk) => {
              text += String(chunk);
            });
            response.on("end", () =>
              resolve({ status: response.statusCode || 0, text }),
            );
          },
        );
        request.on("error", reject);
        request.end("{}");
      },
    );
    expect(result.status).toBe(413);
    expect(JSON.parse(result.text).error).toContain("too large");
    expect(mocks.createWorker).not.toHaveBeenCalled();
  });
  it("keeps the input in memory and returns only a parsed review draft", async () => {
    const terminate = vi.fn().mockResolvedValue(undefined);
    mocks.createWorker.mockResolvedValue({
      recognize: vi.fn().mockResolvedValue({
        data: { text: "Local Grocer\nGRAND TOTAL USD 14.20", confidence: 91 },
      }),
      terminate,
    });
    const base = await start();
    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
    ]);
    const response = await fetch(`${base}/api/receipts/ocr`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image: png.toString("base64"),
        mimeType: "image/png",
      }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      amount: 14.2,
      currency: "USD",
      note: "Local Grocer",
      confidence: 91,
    });
    expect(terminate).toHaveBeenCalledOnce();
  });
});
