import {
  type BudgetData,
  type Category,
  type Transaction,
  type TransactionType,
  isValidDate,
  uniqueId,
} from "./budget";
import {
  CURRENCIES,
  baseCurrency as homeCurrency,
  convertAmount,
  rateFor,
} from "./currency";

export type ColumnMapping = {
  date: number;
  type: number;
  amount: number;
  category: number;
  note: number;
  /** Optional: when mapped, amount is interpreted in this source currency. */
  currency?: number;
  /** Accepted for third-party files; Pocketly exports `amount` as original amount. */
  originalAmount?: number;
  /** Locked home-currency amount for offline same-home-currency round trips. */
  baseAmount?: number;
  baseCurrency?: number;
  exchangeRate?: number;
  rateDate?: number;
};

type ImportError = { row: number; message: string };

type ImportPreview = {
  transactions: Transaction[];
  categories: Category[];
  errors: ImportError[];
  duplicates: number;
  totalRows: number;
};

const CURRENCY_CODES: ReadonlySet<string> = new Set(
  CURRENCIES.map((currency) => currency.code),
);

/**
 * Parses RFC-4180-style CSV including UTF-8 BOMs, escaped quotes, CRLF, and
 * newlines inside quoted fields. A final line break does not create a phantom row.
 */
export function parseCSV(text: string): string[][] {
  if (text.length === 0 || text === "\uFEFF") return [];
  let source = text;
  if (source.charCodeAt(0) === 0xfeff) source = source.slice(1);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let endedWithRecordBreak = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]!;
    if (character === '"') {
      if (inQuotes && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      endedWithRecordBreak = false;
      continue;
    }
    if (character === "," && !inQuotes) {
      row.push(field);
      field = "";
      endedWithRecordBreak = false;
      continue;
    }
    if ((character === "\n" || character === "\r") && !inQuotes) {
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      endedWithRecordBreak = true;
      continue;
    }
    if (character === "\r" && inQuotes && source[index + 1] === "\n") {
      field += "\n";
      index += 1;
    } else {
      field += character;
    }
    endedWithRecordBreak = false;
  }

  if (inQuotes) throw new Error("CSV contains an unclosed quoted field.");

  if (!endedWithRecordBreak) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function normalizedHeader(value: string): string {
  return value
    .replace(/^\uFEFF/, "")
    .trim()
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function firstHeader(headers: string[], aliases: string[]): number {
  const normalized = headers.map(normalizedHeader);
  for (const alias of aliases) {
    const index = normalized.indexOf(alias);
    if (index >= 0) return index;
  }
  return -1;
}

function optionalHeader(
  target: Partial<ColumnMapping>,
  field: keyof Omit<
    ColumnMapping,
    "date" | "type" | "amount" | "category" | "note"
  >,
  headers: string[],
  aliases: string[],
): void {
  const index = firstHeader(headers, aliases);
  if (index >= 0) target[field] = index;
}

/** Guess sensible field assignments without relying on a particular bank's CSV labels. */
export function guessMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {
    date: firstHeader(headers, [
      "date",
      "transactiondate",
      "posteddate",
      "purchasedate",
    ]),
    type: firstHeader(headers, [
      "type",
      "transactiontype",
      "kind",
      "transactionkind",
    ]),
    amount: firstHeader(headers, [
      "amount",
      "transactionamount",
      "value",
      "total",
      "debit",
      "credit",
    ]),
    category: firstHeader(headers, [
      "category",
      "categoryname",
      "expensecategory",
      "incomecategory",
    ]),
    note: firstHeader(headers, [
      "note",
      "notes",
      "description",
      "memo",
      "details",
      "comment",
    ]),
  };
  optionalHeader(mapping, "currency", headers, ["currency", "currencycode"]);
  optionalHeader(mapping, "originalAmount", headers, [
    "originalamount",
    "sourceamount",
  ]);
  optionalHeader(mapping, "baseAmount", headers, ["baseamount", "homeamount"]);
  optionalHeader(mapping, "baseCurrency", headers, [
    "basecurrency",
    "homecurrency",
  ]);
  optionalHeader(mapping, "exchangeRate", headers, ["exchangerate", "rate"]);
  optionalHeader(mapping, "rateDate", headers, [
    "ratedate",
    "exchangeratedate",
  ]);
  return mapping;
}

