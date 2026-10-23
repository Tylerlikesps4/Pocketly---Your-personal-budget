import type { RateSnapshot } from "./currency";

export type TransactionType = "income" | "expense";

export type Category = {
  id: string;
  name: string;
  type: TransactionType;
  color: string;
  icon: string;
};

export type Transaction = {
  id: string;
  type: TransactionType;
  amount: number;
  date: string;
  categoryId: string;
  note: string;
  /** Original entered amount; `amount` remains the locked home-currency value. */
  originalAmount?: number;
  currency?: string;
  exchangeRate?: number;
  rateDate?: string;
  recurringId?: string;
};

export type Budget = {
  month: string;
  categoryId: string;
  amount: number;
};

export type RecurringRule = {
  id: string;
  type: TransactionType;
  /** Amount in `currency`, before conversion to the current home currency. */
  amount: number;
  currency: string;
  categoryId: string;
  note: string;
  day: number;
  startDate: string;
  endDate?: string;
  active: boolean;
  lastPostedMonth?: string;
};

export type BudgetData = {
  version: 1;
  categories: Category[];
  transactions: Transaction[];
  budgets: Budget[];
  /** Optional to retain compatibility with original v1 files; defaults to USD. */
  baseCurrency?: string;
  rates?: RateSnapshot;
  recurring?: RecurringRule[];
};

const DEFAULT_CATEGORIES: Category[] = [
  {
    id: "income-salary",
    name: "Salary",
    type: "income",
    color: "#75AFA0",
    icon: "briefcase-outline",
  },
  {
    id: "income-freelance",
    name: "Freelance",
    type: "income",
    color: "#8DA4CB",
    icon: "laptop-outline",
  },
  {
    id: "income-other",
    name: "Other income",
    type: "income",
    color: "#8A76CB",
    icon: "add-circle-outline",
  },
  {
    id: "expense-housing",
    name: "Housing",
    type: "expense",
    color: "#8A76CB",
    icon: "home-outline",
  },
  {
    id: "expense-groceries",
    name: "Groceries",
    type: "expense",
    color: "#75AFA0",
    icon: "cart-outline",
  },
  {
    id: "expense-dining",
    name: "Dining",
    type: "expense",
    color: "#E4A47F",
    icon: "restaurant-outline",
  },
  {
    id: "expense-transport",
    name: "Transport",
    type: "expense",
    color: "#8DA4CB",
    icon: "car-outline",
  },
  {
    id: "expense-utilities",
    name: "Utilities",
    type: "expense",
    color: "#CCB879",
    icon: "flash-outline",
  },
  {
    id: "expense-entertainment",
    name: "Entertainment",
    type: "expense",
    color: "#DB91A7",
    icon: "film-outline",
  },
  {
    id: "expense-subscriptions",
    name: "Subscriptions",
    type: "expense",
    color: "#B7A0CD",
    icon: "repeat-outline",
  },
  {
    id: "expense-shopping",
    name: "Shopping",
    type: "expense",
    color: "#C99292",
    icon: "bag-handle-outline",
  },
  {
    id: "expense-health",
    name: "Health",
    type: "expense",
    color: "#A3B582",
    icon: "heart-outline",
  },
  {
    id: "expense-other",
    name: "Other",
    type: "expense",
    color: "#A0A4B3",
    icon: "pricetag-outline",
  },
];

/** A fresh, empty data set should be cloned before it is mutated by a store. */
export const EMPTY_DATA: BudgetData = {
  version: 1,
  categories: DEFAULT_CATEGORIES.map((category) => ({ ...category })),
  transactions: [],
  budgets: [],
};

const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const CURRENCY_CODES = new Set([
  "AUD",
  "BRL",
  "CAD",
  "CHF",
  "CNY",
  "CZK",
  "DKK",
  "EUR",
  "GBP",
  "HKD",
  "HUF",
  "IDR",
  "ILS",
  "INR",
  "ISK",
  "JPY",
  "KRW",
  "MXN",
  "MYR",
  "NOK",
  "NZD",
  "PHP",
  "PLN",
  "RON",
  "SEK",
  "SGD",
  "THB",
  "TRY",
  "USD",
  "ZAR",
]);

