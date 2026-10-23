import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  permission: vi.fn(),
  camera: vi.fn(),
  library: vi.fn(),
  document: vi.fn(),
  base64: vi.fn(),
  removeFile: vi.fn(),
}));
vi.mock("expo-image-picker", () => ({
  requestCameraPermissionsAsync: mocks.permission,
  launchCameraAsync: mocks.camera,
  launchImageLibraryAsync: mocks.library,
  CameraType: { back: "back" },
}));
vi.mock("@/constants/oauth", () => ({
  getApiBaseUrl: () => "https://example.invalid",
}));
vi.mock("expo-document-picker", () => ({ getDocumentAsync: mocks.document }));
vi.mock("expo-file-system", () => ({
  File: class {
    exists = true;
    size = 16;
    base64 = mocks.base64;
    delete = mocks.removeFile;
  },
}));
import { chooseReceipt, scanReceipt, releaseReceipt } from "../lib/receipt-io";
const image = {
  uri: "file:///temporary-receipt.jpg",
  image: "/9j/AA==",
  mimeType: "image/jpeg",
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.permission.mockResolvedValue({ granted: true });
});
afterEach(() => vi.unstubAllGlobals());
describe("Expo Go receipt boundaries", () => {
  it("requests permission before using the camera and handles denied access", async () => {
    mocks.permission.mockResolvedValue({ granted: false });
    await expect(chooseReceipt("camera")).rejects.toThrow(
      "Camera access is denied",
    );
    expect(mocks.camera).not.toHaveBeenCalled();
    mocks.permission.mockResolvedValue({ granted: true });
    mocks.camera.mockResolvedValue({
      canceled: false,
      assets: [{ uri: image.uri, base64: image.image, mimeType: "image/heic" }],
    });
    expect(await chooseReceipt("camera")).toMatchObject(image);
    expect(mocks.camera).toHaveBeenCalledWith(
      expect.objectContaining({ base64: true, exif: false }),
    );
  });
  it("handles photo-library cancellation without requesting camera access", async () => {
    mocks.library.mockResolvedValue({ canceled: true, assets: null });
    expect(await chooseReceipt("library")).toBeNull();
    expect(mocks.permission).not.toHaveBeenCalled();
  });
  it("accepts a bounded JPG from Files and cleans up only its temporary copy", async () => {
    mocks.document.mockResolvedValue({
      canceled: false,
      assets: [{ name: "receipt.jpg", uri: image.uri, size: 16 }],
    });
    mocks.base64.mockResolvedValue(image.image);
    const picked = await chooseReceipt("file");
    expect(picked).toMatchObject({
      ...image,
      name: "receipt.jpg",
      temporaryCopy: true,
    });
    expect(mocks.document).toHaveBeenCalledWith(
      expect.objectContaining({
        copyToCacheDirectory: true,
        type: ["image/jpeg", "image/png"],
      }),
    );
    releaseReceipt(picked!);
    expect(mocks.removeFile).toHaveBeenCalledOnce();
    releaseReceipt(image);
    expect(mocks.removeFile).toHaveBeenCalledOnce();
  });
  it("rejects an oversized receipt image file before reading it", async () => {
    mocks.document.mockResolvedValue({
      canceled: false,
      assets: [{ name: "receipt.png", uri: image.uri, size: 9 * 1024 * 1024 }],
    });
    await expect(chooseReceipt("file")).rejects.toThrow("8 MB");
    expect(mocks.base64).not.toHaveBeenCalled();
  });
  it("sends only the selected image to temporary OCR and returns review details", async () => {
    const draft = {
      amount: 12.5,
      date: "2026-10-23",
      note: "Market",
      currency: "USD",
      confidence: 91,
      text: "Market\nUSD Total 12.50",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => draft });
    vi.stubGlobal("fetch", fetchMock);
    expect(await scanReceipt(image, vi.fn())).toEqual(draft);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.invalid/api/receipts/ocr",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ image: image.image, mimeType: image.mimeType }),
      }),
    );
  });
  it("does not upload when the scan is already cancelled and surfaces controlled server errors", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Please try again shortly." }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const abort = new AbortController();
    abort.abort();
    await expect(
      scanReceipt(image, vi.fn(), abort.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(scanReceipt(image, vi.fn())).rejects.toThrow(
      "Please try again shortly.",
    );
  });
});