function stripFormulaEscape(value: string): string {
  return value.replace(/^'(?=[=+\-@])/, "");
}

function normalizeCategoryName(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function cents(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100);
}

function parseType(value: string): TransactionType | undefined {
  const normalized = value
    .trim()
    .toLocaleLowerCase()
    .replace(/[ _-]+/g, "");
  if (
    [
      "income",
      "credit",
      "deposit",
      "earning",
      "earnings",
      "revenue",
      "in",
    ].includes(normalized)
  ) {
    return "income";
  }
  if (
    ["expense", "debit", "withdrawal", "payment", "purchase", "out"].includes(
      normalized,
    )
  ) {
    return "expense";
  }
  return undefined;
}

/** Deliberately does not accept currency symbols, grouping, exponent notation, or more than cents. */
function parsePositiveAmount(value: string): number | undefined {
  const trimmed = value.trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(trimmed)) return undefined;
  const amount = Number(trimmed);
  return Number.isFinite(amount) && amount > 0 ? amount : undefined;
}

function parsePositiveRate(value: string): number | undefined {
  const trimmed = value.trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,12})?$/.test(trimmed)) return undefined;
  const rate = Number(trimmed);
  return Number.isFinite(rate) && rate > 0 ? rate : undefined;
}

function fingerprint(
  date: string,
  type: TransactionType,
  originalAmount: number,
  currency: string,
  categoryName: string,
  note: string,
): string {
  return [
    date,
    type,
    currency,
    String(cents(originalAmount)),
    normalizeCategoryName(categoryName),
    note,
  ].join("\u0000");
}

function getCell(row: string[], index: number): string {
  return index >= 0 && index < row.length ? (row[index] ?? "") : "";
}

function mappedIndex(
  mapping: ColumnMapping,
  field: keyof ColumnMapping,
): number | undefined {
  const index = mapping[field];
  return typeof index === "number" && index >= 0 ? index : undefined;
}

function mappingErrors(
  mapping: ColumnMapping,
  headerLength: number,
): ImportError[] {
  const errors: ImportError[] = [];
  const required: Array<
    keyof Omit<
      ColumnMapping,
      | "note"
      | "currency"
      | "originalAmount"
      | "baseAmount"
      | "baseCurrency"
      | "exchangeRate"
      | "rateDate"
    >
  > = ["date", "type", "amount", "category"];
  const mappedIndexes = new Map<number, keyof ColumnMapping>();

  for (const field of required) {
    const index = mapping[field];
    if (!Number.isInteger(index) || index < 0 || index >= headerLength) {
      errors.push({
        row: 1,
        message: `Map a valid ${field} column before importing.`,
      });
      continue;
    }
    const previous = mappedIndexes.get(index);
    if (previous) {
      errors.push({
        row: 1,
        message: `${field} and ${previous} cannot use the same column.`,
      });
    } else {
      mappedIndexes.set(index, field);
    }
  }
  if (
    !Number.isInteger(mapping.note) ||
    mapping.note < -1 ||
    mapping.note >= headerLength
  ) {
    errors.push({
      row: 1,
      message: "Map a valid note column or leave it unmapped.",
    });
  } else if (mapping.note >= 0) {
    const previous = mappedIndexes.get(mapping.note);
    if (previous) {
      errors.push({
        row: 1,
        message: `note and ${previous} cannot use the same column.`,
      });
    } else {
      mappedIndexes.set(mapping.note, "note");
    }
  }

  for (const field of [
    "currency",
    "originalAmount",
    "baseAmount",
    "baseCurrency",
    "exchangeRate",
    "rateDate",
  ] as const) {
    const index = mapping[field];
    if (index === undefined || index === -1) continue;
    if (!Number.isInteger(index) || index < 0 || index >= headerLength) {
      errors.push({
        row: 1,
        message: `Map a valid ${field} column or leave it unmapped.`,
      });
      continue;
    }
    const previous = mappedIndexes.get(index);
    if (previous) {
      errors.push({
        row: 1,
        message: `${field} and ${previous} cannot use the same column.`,
      });
    } else {
      mappedIndexes.set(index, field);
    }
  }
  return errors;
}