function assertMonth(month: string): void {
  if (!MONTH_PATTERN.test(month)) {
    throw new RangeError(`Expected month in YYYY-MM format, received ${month}`);
  }
}

function isMonth(value: unknown): value is string {
  return typeof value === "string" && MONTH_PATTERN.test(value);
}

function cents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100);
}

function moneyFromCents(value: number): number {
  return Math.round(value) / 100;
}

function sumAmounts(values: Iterable<number>): number {
  let total = 0;
  for (const value of values) total += cents(value);
  return moneyFromCents(total);
}

function monthDate(month: string): Date {
  assertMonth(month);
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year!, monthNumber! - 1, 1));
}

function inMonth(date: string, month: string): boolean {
  return isValidDate(date) && date.slice(0, 7) === month;
}

/** Returns a local-calendar month key, avoiding UTC date shifts in the app UI. */
export function monthKey(date: Date = new Date()): string {
  if (Number.isNaN(date.getTime()))
    throw new RangeError("Expected a valid Date");
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function shiftMonth(month: string, delta: number): string {
  assertMonth(month);
  if (!Number.isFinite(delta) || !Number.isInteger(delta)) {
    throw new RangeError("Month shift must be a finite integer");
  }
  const [year, currentMonth] = month.split("-").map(Number);
  const result = new Date(Date.UTC(year!, currentMonth! - 1 + delta, 1));
  return `${result.getUTCFullYear()}-${String(result.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function formatMonth(month: string, short = false): string {
  return new Intl.DateTimeFormat("en-US", {
    month: short ? "short" : "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(monthDate(month));
}

export function formatMoney(amount: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/** Accepts only real Gregorian dates written as YYYY-MM-DD. */
export function isValidDate(value: string): boolean {
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return (
    candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day
  );
}

/** Browser and Expo-safe ID generation, with a fallback for older runtimes. */
export function uniqueId(): string {
  const randomUUID = globalThis.crypto?.randomUUID;
  if (typeof randomUUID === "function")
    return randomUUID.call(globalThis.crypto);
  const randomPart = Math.random().toString(36).slice(2, 12);
  return `${Date.now().toString(36)}-${randomPart}`;
}

/**
 * Builds six useful months of sample data ending in `month`. The selected month
 * intentionally has $5,200 income, $3,245 expenses, and $396 dining on a $300 budget.
 */
export function createDemoData(month: string): BudgetData {
  assertMonth(month);
  const categories = DEFAULT_CATEGORIES.map((category) => ({ ...category }));
  const transactions: Transaction[] = [];
  const budgets: Budget[] = [];
  let sequence = 0;
  const add = (
    targetMonth: string,
    day: number,
    type: TransactionType,
    amount: number,
    categoryId: string,
    note: string,
  ) => {
    transactions.push({
      id: `demo-${targetMonth}-${sequence++}`,
      type,
      amount,
      date: `${targetMonth}-${String(day).padStart(2, "0")}`,
      categoryId,
      note,
    });
  };

  const months = Array.from({ length: 6 }, (_, index) =>
    shiftMonth(month, index - 5),
  );
  months.forEach((targetMonth, index) => {
    const isSelected = targetMonth === month;
    const salary = isSelected ? 4800 : 4700 + index * 25;
    const freelance = isSelected ? 400 : 250 + (index % 3) * 75;
    add(targetMonth, 1, "income", salary, "income-salary", "Salary deposit");
    add(
      targetMonth,
      15,
      "income",
      freelance,
      "income-freelance",
      "Freelance project",
    );

    if (isSelected) {
      add(targetMonth, 2, "expense", 1500, "expense-housing", "Rent");
      add(
        targetMonth,
        3,
        "expense",
        184.32,
        "expense-groceries",
        "Neighborhood market",
      );
      add(
        targetMonth,
        10,
        "expense",
        221.68,
        "expense-groceries",
        "Weekly groceries",
      );
      add(
        targetMonth,
        24,
        "expense",
        206,
        "expense-groceries",
        "Warehouse groceries",
      );
      add(
        targetMonth,
        5,
        "expense",
        126,
        "expense-dining",
        "Lunches and coffee",
      );
      add(
        targetMonth,
        13,
        "expense",
        142,
        "expense-dining",
        "Dinner with friends",
      );
      add(targetMonth, 22, "expense", 128, "expense-dining", "Weekend dining");
      add(targetMonth, 7, "expense", 98, "expense-transport", "Transit pass");
      add(
        targetMonth,
        19,
        "expense",
        144,
        "expense-transport",
        "Fuel and rideshare",
      );
      add(targetMonth, 9, "expense", 118, "expense-utilities", "Electricity");
      add(targetMonth, 20, "expense", 80, "expense-utilities", "Internet");
      add(
        targetMonth,
        11,
        "expense",
        155,
        "expense-entertainment",
        "Concert tickets",
      );
      add(
        targetMonth,
        6,
        "expense",
        69,
        "expense-subscriptions",
        "Monthly subscriptions",
      );
      add(
        targetMonth,
        17,
        "expense",
        73,
        "expense-shopping",
        "Household supplies",
      );
    } else {
      add(targetMonth, 2, "expense", 1500, "expense-housing", "Rent");
      add(
        targetMonth,
        6,
        "expense",
        520 + index * 8,
        "expense-groceries",
        "Groceries",
      );
      add(
        targetMonth,
        12,
        "expense",
        270 + index * 10,
        "expense-dining",
        "Dining out",
      );
      add(
        targetMonth,
        18,
        "expense",
        210 + index * 4,
        "expense-transport",
        "Transport",
      );
      add(targetMonth, 21, "expense", 190, "expense-utilities", "Utilities");
      add(
        targetMonth,
        25,
        "expense",
        120 + index * 5,
        "expense-entertainment",
        "Entertainment",
      );
      add(
        targetMonth,
        27,
        "expense",
        65,
        "expense-subscriptions",
        "Subscriptions",
      );
    }
  });

  [
    ["expense-housing", 1500],
    ["expense-groceries", 600],
    ["expense-dining", 300],
    ["expense-transport", 250],
    ["expense-utilities", 220],
    ["expense-entertainment", 160],
    ["expense-subscriptions", 80],
    ["expense-shopping", 150],
  ].forEach(([categoryId, amount]) => {
    budgets.push({
      month,
      categoryId: categoryId as string,
      amount: amount as number,
    });
  });

  return { version: 1, categories, transactions, budgets };
}

export function summarize(
  data: BudgetData,
  month: string,
): {
  income: number;
  expenses: number;
  balance: number;
  budgetTotal: number;
  remaining: number;
} {
  assertMonth(month);
  const income = sumAmounts(
    data.transactions
      .filter(
        (transaction) =>
          transaction.type === "income" && inMonth(transaction.date, month),
      )
      .map((transaction) => transaction.amount),
  );
  const expenses = sumAmounts(
    data.transactions
      .filter(
        (transaction) =>
          transaction.type === "expense" && inMonth(transaction.date, month),
      )
      .map((transaction) => transaction.amount),
  );
  const expenseCategories = new Set(
    data.categories
      .filter((category) => category.type === "expense")
      .map((category) => category.id),
  );
  const budgetTotal = sumAmounts(
    data.budgets
      .filter(
        (budget) =>
          budget.month === month && expenseCategories.has(budget.categoryId),
      )
      .map((budget) => budget.amount),
  );
  return {
    income,
    expenses,
    balance: moneyFromCents(cents(income) - cents(expenses)),
    budgetTotal,
    remaining: moneyFromCents(cents(budgetTotal) - cents(expenses)),
  };
}

export function categorySpending(
  data: BudgetData,
  month: string,
): { category: Category; spent: number; budget: number; remaining: number }[] {
  assertMonth(month);
  const expenseCategories = data.categories.filter(
    (category) => category.type === "expense",
  );
  const spendingByCategory = new Map<string, number>();
  const budgetByCategory = new Map<string, number>();

  for (const transaction of data.transactions) {
    if (transaction.type !== "expense" || !inMonth(transaction.date, month))
      continue;
    spendingByCategory.set(
      transaction.categoryId,
      (spendingByCategory.get(transaction.categoryId) ?? 0) +
        cents(transaction.amount),
    );
  }
  for (const budget of data.budgets) {
    if (budget.month !== month) continue;
    budgetByCategory.set(
      budget.categoryId,
      (budgetByCategory.get(budget.categoryId) ?? 0) + cents(budget.amount),
    );
  }

  return expenseCategories.map((category) => {
    const spentCents = spendingByCategory.get(category.id) ?? 0;
    const budgetCents = budgetByCategory.get(category.id) ?? 0;
    return {
      category,
      spent: moneyFromCents(spentCents),
      budget: moneyFromCents(budgetCents),
      remaining: moneyFromCents(budgetCents - spentCents),
    };
  });
}

export function trends(
  data: BudgetData,
  month: string,
  count = 6,
): { month: string; label: string; income: number; expenses: number }[] {
  assertMonth(month);
  const safeCount = Math.max(0, Math.floor(Number.isFinite(count) ? count : 0));
  return Array.from({ length: safeCount }, (_, index) => {
    const targetMonth = shiftMonth(month, index - safeCount + 1);
    const totals = summarize(data, targetMonth);
    return {
      month: targetMonth,
      label: formatMonth(targetMonth, true),
      income: totals.income,
      expenses: totals.expenses,
    };
  });
}

export type BudgetInsight = {
  id: string;
  tone: "warning" | "positive" | "neutral";
  title: string;
  detail: string;
};

export function insights(data: BudgetData, month: string): BudgetInsight[] {
  assertMonth(month);
  const totals = summarize(data, month);
  const breakdown = categorySpending(data, month);
  const result: BudgetInsight[] = [];
  const displayCurrency = data.baseCurrency ?? "USD";
  const overBudget = breakdown.filter(
    (item) => item.budget > 0 && item.spent > item.budget,
  );

  for (const item of overBudget) {
    const overage = moneyFromCents(cents(item.spent) - cents(item.budget));
    result.push({
      id: `over-budget-${item.category.id}`,
      tone: "warning",
      title: `${item.category.name} is ${Math.round((item.spent / item.budget - 1) * 100)}% over budget`,
      detail: `${formatMoney(overage, displayCurrency)} over its ${formatMoney(item.budget, displayCurrency)} monthly budget.`,
    });
  }

  if (totals.expenses === 0 && totals.income === 0) {
    result.push({
      id: "no-activity",
      tone: "neutral",
      title: "No activity yet",
      detail:
        "Add an income or expense transaction to start tracking this month.",
    });
    return result;
  }

  if (totals.income > 0 && totals.balance >= 0) {
    result.push({
      id: "positive-cash-flow",
      tone: "positive",
      title: "Positive cash flow",
      detail: `${formatMoney(totals.balance, displayCurrency)} remains after this month's expenses.`,
    });
  } else if (totals.income > 0) {
    result.push({
      id: "negative-cash-flow",
      tone: "warning",
      title: "Expenses exceed income",
      detail: `Expenses are ${formatMoney(Math.abs(totals.balance), displayCurrency)} higher than income this month.`,
    });
  } else {
    result.push({
      id: "no-income",
      tone: "neutral",
      title: "No income recorded",
      detail: `${formatMoney(totals.expenses, displayCurrency)} in expenses are recorded without income this month.`,
    });
  }

  if (
    totals.budgetTotal > 0 &&
    overBudget.length === 0 &&
    totals.remaining >= 0
  ) {
    result.push({
      id: "on-budget",
      tone: "positive",
      title: "On track with your budget",
      detail: `${formatMoney(totals.remaining, displayCurrency)} remains across this month's category budgets.`,
    });
  }

  const previous = summarize(data, shiftMonth(month, -1));
  if (previous.expenses > 0 && totals.expenses > previous.expenses) {
    const increase = Math.round(
      ((totals.expenses - previous.expenses) / previous.expenses) * 100,
    );
    const isCurrentMonth = month === monthKey();
    result.push({
      id: "spending-up",
      tone: "warning",
      title: "Spending is up from last month",
      detail: isCurrentMonth
        ? `So far, expenses are ${increase}% above the full previous month.`
        : `Expenses are ${increase}% above the previous month.`,
    });
  } else if (previous.expenses > 0 && totals.expenses < previous.expenses) {
    const decrease = Math.round(
      ((previous.expenses - totals.expenses) / previous.expenses) * 100,
    );
    result.push({
      id: "spending-down",
      tone: "positive",
      title: "Spending is down from last month",
      detail:
        month === monthKey()
          ? `So far, expenses are ${decrease}% below the full previous month.`
          : `Expenses are ${decrease}% below the previous month.`,
    });
  }

  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isTransactionType(value: unknown): value is TransactionType {
  return value === "income" || value === "expense";
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isCurrencyCode(value: unknown): value is string {
  return typeof value === "string" && CURRENCY_CODES.has(value);
}

function isRateSnapshot(value: unknown): value is RateSnapshot {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["base", "date", "fetchedAt", "rates"]) ||
    value.base !== "EUR" ||
    !isValidDate(typeof value.date === "string" ? value.date : "") ||
    !isNonEmptyString(value.fetchedAt) ||
    !Number.isFinite(Date.parse(value.fetchedAt)) ||
    !isRecord(value.rates) ||
    value.rates.EUR !== 1
  ) {
    return false;
  }
  const rateEntries = Object.entries(value.rates);
  return (
    rateEntries.length > 0 &&
    rateEntries.every(
      ([currency, rate]) =>
        CURRENCY_CODES.has(currency) &&
        typeof rate === "number" &&
        Number.isFinite(rate) &&
        rate > 0,
    )
  );
}

