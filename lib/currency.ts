import type { BudgetData } from "./budget";

/** ECB-published currencies available from the Frankfurter ECB provider. */
export const CURRENCIES = [
  { code: "AUD", name: "Australian Dollar" },
  { code: "BRL", name: "Brazilian Real" },
  { code: "CAD", name: "Canadian Dollar" },
  { code: "CHF", name: "Swiss Franc" },
  { code: "CNY", name: "Chinese Yuan" },
  { code: "CZK", name: "Czech Koruna" },
  { code: "DKK", name: "Danish Krone" },
  { code: "EUR", name: "Euro" },
  { code: "GBP", name: "British Pound Sterling" },
  { code: "HKD", name: "Hong Kong Dollar" },
  { code: "HUF", name: "Hungarian Forint" },
  { code: "IDR", name: "Indonesian Rupiah" },
  { code: "ILS", name: "Israeli New Shekel" },
  { code: "INR", name: "Indian Rupee" },
  { code: "ISK", name: "Icelandic Krona" },
  { code: "JPY", name: "Japanese Yen" },
  { code: "KRW", name: "South Korean Won" },
  { code: "MXN", name: "Mexican Peso" },
  { code: "MYR", name: "Malaysian Ringgit" },
  { code: "NOK", name: "Norwegian Krone" },
  { code: "NZD", name: "New Zealand Dollar" },
  { code: "PHP", name: "Philippine Peso" },
  { code: "PLN", name: "Polish Zloty" },
  { code: "RON", name: "Romanian Leu" },
  { code: "SEK", name: "Swedish Krona" },
  { code: "SGD", name: "Singapore Dollar" },
  { code: "THB", name: "Thai Baht" },
  { code: "TRY", name: "Turkish Lira" },
  { code: "USD", name: "US Dollar" },
  { code: "ZAR", name: "South African Rand" },
] as const;

export type RateSnapshot = {
  /** Frankfurter ECB rates are expressed as quote units for one EUR. */
  base: "EUR";
  date: string;
  fetchedAt: string;
  rates: Record<string, number>;
};

const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function isDateKey(value: string): boolean {
  const match = DAY_PATTERN.exec(value);
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

function assertFiniteAmount(amount: number): void {
  if (!Number.isFinite(amount)) {
    throw new RangeError("Amount must be a finite number.");
  }
}

function roundMoney(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

function assertRate(rate: unknown, label: string): asserts rate is number {
  if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) {
    throw new Error(`Exchange rate for ${label} is unavailable.`);
  }
}

/** Returns the selected home currency, retaining USD as the v1 default. */
export function baseCurrency(data: Pick<BudgetData, "baseCurrency">): string {
  return data.baseCurrency ?? "USD";
}

/** Returns a local calendar date key so app dates do not shift at UTC boundaries. */
export function todayKey(date: Date = new Date()): string {
  if (Number.isNaN(date.getTime()))
    throw new RangeError("Expected a valid Date.");
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

/**
 * Gets a frozen cross-rate from an EUR-based ECB snapshot. The result converts
 * `from` units to `to` units; no network request is made here.
 */
export function rateFor(
  snapshot: RateSnapshot | undefined,
  from: string,
  to: string,
): number {
  if (from === to) return 1;
  if (!snapshot) {
    throw new Error(
      `No cached exchange rate is available for ${from} to ${to}.`,
    );
  }
  const fromRate = from === "EUR" ? 1 : snapshot.rates[from];
  const toRate = to === "EUR" ? 1 : snapshot.rates[to];
  assertRate(fromRate, from);
  assertRate(toRate, to);
  return toRate / fromRate;
}

/** Converts an amount using the supplied frozen snapshot and rounds to cents. */
export function convertAmount(
  amount: number,
  from: string,
  to: string,
  snapshot?: RateSnapshot,
): number {
  assertFiniteAmount(amount);
  return roundMoney(amount * rateFor(snapshot, from, to));
}

/** Formats a home-currency value without importing the budget module at runtime. */
export function money(
  data: Pick<BudgetData, "baseCurrency">,
  amount: number,
): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: baseCurrency(data),
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/** ECB snapshots are fresh for twelve hours; weekends do not need special handling. */
export function ratesFresh(snapshot: RateSnapshot | undefined): boolean {
  if (!snapshot) return false;
  const fetchedAt = Date.parse(snapshot.fetchedAt);
  if (!Number.isFinite(fetchedAt)) return false;
  const age = Date.now() - fetchedAt;
  return age >= 0 && age < 12 * 60 * 60 * 1000;
}

type RawRate = {
  date?: unknown;
  base?: unknown;
  quote?: unknown;
  rate?: unknown;
};

/**
 * Fetches public ECB reference rates only. These are non-bank reference rates;
 * transactions retain the rate that was used when they were created.
 */
export async function fetchRates(): Promise<RateSnapshot> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(
      "https://api.frankfurter.dev/v2/providers/ecb/rates?base=EUR",
      { signal: controller.signal },
    );
    if (!response.ok) {
      throw new Error(
        `Exchange-rate service is unavailable (HTTP ${response.status}).`,
      );
    }
    const payload: unknown = await response.json();
    if (!Array.isArray(payload) || payload.length === 0) {
      throw new Error("Exchange-rate service returned no rates.");
    }

    const rates: Record<string, number> = { EUR: 1 };
    let date: string | undefined;
    for (const item of payload) {
      const row = item as RawRate;
      if (
        typeof row.date !== "string" ||
        !isDateKey(row.date) ||
        row.base !== "EUR" ||
        typeof row.quote !== "string" ||
        !/^[A-Z]{3}$/.test(row.quote) ||
        typeof row.rate !== "number" ||
        !Number.isFinite(row.rate) ||
        row.rate <= 0
      ) {
        throw new Error("Exchange-rate service returned an invalid ECB rate.");
      }
      if (date && date !== row.date) {
        throw new Error(
          "Exchange-rate service returned rates for multiple dates.",
        );
      }
      date = row.date;
      rates[row.quote] = row.rate;
    }
    if (!date)
      throw new Error("Exchange-rate service returned no dated rates.");
    rates.EUR = 1;
    return {
      base: "EUR",
      date,
      fetchedAt: new Date().toISOString(),
      rates,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Exchange-rate request timed out after 15 seconds.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Re-expresses stored home-currency accounting values in a new home currency.
 * Original transaction amounts remain untouched (legacy transactions gain one).
 */
export function changeBaseCurrency(
  data: BudgetData,
  newCurrency: string,
  snapshot: RateSnapshot,
): BudgetData {
  const oldCurrency = baseCurrency(data);
  if (!CURRENCIES.some((currency) => currency.code === newCurrency)) {
    throw new RangeError(
      "Home currency must be a supported three-letter ECB currency code.",
    );
  }

  const transactions = data.transactions.map((transaction) => {
    const originalAmount = transaction.originalAmount ?? transaction.amount;
    const amount = convertAmount(
      transaction.amount,
      oldCurrency,
      newCurrency,
      snapshot,
    );
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error(
        "A saved transaction would round to zero in this currency. Keep your current home currency or adjust that tiny transaction first.",
      );
    }
    return {
      ...transaction,
      amount,
      originalAmount,
      currency: transaction.currency ?? oldCurrency,
      exchangeRate: amount / originalAmount,
      rateDate: snapshot.date,
    };
  });
  const budgets = data.budgets.map((budget) => ({
    ...budget,
    amount: convertAmount(budget.amount, oldCurrency, newCurrency, snapshot),
  }));

  return {
    ...data,
    baseCurrency: newCurrency,
    rates: snapshot,
    transactions,
    budgets,
  };
}
