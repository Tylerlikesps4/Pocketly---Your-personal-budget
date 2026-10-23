import { describe, expect, it } from "vitest";
import { EMPTY_DATA, type BudgetData } from "../lib/budget";
import {
  csvTransactions,
  guessMapping,
  parseCSV,
  previewImport,
} from "../lib/csv";

function emptyData(): BudgetData {
  return {
    version: 1,
    categories: EMPTY_DATA.categories.map((category) => ({ ...category })),
    transactions: [],
    budgets: [],
  };
}

describe("CSV helpers", () => {
  it("parses BOM-prefixed CRLF CSV with commas, escaped quotes, and quoted newlines", () => {
    expect(
      parseCSV(
        '\uFEFFdate,note\r\n2026-01-01,"Coffee, ""tea""\r\nand lunch"\r\n',
      ),
    ).toEqual([
      ["date", "note"],
      ["2026-01-01", 'Coffee, "tea"\nand lunch'],
    ]);
  });

  it("rejects an unclosed quoted field instead of silently corrupting imported records", () => {
    expect(() => parseCSV('date,note\n2026-01-01,"Unfinished')).toThrow(
      "unclosed",
    );
  });

  it("guesses conventional headers and validates mapping before import", () => {
    expect(
      guessMapping([
        "Posted Date",
        "Transaction Type",
        "Amount",
        "Category",
        "Memo",
      ]),
    ).toEqual({
      date: 0,
      type: 1,
      amount: 2,
      category: 3,
      note: 4,
    });
    const preview = previewImport(
      "date,type,amount,category\n2026-01-01,income,5,Salary",
      {
        date: -1,
        type: 1,
        amount: 2,
        category: 3,
        note: -1,
      },
      emptyData(),
    );
    expect(preview.transactions).toEqual([]);
    expect(preview.errors[0]).toMatchObject({
      row: 1,
      message: expect.stringContaining("date"),
    });
  });

  it("skips invalid records and detects existing and in-file duplicates", () => {
    const data = emptyData();
    data.transactions.push({
      id: "existing",
      date: "2026-04-01",
      type: "expense",
      amount: 12.5,
      categoryId: "expense-dining",
      note: "Lunch",
    });
    const text = [
      "date,type,amount,category,note",
      "2026-04-01,debit,12.50,dining,Lunch",
      "2026-04-02,credit,1000.25,Side Work,April work",
      "2026-02-30,expense,10,Dining,bad date",
      "2026-04-03,expense,1.234,Dining,bad cents",
      "2026-04-02,income,1000.25,side work,April work",
    ].join("\n");
    const preview = previewImport(
      text,
      { date: 0, type: 1, amount: 2, category: 3, note: 4 },
      data,
    );

    expect(preview.totalRows).toBe(5);
    expect(preview.duplicates).toBe(2);
    expect(preview.errors).toHaveLength(2);
    expect(preview.transactions).toHaveLength(1);
    expect(preview.transactions[0]).toMatchObject({
      type: "income",
      amount: 1000.25,
      note: "April work",
    });
    expect(preview.categories).toEqual([
      expect.objectContaining({ name: "Side Work", type: "income" }),
    ]);
  });

  it("exports spreadsheet-safe transaction CSV that can be previewed again", () => {
    const data = emptyData();
    data.transactions.push({
      id: "formula",
      date: "2026-05-01",
      type: "expense",
      amount: 3.5,
      categoryId: "expense-dining",
      note: '=HYPERLINK("https://bad.example")',
    });
    const exported = csvTransactions(data);
    expect(exported).toContain("'=HYPERLINK");

    const preview = previewImport(
      exported,
      { date: 0, type: 1, amount: 2, category: 3, note: 4 },
      emptyData(),
    );
    expect(preview.errors).toEqual([]);
    expect(preview.transactions[0]).toMatchObject({
      amount: 3.5,
      categoryId: "expense-dining",
      note: '=HYPERLINK("https://bad.example")',
    });
  });

  it("round-trips locked foreign values offline when exported base currency matches home", () => {
    const source = emptyData();
    source.baseCurrency = "USD";
    source.transactions.push({
      id: "eur-lunch",
      date: "2026-05-02",
      type: "expense",
      amount: 12.34,
      originalAmount: 10,
      currency: "EUR",
      exchangeRate: 1.234,
      rateDate: "2026-05-01",
      categoryId: "expense-dining",
      note: "Lunch abroad",
    });

    const exported = csvTransactions(source);
    const mapping = guessMapping(parseCSV(exported)[0]!);
    expect(mapping).toMatchObject({
      currency: 5,
      baseAmount: 6,
      baseCurrency: 7,
      exchangeRate: 8,
      rateDate: 9,
    });

    const target = emptyData();
    target.baseCurrency = "USD";
    const preview = previewImport(exported, mapping, target);
    expect(preview.errors).toEqual([]);
    expect(preview.transactions).toEqual([
      expect.objectContaining({
        amount: 12.34,
        originalAmount: 10,
        currency: "EUR",
        exchangeRate: 1.234,
        rateDate: "2026-05-01",
      }),
    ]);
  });
});
