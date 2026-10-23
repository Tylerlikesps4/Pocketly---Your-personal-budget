import { describe, expect, it } from "vitest";
import { EMPTY_DATA, type BudgetData, type RecurringRule } from "../lib/budget";
import { nextDue, postDue, scheduledDate } from "../lib/recurring";

const rentRule: RecurringRule = {
  id: "rent",
  type: "expense",
  amount: 1000,
  currency: "USD",
  categoryId: "expense-housing",
  note: "Rent",
  day: 31,
  startDate: "2026-01-01",
  active: true,
};

function dataWith(overrides: Partial<BudgetData> = {}): BudgetData {
  return {
    version: 1,
    baseCurrency: "USD",
    categories: EMPTY_DATA.categories.map((category) => ({ ...category })),
    transactions: [],
    budgets: [],
    ...overrides,
  };
}

describe("recurring schedule core logic", () => {
  it("clamps short months, including leap February, and skips dates before a start date", () => {
    expect(scheduledDate("2026-02", 31)).toBe("2026-02-28");
    expect(scheduledDate("2024-02", 31)).toBe("2024-02-29");
    expect(
      nextDue({ ...rentRule, day: 1, startDate: "2026-01-15" }, "2026-01-20"),
    ).toBe("2026-02-01");
  });

  it("posts missed months once, then returns the original data reference when caught up", () => {
    const first = postDue(dataWith({ recurring: [rentRule] }), "2026-03-01");
    expect(first.posted).toBe(2);
    expect(
      first.data.transactions.map((transaction) => transaction.date),
    ).toEqual(["2026-01-31", "2026-02-28"]);
    expect(
      first.data.transactions.map((transaction) => transaction.id),
    ).toEqual(["recurring-rent-2026-01", "recurring-rent-2026-02"]);
    expect(first.data.recurring?.[0]?.lastPostedMonth).toBe("2026-02");

    const again = postDue(first.data, "2026-03-01");
    expect(again).toMatchObject({ posted: 0, blocked: [] });
    expect(again.data).toBe(first.data);
  });

  it("respects paused and ended rules", () => {
    expect(nextDue({ ...rentRule, active: false }, "2026-04-01")).toBeNull();
    expect(
      nextDue({ ...rentRule, day: 1, endDate: "2026-01-15" }, "2026-04-01"),
    ).toBe("2026-01-01");
    expect(
      nextDue(
        {
          ...rentRule,
          day: 31,
          endDate: "2026-02-15",
          lastPostedMonth: "2026-01",
        },
        "2026-04-01",
      ),
    ).toBeNull();
  });

  it("uses the watermark as a deletion tombstone rather than re-posting removed entries", () => {
    const posted = postDue(dataWith({ recurring: [rentRule] }), "2026-01-31");
    const deletedTransaction = {
      ...posted.data,
      transactions: [],
    };
    const afterDeletion = postDue(deletedTransaction, "2026-01-31");
    expect(afterDeletion.posted).toBe(0);
    expect(afterDeletion.data).toBe(deletedTransaction);
    expect(afterDeletion.data.recurring?.[0]?.lastPostedMonth).toBe("2026-01");
  });

  it("blocks foreign-currency posting without a cached rate and leaves its watermark unchanged", () => {
    const result = postDue(
      dataWith({
        recurring: [{ ...rentRule, id: "eur-rent", currency: "EUR" }],
      }),
      "2026-01-31",
    );
    expect(result).toMatchObject({ posted: 0, blocked: ["eur-rent"] });
    expect(result.data).toBeTruthy();
    expect(result.data.recurring?.[0]?.lastPostedMonth).toBeUndefined();
  });
  it("does not post or advance a watermark when a foreign amount rounds to zero", () => {
    const data = dataWith({
      rates: {
        base: "EUR",
        date: "2026-01-30",
        fetchedAt: "2026-01-30T12:00:00.000Z",
        rates: { EUR: 1, USD: 1.2, JPY: 180 },
      },
      recurring: [
        { ...rentRule, id: "tiny-jpy", amount: 0.01, currency: "JPY" },
      ],
    });
    const result = postDue(data, "2026-01-31");
    expect(result).toMatchObject({ posted: 0, blocked: ["tiny-jpy"] });
    expect(result.data).toBe(data);
    expect(result.data.recurring?.[0]?.lastPostedMonth).toBeUndefined();
  });
});
