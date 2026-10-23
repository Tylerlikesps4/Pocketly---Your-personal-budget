import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  pick: vi.fn(),
  available: vi.fn(),
  share: vi.fn(),
  create: vi.fn(),
  write: vi.fn(),
  text: vi.fn(),
}));
vi.mock("expo-document-picker", () => ({ getDocumentAsync: mocks.pick }));
vi.mock("expo-sharing", () => ({
  isAvailableAsync: mocks.available,
  shareAsync: mocks.share,
}));
vi.mock("expo-file-system", () => ({
  Paths: { cache: "file:///cache" },
  File: class {
    uri: string;
    constructor(...parts: string[]) {
      this.uri = parts.join("/");
    }
    create = mocks.create;
    write = mocks.write;
    text = mocks.text;
  },
}));
import { chooseCSV, downloadCSV } from "../lib/file-io";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.available.mockResolvedValue(true);
  mocks.share.mockResolvedValue(undefined);
});
describe("native CSV files", () => {
  it("writes and shares a named CSV attachment rather than plain message text", async () => {
    await downloadCSV("date,type,amount\n", "pocketly-transactions.csv");
    expect(mocks.create).toHaveBeenCalledWith({ overwrite: true });
    expect(mocks.write).toHaveBeenCalledWith("\uFEFFdate,type,amount\n");
    expect(mocks.share).toHaveBeenCalledWith(
      "file:///cache/pocketly-transactions.csv",
      expect.objectContaining({
        mimeType: "text/csv",
        UTI: "public.comma-separated-values-text",
      }),
    );
  });
  it("reads a picked CSV from a local file and respects cancellation", async () => {
    mocks.pick.mockResolvedValue({
      canceled: false,
      assets: [{ name: "budget.csv", uri: "file:///budget.csv", size: 100 }],
    });
    mocks.text.mockResolvedValue("date,type,amount,category\n");
    expect(await chooseCSV()).toEqual({
      name: "budget.csv",
      text: "date,type,amount,category\n",
    });
    mocks.pick.mockResolvedValue({ canceled: true, assets: null });
    expect(await chooseCSV()).toBeNull();
  });
  it("rejects oversized or non-CSV files before reading", async () => {
    mocks.pick.mockResolvedValue({
      canceled: false,
      assets: [{ name: "private.pdf", uri: "file:///x", size: 1 }],
    });
    await expect(chooseCSV()).rejects.toThrow(".csv");
    mocks.pick.mockResolvedValue({
      canceled: false,
      assets: [{ name: "big.csv", uri: "file:///x", size: 11 * 1024 * 1024 }],
    });
    await expect(chooseCSV()).rejects.toThrow("10 MB");
    expect(mocks.text).not.toHaveBeenCalled();
  });
  it("fails visibly if the device cannot share files", async () => {
    mocks.available.mockResolvedValue(false);
    await expect(downloadCSV("a,b", "test.csv")).rejects.toThrow(
      "not available",
    );
    expect(mocks.write).not.toHaveBeenCalled();
  });
});