function generatedCategory(
  type: TransactionType,
  name: string,
  usedIds: Set<string>,
): Category {
  let id = `import-${type}-${uniqueId()}`;
  while (usedIds.has(id)) id = `import-${type}-${uniqueId()}`;
  usedIds.add(id);
  return {
    id,
    name,
    type,
    color: type === "income" ? "#75AFA0" : "#E4A47F",
    icon: type === "income" ? "add-circle-outline" : "pricetag-outline",
  };
}

function rowError(errors: ImportError[], row: number, message: string): void {
  errors.push({ row, message });
}

/**
 * Converts CSV rows into a reviewable import. The first row is always treated as
 * headers. Invalid rows are reported and skipped; duplicate rows are counted and skipped.
 * A mapped currency column uses cached rates only; this function never fetches the network.
 */
export function previewImport(
  text: string,
  mapping: ColumnMapping,
  data: BudgetData,
): ImportPreview {
  const rows = parseCSV(text);
  const totalRows = Math.max(0, rows.length - 1);
  if (rows.length === 0) {
    return {
      transactions: [],
      categories: [],
      errors: [{ row: 1, message: "CSV must include a header row." }],
      duplicates: 0,
      totalRows: 0,
    };
  }

  const errors = mappingErrors(mapping, rows[0]!.length);
  if (errors.length > 0) {
    return {
      transactions: [],
      categories: [],
      errors,
      duplicates: 0,
      totalRows,
    };
  }

  const home = homeCurrency(data);
  const currencyIndex = mappedIndex(mapping, "currency");
  const originalAmountIndex = mappedIndex(mapping, "originalAmount");
  const baseAmountIndex = mappedIndex(mapping, "baseAmount");
  const baseCurrencyIndex = mappedIndex(mapping, "baseCurrency");
  const exchangeRateIndex = mappedIndex(mapping, "exchangeRate");
  const rateDateIndex = mappedIndex(mapping, "rateDate");
  const hasCurrencyColumn = currencyIndex !== undefined;

  const existingCategoryByKey = new Map<string, Category>();
  for (const category of data.categories) {
    existingCategoryByKey.set(
      `${category.type}\u0000${normalizeCategoryName(category.name)}`,
      category,
    );
  }
  const usedIds = new Set([
    ...data.categories.map((category) => category.id),
    ...data.transactions.map((transaction) => transaction.id),
  ]);
  const seenFingerprints = new Set<string>();
  for (const transaction of data.transactions) {
    const category = data.categories.find(
      (item) => item.id === transaction.categoryId,
    );
    if (!category) continue;
    seenFingerprints.add(
      fingerprint(
        transaction.date,
        transaction.type,
        transaction.originalAmount ?? transaction.amount,
        transaction.currency ?? home,
        category.name,
        transaction.note,
      ),
    );
  }

  const transactions: Transaction[] = [];
  const newCategories = new Map<string, Category>();
  let duplicates = 0;

  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index]!;
    const rowNumber = index + 1;
    const date = getCell(row, mapping.date).trim();
    const type = parseType(getCell(row, mapping.type));
    const standardAmount = parsePositiveAmount(getCell(row, mapping.amount));
    const categoryName = stripFormulaEscape(
      getCell(row, mapping.category),
    ).trim();
    const note =
      mapping.note === -1 ? "" : stripFormulaEscape(getCell(row, mapping.note));

    if (!isValidDate(date)) {
      rowError(errors, rowNumber, "Date must be a real YYYY-MM-DD date.");
      continue;
    }
    if (!type) {
      rowError(errors, rowNumber, "Type must be income or expense.");
      continue;
    }
    if (standardAmount === undefined) {
      rowError(
        errors,
        rowNumber,
        "Amount must be a positive number with at most two decimals.",
      );
      continue;
    }
    if (!categoryName) {
      rowError(errors, rowNumber, "Category is required.");
      continue;
    }

    const originalAmount =
      originalAmountIndex === undefined
        ? standardAmount
        : parsePositiveAmount(getCell(row, originalAmountIndex));
    if (originalAmount === undefined) {
      rowError(
        errors,
        rowNumber,
        "Original amount must be a positive number with at most two decimals.",
      );
      continue;
    }

    let currency = home;
    if (hasCurrencyColumn) {
      currency = getCell(row, currencyIndex!).trim().toUpperCase();
      if (!CURRENCY_CODES.has(currency)) {
        rowError(
          errors,
          rowNumber,
          "Currency must be a supported three-letter ECB currency code.",
        );
        continue;
      }
    }

    const suppliedBaseAmount =
      baseAmountIndex === undefined
        ? undefined
        : parsePositiveAmount(getCell(row, baseAmountIndex));
    if (baseAmountIndex !== undefined && suppliedBaseAmount === undefined) {
      rowError(
        errors,
        rowNumber,
        "Base amount must be a positive number with at most two decimals.",
      );
      continue;
    }
    const suppliedBaseCurrency =
      baseCurrencyIndex === undefined
        ? undefined
        : getCell(row, baseCurrencyIndex).trim().toUpperCase();
    if (
      baseCurrencyIndex !== undefined &&
      (!suppliedBaseCurrency || !CURRENCY_CODES.has(suppliedBaseCurrency))
    ) {
      rowError(
        errors,
        rowNumber,
        "Base currency must be a supported three-letter ECB currency code.",
      );
      continue;
    }
    const suppliedExchangeRate =
      exchangeRateIndex === undefined
        ? undefined
        : parsePositiveRate(getCell(row, exchangeRateIndex));
    if (exchangeRateIndex !== undefined && suppliedExchangeRate === undefined) {
      rowError(errors, rowNumber, "Exchange rate must be a positive number.");
      continue;
    }
    const suppliedRateDate =
      rateDateIndex === undefined
        ? undefined
        : getCell(row, rateDateIndex).trim();
    if (suppliedRateDate && !isValidDate(suppliedRateDate)) {
      rowError(errors, rowNumber, "Rate date must be a real YYYY-MM-DD date.");
      continue;
    }

    let amount = originalAmount;
    let exchangeRate = 1;
    let rateDate = suppliedRateDate || data.rates?.date || date;
    const canReuseHomeAmount =
      suppliedBaseAmount !== undefined && suppliedBaseCurrency === home;

    if (hasCurrencyColumn) {
      if (canReuseHomeAmount) {
        amount = suppliedBaseAmount;
        exchangeRate = suppliedExchangeRate ?? amount / originalAmount;
        if (cents(amount) !== cents(originalAmount * exchangeRate)) {
          rowError(
            errors,
            rowNumber,
            "Base amount and exchange rate do not agree to the nearest cent.",
          );
          continue;
        }
      } else if (currency === home) {
        amount = originalAmount;
        exchangeRate = 1;
      } else {
        try {
          exchangeRate = rateFor(data.rates, currency, home);
          amount = convertAmount(originalAmount, currency, home, data.rates);
          rateDate = data.rates!.date;
        } catch {
          rowError(
            errors,
            rowNumber,
            `No cached exchange rate is available for ${currency} to ${home}.`,
          );
          continue;
        }
      }
    }

    const categoryKey = `${type}\u0000${normalizeCategoryName(categoryName)}`;
    let category =
      existingCategoryByKey.get(categoryKey) ?? newCategories.get(categoryKey);
    if (!category) {
      category = generatedCategory(type, categoryName, usedIds);
      newCategories.set(categoryKey, category);
    }

    const transactionFingerprint = fingerprint(
      date,
      type,
      originalAmount,
      currency,
      category.name,
      note,
    );
    if (seenFingerprints.has(transactionFingerprint)) {
      duplicates += 1;
      continue;
    }
    seenFingerprints.add(transactionFingerprint);

    let id = `import-transaction-${uniqueId()}`;
    while (usedIds.has(id)) id = `import-transaction-${uniqueId()}`;
    usedIds.add(id);
    const transaction: Transaction = {
      id,
      date,
      type,
      amount,
      categoryId: category.id,
      note,
    };
    if (hasCurrencyColumn) {
      transaction.originalAmount = originalAmount;
      transaction.currency = currency;
      transaction.exchangeRate = exchangeRate;
      transaction.rateDate = rateDate;
    }
    transactions.push(transaction);
  }

  const usedNewCategoryIds = new Set(
    transactions.map((transaction) => transaction.categoryId),
  );
  return {
    transactions,
    categories: [...newCategories.values()].filter((category) =>
      usedNewCategoryIds.has(category.id),
    ),
    errors,
    duplicates,
    totalRows,
  };
}