function isRecurringRule(
  value: unknown,
  categoryTypes: ReadonlyMap<string, TransactionType>,
): value is RecurringRule {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "id",
      "type",
      "amount",
      "currency",
      "categoryId",
      "note",
      "day",
      "startDate",
      "endDate",
      "active",
      "lastPostedMonth",
    ]) ||
    !isNonEmptyString(value.id) ||
    !isTransactionType(value.type) ||
    typeof value.amount !== "number" ||
    !Number.isFinite(value.amount) ||
    value.amount <= 0 ||
    !isCurrencyCode(value.currency) ||
    !isNonEmptyString(value.categoryId) ||
    categoryTypes.get(value.categoryId) !== value.type ||
    typeof value.note !== "string" ||
    typeof value.day !== "number" ||
    !Number.isInteger(value.day) ||
    value.day < 1 ||
    value.day > 31 ||
    !isValidDate(typeof value.startDate === "string" ? value.startDate : "") ||
    typeof value.active !== "boolean"
  ) {
    return false;
  }
  if (hasOwn(value, "endDate")) {
    if (
      !isValidDate(typeof value.endDate === "string" ? value.endDate : "") ||
      (value.endDate as string) < (value.startDate as string)
    ) {
      return false;
    }
  }
  return !hasOwn(value, "lastPostedMonth") || isMonth(value.lastPostedMonth);
}

