import {
  type BudgetData,
  type RecurringRule,
  type Transaction,
  isValidDate,
  shiftMonth,
} from "./budget";
import { baseCurrency, rateFor, todayKey } from "./currency";

function assertMonth(month: string): void {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new RangeError(`Expected month in YYYY-MM format, received ${month}`);
  }
}

function assertDay(day: number): void {
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    throw new RangeError("Recurring day must be an integer from 1 through 31.");
  }
}

function monthOf(date: string): string {
  return date.slice(0, 7);
}

function roundMoney(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

/** Returns the scheduled local-calendar date, clamping day 29–31 to month end. */
export function scheduledDate(month: string, day: number): string {
  assertMonth(month);
  assertDay(day);
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year!, monthNumber!, 0)).getUTCDate();
  return `${month}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

function firstCandidateMonth(rule: RecurringRule): string {
  let month = monthOf(rule.startDate);
  if (rule.lastPostedMonth && rule.lastPostedMonth >= month) {
    month = shiftMonth(rule.lastPostedMonth, 1);
  }
  while (scheduledDate(month, rule.day) < rule.startDate) {
    month = shiftMonth(month, 1);
  }
  return month;
}

/**
 * Finds the first unposted occurrence. It never creates a payment; it only
 * reports schedule state for the app to display or pass to `postDue`.
 */
export function nextDue(
  rule: RecurringRule,
  today: string = todayKey(),
): string | null {
  if (!rule.active) return null;
  if (!isValidDate(today))
    throw new RangeError("Today must be a real YYYY-MM-DD date.");
  let month = firstCandidateMonth(rule);
  const due = scheduledDate(month, rule.day);
  if (rule.endDate && due > rule.endDate) return null;
  return due;
}

function hasRecurringOccurrence(
  transactions: readonly Transaction[],
  recurringId: string,
  date: string,
): boolean {
  return transactions.some(
    (transaction) =>
      transaction.recurringId === recurringId && transaction.date === date,
  );
}

function appendBlocked(blocked: string[], ruleId: string): void {
  if (!blocked.includes(ruleId)) blocked.push(ruleId);
}

/**
 * Posts missed monthly planned entries through `today` with deterministic IDs.
 * This is planning-only bookkeeping and does not initiate or represent payments.
 */
export function postDue(
  data: BudgetData,
  today: string = todayKey(),
): { data: BudgetData; posted: number; blocked: string[] } {
  if (!isValidDate(today))
    throw new RangeError("Today must be a real YYYY-MM-DD date.");
  const rules = data.recurring ?? [];
  if (rules.length === 0) return { data, posted: 0, blocked: [] };

  const homeCurrency = baseCurrency(data);
  const added: Transaction[] = [];
  const updatedMonths = new Map<string, string>();
  const transactionIds = new Set(
    data.transactions.map((transaction) => transaction.id),
  );
  const allTransactions = data.transactions.slice();
  const blocked: string[] = [];

  for (const rule of rules) {
    if (!rule.active) continue;
    let month = firstCandidateMonth(rule);

    while (true) {
      const date = scheduledDate(month, rule.day);
      if (date > today) break;
      if (rule.endDate && date > rule.endDate) break;

      if (hasRecurringOccurrence(allTransactions, rule.id, date)) {
        updatedMonths.set(rule.id, month);
        month = shiftMonth(month, 1);
        continue;
      }

      let exchangeRate: number;
      try {
        exchangeRate = rateFor(data.rates, rule.currency, homeCurrency);
      } catch {
        appendBlocked(blocked, rule.id);
        break;
      }

      const id = `recurring-${rule.id}-${month}`;
      if (transactionIds.has(id)) {
        appendBlocked(blocked, rule.id);
        break;
      }

      const amount = roundMoney(rule.amount * exchangeRate);
      if (!Number.isFinite(amount) || amount <= 0) {
        appendBlocked(blocked, rule.id);
        break;
      }
      const transaction: Transaction = {
        id,
        type: rule.type,
        amount,
        date,
        categoryId: rule.categoryId,
        note: rule.note,
        originalAmount: rule.amount,
        currency: rule.currency,
        exchangeRate,
        rateDate: data.rates?.date ?? date,
        recurringId: rule.id,
      };
      added.push(transaction);
      allTransactions.push(transaction);
      transactionIds.add(id);
      updatedMonths.set(rule.id, month);
      month = shiftMonth(month, 1);
    }
  }

  if (added.length === 0 && updatedMonths.size === 0) {
    return { data, posted: 0, blocked };
  }

  return {
    data: {
      ...data,
      transactions:
        added.length > 0 ? [...data.transactions, ...added] : data.transactions,
      recurring: rules.map((rule) => {
        const lastPostedMonth = updatedMonths.get(rule.id);
        return lastPostedMonth ? { ...rule, lastPostedMonth } : rule;
      }),
    },
    posted: added.length,
    blocked,
  };
}
