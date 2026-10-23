import { describe, expect, it } from "vitest";
import { parseReceipt } from "../lib/receipt";

describe("receipt parser", () => {
  it("prefers a grand total over subtotal, tax, and a plain total", () => {
    const draft = parseReceipt(
      [
        "Northside Market",
        "Subtotal $10.00",
        "Tax $0.80",
        "TOTAL $10.80",
        "GRAND TOTAL EUR 12.34",
        "Change $1.00",
      ].join("\n"),
      87,
    );
    expect(draft).toMatchObject({
      amount: 12.34,
      currency: "EUR",
      note: "Northside Market",
      confidence: 87,
    });
  });

  it("parses real ISO and unambiguous numeric dates but leaves ambiguous numeric dates blank", () => {
    expect(parseReceipt("Store\nDate: 2026-02-03").date).toBe("2026-02-03");
    expect(parseReceipt("Store\n13/02/2026").date).toBe("2026-02-13");
    expect(parseReceipt("Store\n05/06/2026").date).toBeUndefined();
    expect(parseReceipt("Store\n2026-02-30").date).toBeUndefined();
  });

  it("does not guess USD from a bare dollar sign", () => {
    const draft = parseReceipt("Coffee Place\nTOTAL $4.50");
    expect(draft.amount).toBe(4.5);
    expect(draft.currency).toBeUndefined();
  });

  it("returns a reviewable empty draft when OCR contains no usable receipt values", () => {
    expect(parseReceipt("unreadable marks", 34)).toEqual({
      confidence: 34,
      text: "unreadable marks",
      note: "unreadable marks",
    });
  });

  it("parses a decimal-comma total and an explicit euro symbol", () => {
    expect(parseReceipt("Boulangerie du Centre\nTotal\n€ 12,34")).toMatchObject(
      {
        amount: 12.34,
        currency: "EUR",
      },
    );
  });
});
