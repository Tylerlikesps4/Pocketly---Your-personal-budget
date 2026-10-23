import { describe, expect, it } from "vitest";
import { EMPTY_DATA, type BudgetData, validData } from "../lib/budget";
import {
  changeBaseCurrency,
  convertAmount,
  money,
  rateFor,
  todayKey,
  type RateSnapshot,
} from "../lib/currency";

const snapshot: RateSnapshot = {
  base: "EUR",
  date: "2026-03-01",
  fetchedAt: "2026-03-01T12:00:00.000Z",
  rates: { EUR: 1, USD: 1.2, GBP: 0.8, CAD: 1.5 },
};

function dataWith(overrides: Partial<BudgetData> = {}): BudgetData {
  return {
    version: 1,
    categories: EMPTY_DATA.categories.map((category) => ({ ...category })),
    transactions: [],
    budgets: [],
    ...overrides,
  };
}

describe("currency core logic", () => {
  it("converts ECB cross-rates at cents and treats same-home conversion as rate one", () => {
    expect(rateFor(snapshot, "USD", "GBP")).toBeCloseTo(0.8 / 1.2);
    expect(convertAmount(10, "USD", "GBP", snapshot)).toBe(6.67);
    expect(convertAmount(10.005, "USD", "USD")).toBe(10.01);
    expect(() => rateFor(undefined, "EUR", "USD")).toThrow(
      "cached exchange rate",
    );
  });

  it("uses local calendar dates and the persisted home currency for display", () => {
    expect(todayKey(new Date(2026, 1, 3))).toBe("2026-02-03");
    expect(money(dataWith({ baseCurrency: "GBP" }), 12.5)).toContain("£12.50");
  });

  it("migrates locked accounting amounts while preserving original recurring currency", () => {
    const data = dataWith({
      baseCurrency: "USD",
      rates: snapshot,
      transactions: [
        {
          id: "legacy-usd",
          type: "income",
          amount: 120,
          date: "2026-03-01",
          categoryId: "income-salary",
          note: "Salary",
        },
        {
          id: "foreign-eur",
          type: "expense",
          amount: 12,
          originalAmount: 10,
          currency: "EUR",
          exchangeRate: 1.2,
          rateDate: "2026-03-01",
          date: "2026-03-02",
          categoryId: "expense-dining",
          note: "Lunch",
        },
      ],
      budgets: [{ month: "2026-03", categoryId: "expense-dining", amount: 24 }],
      recurring: [
        {
          id: "salary-eur",
          type: "income",
          amount: 1000,
          currency: "EUR",
          categoryId: "income-salary",
          note: "Monthly salary",
          day: 1,
          startDate: "2026-01-01",
          active: true,
        },
      ],
    });

    const changed = changeBaseCurrency(data, "EUR", snapshot);
    expect(changed.baseCurrency).toBe("EUR");
    expect(changed.transactions).toEqual([
      expect.objectContaining({
        id: "legacy-usd",
        amount: 100,
        originalAmount: 120,
        currency: "USD",
        rateDate: "2026-03-01",
      }),
      expect.objectContaining({
        id: "foreign-eur",
        amount: 10,
        originalAmount: 10,
        currency: "EUR",
      }),
    ]);
    expect(changed.budgets[0]?.amount).toBe(20);
    expect(changed.recurring).toEqual(data.recurring);
    expect(validData(changed)).toBe(true);
  });
  it("refuses to turn a tiny positive accounting amount into zero during migration", () => {
    const data = dataWith({
      baseCurrency: "EUR",
      transactions: [
        {
          id: "tiny",
          type: "expense",
          amount: 0.01,
          date: "2026-03-01",
          categoryId: "expense-dining",
          note: "Tiny amount",
        },
      ],
    });
    const smallRate = { ...snapshot, rates: { ...snapshot.rates, GBP: 0.2 } };
    expect(() => changeBaseCurrency(data, "GBP", smallRate)).toThrow(
      "round to zero",
    );
    expect(data.transactions[0]?.amount).toBe(0.01);
  });
});
