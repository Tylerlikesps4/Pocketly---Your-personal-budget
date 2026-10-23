import { describe, expect, it } from "vitest";
import {
  EMPTY_DATA,
  type BudgetData,
  categorySpending,
  createDemoData,
  isValidDate,
  monthKey,
  insights,
  shiftMonth,
  summarize,
  trends,
  validData,
} from "../lib/budget";

function dataWith(overrides: Partial<BudgetData>): BudgetData {
  return {
    version: 1,
    categories: EMPTY_DATA.categories.map((category) => ({ ...category })),
    transactions: [],
    budgets: [],
    ...overrides,
  };
}

describe("budget domain logic", () => {
  it("rounds arithmetic at cents rather than leaking floating-point precision", () => {
    const data = dataWith({
      transactions: [
        {
          id: "i1",
          type: "income",
          amount: 0.1,
          date: "2026-02-01",
          categoryId: "income-other",
          note: "a",
        },
        {
          id: "i2",
          type: "income",
          amount: 0.2,
          date: "2026-02-02",
          categoryId: "income-other",
          note: "b",
        },
        {
          id: "e1",
          type: "expense",
          amount: 0.1,
          date: "2026-02-03",
          categoryId: "expense-dining",
          note: "c",
        },
      ],
      budgets: [
        { month: "2026-02", categoryId: "expense-dining", amount: 0.3 },
      ],
    });

    expect(summarize(data, "2026-02")).toEqual({
      income: 0.3,
      expenses: 0.1,
      balance: 0.2,
      budgetTotal: 0.3,
      remaining: 0.2,
    });
  });

  it("handles month and date boundaries strictly", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2025-12", 1)).toBe("2026-01");
    expect(monthKey(new Date(2024, 1, 29))).toBe("2024-02");
    expect(isValidDate("2024-02-29")).toBe(true);
    expect(isValidDate("2025-02-29")).toBe(false);
    expect(isValidDate("2026-2-01")).toBe(false);
  });

  it("includes unbudgeted expense categories and flags over-budget spending", () => {
    const data = dataWith({
      transactions: [
        {
          id: "e1",
          type: "expense",
          amount: 396,
          date: "2026-03-04",
          categoryId: "expense-dining",
          note: "Meals",
        },
        {
          id: "e2",
          type: "expense",
          amount: 22,
          date: "2026-03-05",
          categoryId: "expense-health",
          note: "Pharmacy",
        },
      ],
      budgets: [
        { month: "2026-03", categoryId: "expense-dining", amount: 300 },
      ],
    });

    const breakdown = categorySpending(data, "2026-03");
    expect(
      breakdown.find((item) => item.category.id === "expense-dining"),
    ).toMatchObject({
      spent: 396,
      budget: 300,
      remaining: -96,
    });
    expect(
      breakdown.find((item) => item.category.id === "expense-health"),
    ).toMatchObject({
      spent: 22,
      budget: 0,
      remaining: -22,
    });
  });

  it("provides six chronological monthly trends and a complete demo selection", () => {
    const data = createDemoData("2026-06");
    expect(summarize(data, "2026-06")).toMatchObject({
      income: 5200,
      expenses: 3245,
    });
    expect(
      categorySpending(data, "2026-06").find(
        (item) => item.category.id === "expense-dining",
      ),
    ).toMatchObject({
      spent: 396,
      budget: 300,
    });
    expect(trends(data, "2026-06").map((item) => item.month)).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
    ]);
  });

  it("explains dining overspend in plain English with the correct percentage", () => {
    const data = createDemoData("2026-10");
    expect(insights(data, "2026-10")).toContainEqual(
      expect.objectContaining({
        title: "Dining is 32% over budget",
        detail: "$96.00 over its $300.00 monthly budget.",
      }),
    );
  });

  it("rejects malformed persisted data, dangling references, and duplicate budgets", () => {
    expect(validData(dataWith({}))).toBe(true);
    expect(validData({ ...dataWith({}), version: 2 })).toBe(false);
    expect(
      validData(
        dataWith({
          transactions: [
            {
              id: "x",
              type: "expense",
              amount: 1,
              date: "2026-02-30",
              categoryId: "expense-dining",
              note: "",
            },
          ],
        }),
      ),
    ).toBe(false);
    expect(
      validData(
        dataWith({
          budgets: [
            { month: "2026-02", categoryId: "expense-dining", amount: 20 },
            { month: "2026-02", categoryId: "expense-dining", amount: 30 },
          ],
        }),
      ),
    ).toBe(false);
  });
});