/** Strictly validates persisted v1 data, including optional v1-compatible extensions. */
export function validData(input: unknown): input is BudgetData {
  if (
    !isRecord(input) ||
    !hasOnlyKeys(input, [
      "version",
      "categories",
      "transactions",
      "budgets",
      "baseCurrency",
      "rates",
      "recurring",
    ])
  ) {
    return false;
  }
  if (
    input.version !== 1 ||
    !Array.isArray(input.categories) ||
    !Array.isArray(input.transactions) ||
    !Array.isArray(input.budgets)
  ) {
    return false;
  }
  if (hasOwn(input, "baseCurrency") && !isCurrencyCode(input.baseCurrency)) {
    return false;
  }
  if (hasOwn(input, "rates") && !isRateSnapshot(input.rates)) return false;

  const categories = input.categories;
  const categoryIds = new Set<string>();
  const categoryTypes = new Map<string, TransactionType>();
  for (const category of categories) {
    if (
      !isRecord(category) ||
      !hasOnlyKeys(category, ["id", "name", "type", "color", "icon"])
    )
      return false;
    if (
      !isNonEmptyString(category.id) ||
      !isNonEmptyString(category.name) ||
      !isTransactionType(category.type) ||
      !isNonEmptyString(category.color) ||
      !isNonEmptyString(category.icon) ||
      categoryIds.has(category.id)
    ) {
      return false;
    }
    categoryIds.add(category.id);
    categoryTypes.set(category.id, category.type);
  }

  if (hasOwn(input, "recurring")) {
    if (!Array.isArray(input.recurring)) return false;
    const recurringIds = new Set<string>();
    for (const rule of input.recurring) {
      if (!isRecurringRule(rule, categoryTypes) || recurringIds.has(rule.id)) {
        return false;
      }
      recurringIds.add(rule.id);
    }
  }

  const transactionIds = new Set<string>();
  for (const transaction of input.transactions) {
    if (
      !isRecord(transaction) ||
      !hasOnlyKeys(transaction, [
        "id",
        "type",
        "amount",
        "date",
        "categoryId",
        "note",
        "originalAmount",
        "currency",
        "exchangeRate",
        "rateDate",
        "recurringId",
      ])
    ) {
      return false;
    }
    if (
      !isNonEmptyString(transaction.id) ||
      transactionIds.has(transaction.id) ||
      !isTransactionType(transaction.type) ||
      typeof transaction.amount !== "number" ||
      !Number.isFinite(transaction.amount) ||
      transaction.amount <= 0 ||
      !isValidDate(
        typeof transaction.date === "string" ? transaction.date : "",
      ) ||
      !isNonEmptyString(transaction.categoryId) ||
      typeof transaction.note !== "string" ||
      categoryTypes.get(transaction.categoryId) !== transaction.type
    ) {
      return false;
    }
    if (
      hasOwn(transaction, "recurringId") &&
      !isNonEmptyString(transaction.recurringId)
    ) {
      return false;
    }
    const metadataKeys = [
      "originalAmount",
      "currency",
      "exchangeRate",
      "rateDate",
    ];
    const hasConversionMetadata = metadataKeys.some((key) =>
      hasOwn(transaction, key),
    );
    if (
      hasConversionMetadata &&
      !metadataKeys.every((key) => hasOwn(transaction, key))
    ) {
      return false;
    }
    if (hasConversionMetadata) {
      const originalAmount = transaction.originalAmount;
      const currency = transaction.currency;
      const exchangeRate = transaction.exchangeRate;
      const rateDate = transaction.rateDate;
      if (
        typeof originalAmount !== "number" ||
        !Number.isFinite(originalAmount) ||
        originalAmount <= 0 ||
        !isCurrencyCode(currency) ||
        typeof exchangeRate !== "number" ||
        !Number.isFinite(exchangeRate) ||
        exchangeRate <= 0 ||
        !isValidDate(typeof rateDate === "string" ? rateDate : "") ||
        cents(transaction.amount) !== cents(originalAmount * exchangeRate)
      ) {
        return false;
      }
    }
    transactionIds.add(transaction.id);
  }

  const budgetKeys = new Set<string>();
  for (const budget of input.budgets) {
    if (
      !isRecord(budget) ||
      !hasOnlyKeys(budget, ["month", "categoryId", "amount"])
    )
      return false;
    if (
      !isMonth(budget.month) ||
      !isNonEmptyString(budget.categoryId) ||
      categoryTypes.get(budget.categoryId) !== "expense" ||
      typeof budget.amount !== "number" ||
      !Number.isFinite(budget.amount) ||
      budget.amount < 0
    ) {
      return false;
    }
    const key = `${budget.month}\u0000${budget.categoryId}`;
    if (budgetKeys.has(key)) return false;
    budgetKeys.add(key);
  }

  return true;
}