function spreadsheetSafe(value: string): string {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

function csvCell(value: string): string {
  const safe = spreadsheetSafe(value);
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function amountCell(value: number): string {
  return (cents(value) / 100).toFixed(2);
}

function rateCell(value: number): string {
  return value.toFixed(12).replace(/0+$/, "").replace(/\.$/, "");
}

/**
 * Exports original transaction amounts plus frozen home amounts. The extra
 * accounting columns allow a same-home-currency import without a live rate cache.
 */
export function csvTransactions(data: BudgetData): string {
  const categories = new Map(
    data.categories.map((category) => [category.id, category]),
  );
  const home = homeCurrency(data);
  const rows = [
    "date,type,amount,category,note,currency,base_amount,base_currency,exchange_rate,rate_date",
  ];
  for (const transaction of data.transactions) {
    const originalAmount = transaction.originalAmount ?? transaction.amount;
    const currency = transaction.currency ?? home;
    const exchangeRate =
      transaction.exchangeRate ?? transaction.amount / originalAmount;
    rows.push(
      [
        csvCell(transaction.date),
        csvCell(transaction.type),
        amountCell(originalAmount),
        csvCell(categories.get(transaction.categoryId)?.name ?? ""),
        csvCell(transaction.note),
        csvCell(currency),
        amountCell(transaction.amount),
        csvCell(home),
        rateCell(exchangeRate),
        csvCell(transaction.rateDate ?? ""),
      ].join(","),
    );
  }
  return `${rows.join("\r\n")}\r\n`;
}

/** Exports one category budget per CSV row in the configured home currency. */
export function csvBudgets(data: BudgetData): string {
  const categories = new Map(
    data.categories.map((category) => [category.id, category]),
  );
  const home = homeCurrency(data);
  const rows = ["month,category,budget,currency"];
  for (const budget of data.budgets) {
    rows.push(
      [
        csvCell(budget.month),
        csvCell(categories.get(budget.categoryId)?.name ?? ""),
        amountCell(budget.amount),
        csvCell(home),
      ].join(","),
    );
  }
  return `${rows.join("\r\n")}\r\n`;
}

/** Exports recurring-rule configuration for an explicit backup; it does not create payments. */
export function csvRecurring(data: BudgetData): string {
  const rows = [
    "id,type,amount,currency,category_id,note,day,start_date,end_date,active,last_posted_month",
  ];
  for (const rule of data.recurring ?? []) {
    rows.push(
      [
        csvCell(rule.id),
        csvCell(rule.type),
        amountCell(rule.amount),
        csvCell(rule.currency),
        csvCell(rule.categoryId),
        csvCell(rule.note),
        String(rule.day),
        csvCell(rule.startDate),
        csvCell(rule.endDate ?? ""),
        String(rule.active),
        csvCell(rule.lastPostedMonth ?? ""),
      ].join(","),
    );
  }
  return `${rows.join("\r\n")}\r\n`;
}
