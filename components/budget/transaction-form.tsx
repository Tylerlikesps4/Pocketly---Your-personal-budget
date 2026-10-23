import React, { useState } from "react";
import { View } from "react-native";
import { useBudget } from "@/hooks/budget-store";
import {
  monthKey,
  isValidDate,
  uniqueId,
  formatMoney,
  type Transaction,
  type TransactionType,
} from "@/lib/budget";
import {
  baseCurrency,
  rateFor,
  convertAmount,
  todayKey,
  CURRENCIES,
} from "@/lib/currency";
import type { ReceiptDraft } from "@/lib/receipt";
import { Dialog, Field, Chip, Txt, Button, C, s } from "./ui";
import { CurrencySelect } from "./currency-select";

export function TransactionForm({
  open,
  transaction,
  draft,
  onScan,
  onClose,
  onSaved,
}: {
  open: boolean;
  transaction?: Transaction;
  draft?: ReceiptDraft;
  onScan?: () => void;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const { data, update, month, refreshRates, ratesLoading, ratesError } =
    useBudget();
  const home = baseCurrency(data);
  const [type, setType] = useState<TransactionType>(
    transaction?.type || "expense",
  );
  const [amount, setAmount] = useState(
    transaction
      ? String(transaction.originalAmount ?? transaction.amount)
      : draft?.amount
        ? String(draft.amount)
        : "",
  );
  const [currency, setCurrency] = useState(
    transaction?.currency ||
      (draft?.currency && CURRENCIES.some((c) => c.code === draft.currency)
        ? draft.currency
        : home),
  );
  const [date, setDate] = useState(
    transaction?.date ||
      draft?.date ||
      (month === monthKey() ? todayKey() : month + "-01"),
  );
  const [categoryId, setCategoryId] = useState(
    transaction?.categoryId ||
      (draft
        ? ""
        : data.categories.find(
            (c) => c.type === (transaction?.type || "expense"),
          )?.id) ||
      "",
  );
  const [note, setNote] = useState(transaction?.note || draft?.note || "");
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const categories = data.categories.filter((c) => c.type === type);
  const unchangedMoney =
    !!transaction &&
    currency === (transaction.currency || home) &&
    Number(amount) === (transaction.originalAmount ?? transaction.amount);
  let estimate = "";
  try {
    if (Number(amount) > 0)
      estimate = formatMoney(
        unchangedMoney
          ? transaction!.amount
          : convertAmount(Number(amount), currency, home, data.rates),
        home,
      );
  } catch {
    /* A missing rate is shown below and blocks saving. */
  }
  async function save() {
    if (saving) return;
    if (
      !/^\d+(\.\d{1,2})?$/.test(amount.trim()) ||
      !Number.isFinite(Number(amount)) ||
      Number(amount) <= 0 ||
      Number(amount) > 999999999
    )
      return setError("Enter a positive amount with up to two decimal places.");
    if (!isValidDate(date))
      return setError("Enter a real date in YYYY-MM-DD format.");
    if (!categories.some((c) => c.id === categoryId))
      return setError("Choose a category for this transaction.");
    setSaving(true);
    setError("");
    try {
      let snapshot = data.rates;
      if (currency !== home && !unchangedMoney) {
        try {
          snapshot = await refreshRates();
        } catch {
          if (!snapshot)
            throw new Error(
              "No cached exchange rate is available. Connect to the internet and refresh rates.",
            );
        }
      }
      const exchangeRate = unchangedMoney
        ? transaction!.exchangeRate || 1
        : rateFor(snapshot, currency, home);
      const converted = unchangedMoney
        ? transaction!.amount
        : convertAmount(Number(amount), currency, home, snapshot);
      if (converted <= 0)
        throw new Error(
          "This amount rounds to zero in your home currency. Enter a larger amount.",
        );
      const t: Transaction = {
        ...transaction,
        id: transaction?.id || uniqueId(),
        type,
        amount: converted,
        originalAmount: Number(amount),
        currency,
        exchangeRate,
        rateDate: unchangedMoney
          ? transaction!.rateDate || todayKey()
          : snapshot?.date || todayKey(),
        date,
        categoryId,
        note: note.trim(),
      };
      update((d) => ({
        ...d,
        transactions: transaction
          ? d.transactions.map((old) => (old.id === t.id ? t : old))
          : [t, ...d.transactions],
      }));
      onSaved(
        transaction
          ? "Transaction updated"
          : draft
            ? "Receipt expense added"
            : "Transaction added",
      );
      onClose();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to save this transaction.",
      );
    } finally {
      setSaving(false);
    }
  }
  function remove() {
    if (!transaction) return;
    update((d) => ({
      ...d,
      transactions: d.transactions.filter((t) => t.id !== transaction.id),
    }));
    onSaved("Transaction deleted");
    onClose();
  }
  return (
    <Dialog
      visible={open}
      title={
        transaction
          ? "Edit transaction"
          : draft
            ? "Review your receipt expense"
            : "A new transaction"
      }
      subtitle={
        draft
          ? "OCR can make mistakes. Confirm every field before saving."
          : "Your original currency is kept alongside your home-currency amount."
      }
      onClose={saving ? () => undefined : onClose}
    >
      {deleting ? (
        <>
          <Txt style={{ marginBottom: 20 }}>
            Delete this transaction? This cannot be undone.
            {transaction?.recurringId
              ? " Its recurring schedule continues; this occurrence will not be recreated."
              : ""}
          </Txt>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Button
              label="Keep it"
              secondary
              onPress={() => setDeleting(false)}
            />
            <Button
              label="Delete transaction"
              onPress={remove}
              style={{ backgroundColor: C.red }}
            />
          </View>
        </>
      ) : (
        <>
          {!transaction && !draft && onScan && (
            <Button
              secondary
              label="Scan a receipt instead"
              icon="scan-outline"
              onPress={onScan}
              style={{ marginBottom: 19 }}
            />
          )}
          {draft && (!draft.currency || !draft.amount || !draft.date) && (
            <View
              style={{
                backgroundColor: "#FAF0E6",
                padding: 12,
                borderRadius: 9,
                marginBottom: 18,
              }}
            >
              <Txt style={{ fontSize: 11, color: C.amber }}>
                Some receipt fields could not be read confidently. Check the
                amount, date, currency, and category before saving. A $ symbol
                alone does not identify its country.
              </Txt>
            </View>
          )}
          <View style={{ flexDirection: "row", gap: 10, marginBottom: 22 }}>
            <Chip
              label="Expense"
              active={type === "expense"}
              onPress={() => {
                setType("expense");
                setCategoryId(
                  data.categories.find((c) => c.type === "expense")?.id || "",
                );
              }}
            />
            <Chip
              label="Income"
              active={type === "income"}
              onPress={() => {
                setType("income");
                setCategoryId(
                  data.categories.find((c) => c.type === "income")?.id || "",
                );
              }}
            />
          </View>
          <Field
            label={`Amount (${currency})`}
            value={amount}
            onChangeText={setAmount}
            numeric
            placeholder="0.00"
          />
          <CurrencySelect
            label="Transaction currency"
            value={currency}
            onChange={setCurrency}
          />
          {currency !== home && (
            <View
              style={{
                backgroundColor: C.lilac,
                borderRadius: 10,
                padding: 13,
                marginBottom: 17,
              }}
            >
              <Txt
                style={{ color: C.purpleDark, fontWeight: "600", fontSize: 12 }}
              >
                {estimate
                  ? `${estimate} in your ${home} budget`
                  : "An exchange rate is needed before saving."}
              </Txt>
              <Txt style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>
                {unchangedMoney
                  ? `Saved reference rate · ${transaction?.rateDate || "original accounting value"}`
                  : data.rates
                    ? `Latest cached ECB reference rate · ${data.rates.date}`
                    : "Rates load automatically when online."}{" "}
                Rates are locked when saved, not bank settlement rates.
              </Txt>
              {!!ratesError && (
                <Txt style={{ color: C.amber, fontSize: 10, marginTop: 5 }}>
                  {ratesError}
                </Txt>
              )}
              <Button
                small
                secondary
                label={ratesLoading ? "Refreshing…" : "Refresh rate"}
                disabled={ratesLoading || saving}
                onPress={() => {
                  refreshRates(true).catch(() => undefined);
                }}
                style={{ marginTop: 10 }}
              />
            </View>
          )}
          <Field
            label="Date"
            value={date}
            onChangeText={setDate}
            placeholder="YYYY-MM-DD"
          />
          <Txt style={[s.label, { marginBottom: 9 }]}>Category</Txt>
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 8,
              marginBottom: 20,
            }}
          >
            {categories.map((c) => (
              <Chip
                key={c.id}
                label={c.name}
                active={categoryId === c.id}
                onPress={() => setCategoryId(c.id)}
              />
            ))}
            {!categories.length && (
              <Txt style={{ color: C.muted, fontSize: 12 }}>
                Add a category in Data & settings first.
              </Txt>
            )}
          </View>
          <Field
            label="Note (optional)"
            value={note}
            onChangeText={setNote}
            placeholder="What was it for?"
          />
          {!!error && <Txt style={s.error}>{error}</Txt>}
          <Button
            label={
              saving
                ? "Saving…"
                : transaction
                  ? "Save changes"
                  : draft
                    ? "Confirm & add expense"
                    : "Add transaction"
            }
            disabled={saving}
            icon="checkmark-outline"
            onPress={() => {
              void save();
            }}
          />
          {transaction && (
            <Button
              secondary
              label="Delete transaction"
              onPress={() => setDeleting(true)}
              style={{ marginTop: 10 }}
            />
          )}
        </>
      )}
    </Dialog>
  );
}
