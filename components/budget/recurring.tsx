import React, { useState } from "react";
import { View, useWindowDimensions } from "react-native";
import { useBudget } from "@/hooks/budget-store";
import {
  isValidDate,
  uniqueId,
  type RecurringRule,
  type TransactionType,
} from "@/lib/budget";
import {
  CURRENCIES,
  baseCurrency,
  convertAmount,
  rateFor,
  todayKey,
} from "@/lib/currency";
import { nextDue } from "@/lib/recurring";
import { CurrencySelect } from "./currency-select";
import {
  Button,
  C,
  Card,
  Chip,
  Dialog,
  Empty,
  Field,
  Icon,
  IconButton,
  SectionHeading,
  Txt,
  s,
} from "./ui";

type RuleTotals = {
  amount: number;
  pending: number;
};

function money(amount: number, currency: string): string {
  try {
    return `${new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
    }).format(amount)} ${currency}`;
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function availableRate(
  snapshot: Parameters<typeof rateFor>[0],
  from: string,
  to: string,
): number | null {
  try {
    return rateFor(snapshot, from, to);
  } catch {
    return null;
  }
}

function dateLabel(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function SummaryTile({
  label,
  totals,
  currency,
  income,
}: {
  label: string;
  totals: RuleTotals;
  currency: string;
  income?: boolean;
}) {
  return (
    <Card
      style={{
        flex: 1,
        minWidth: 220,
        backgroundColor: income ? "#F2F8F5" : C.lilac,
        borderColor: income ? "#DBEEE7" : "#E3DCF3",
      }}
    >
      <Txt
        style={{
          fontSize: 11,
          color: income ? C.mint : C.purpleDark,
          fontWeight: "600",
          textTransform: "uppercase",
          letterSpacing: 0.4,
        }}
      >
        {label}
      </Txt>
      <Txt
        style={{
          fontSize: 28,
          lineHeight: 36,
          fontWeight: "700",
          letterSpacing: -0.7,
          marginTop: 7,
          color: income ? "#347A67" : "#4E3C82",
        }}
      >
        {money(totals.amount, currency)}
      </Txt>
      <Txt style={{ color: C.muted, fontSize: 11, marginTop: 4 }}>
        per month in your home currency
      </Txt>
      {totals.pending > 0 && (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 5,
            marginTop: 12,
          }}
        >
          <Icon name="time-outline" color={C.amber} size={14} />
          <Txt style={{ color: C.amber, fontSize: 11, flex: 1 }}>
            {totals.pending}{" "}
            {totals.pending === 1 ? "schedule is" : "schedules are"} pending an
            exchange rate
          </Txt>
        </View>
      )}
    </Card>
  );
}

export function Recurring({ notify }: { notify: (message: string) => void }) {
  const { data, update, demo, recoveryRequired } = useBudget();
  const { width } = useWindowDimensions();
  const today = todayKey();
  const home = baseCurrency(data);
  const rules = data.recurring ?? [];

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<RecurringRule | null>(null);
  const [deleting, setDeleting] = useState<RecurringRule | null>(null);
  const [type, setType] = useState<TransactionType>("expense");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(home);
  const [categoryId, setCategoryId] = useState("");
  const [note, setNote] = useState("");
  const [day, setDay] = useState(String(Number(today.slice(-2))));
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState("");
  const [error, setError] = useState("");

  const matchingCategories = data.categories.filter(
    (category) => category.type === type,
  );
  const activeRules = rules.filter(
    (rule) => rule.active && (!rule.endDate || rule.endDate >= today),
  );

  function editable(): boolean {
    if (recoveryRequired) {
      notify(
        "Edits are paused to protect unreadable saved data. See Data & settings.",
      );
      return false;
    }
    if (demo) {
      notify("Go to your personal budget to manage recurring schedules.");
      return false;
    }
    return true;
  }

  function homeAmount(rule: RecurringRule): number | null {
    if (rule.currency === home) return rule.amount;
    if (availableRate(data.rates, rule.currency, home) == null) return null;
    const converted = convertAmount(
      rule.amount,
      rule.currency,
      home,
      data.rates,
    );
    return typeof converted === "number" && Number.isFinite(converted)
      ? converted
      : null;
  }

  function totalsFor(ruleType: TransactionType): RuleTotals {
    return activeRules
      .filter((rule) => rule.type === ruleType)
      .reduce<RuleTotals>(
        (totals, rule) => {
          const converted = homeAmount(rule);
          return converted == null
            ? { ...totals, pending: totals.pending + 1 }
            : { ...totals, amount: totals.amount + converted };
        },
        { amount: 0, pending: 0 },
      );
  }

  function openEditor(rule?: RecurringRule) {
    if (!editable()) return;
    const initialType = rule?.type ?? "expense";
    const initialDate = rule?.startDate ?? today;
    setEditing(rule ?? null);
    setType(initialType);
    setAmount(rule ? String(rule.amount) : "");
    setCurrency(rule?.currency ?? home);
    setCategoryId(
      rule?.categoryId ??
        data.categories.find((category) => category.type === initialType)?.id ??
        "",
    );
    setNote(rule?.note ?? "");
    setDay(rule ? String(rule.day) : String(Number(today.slice(-2))));
    setStartDate(initialDate);
    setEndDate(rule?.endDate ?? "");
    setError("");
    setOpen(true);
  }

  function selectType(nextType: TransactionType) {
    setType(nextType);
    setCategoryId(
      data.categories.find((category) => category.type === nextType)?.id ?? "",
    );
  }

  function save() {
    const trimmedAmount = amount.trim();
    const trimmedStart = startDate.trim();
    const trimmedEnd = endDate.trim();
    const dayNumber = Number(day);

    if (
      !/^\d+(\.\d{1,2})?$/.test(trimmedAmount) ||
      !Number.isFinite(Number(trimmedAmount)) ||
      Number(trimmedAmount) <= 0 ||
      Number(trimmedAmount) > 999999999
    ) {
      setError("Enter a positive amount with up to two decimal places.");
      return;
    }
    if (!Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > 31) {
      setError("Choose a day from 1 to 31.");
      return;
    }
    if (!isValidDate(trimmedStart)) {
      setError("Enter a real start date in YYYY-MM-DD format.");
      return;
    }
    if (trimmedEnd && !isValidDate(trimmedEnd)) {
      setError(
        "Enter a real end date in YYYY-MM-DD format, or leave it blank.",
      );
      return;
    }
    if (trimmedEnd && trimmedEnd < trimmedStart) {
      setError("The end date cannot be before the start date.");
      return;
    }
    if (!CURRENCIES.some((supported) => supported.code === currency)) {
      setError("Choose a supported currency.");
      return;
    }
    if (!matchingCategories.some((category) => category.id === categoryId)) {
      setError("Choose a category that matches this schedule type.");
      return;
    }

    const rule: RecurringRule = {
      id: editing?.id ?? uniqueId(),
      type,
      amount: Number(trimmedAmount),
      currency,
      categoryId,
      note: note.trim(),
      day: dayNumber,
      startDate: trimmedStart,
      ...(trimmedEnd ? { endDate: trimmedEnd } : {}),
      active: editing?.active ?? true,
      ...(editing?.lastPostedMonth
        ? { lastPostedMonth: editing.lastPostedMonth }
        : {}),
    };
    const ratePending =
      rule.currency !== home &&
      availableRate(data.rates, rule.currency, home) == null;

    update((current) => ({
      ...current,
      recurring: editing
        ? (current.recurring ?? []).map((existing) =>
            existing.id === rule.id ? rule : existing,
          )
        : [...(current.recurring ?? []), rule],
    }));
    setOpen(false);
    notify(
      ratePending
        ? "Schedule saved. It will post when an exchange rate is available."
        : editing
          ? "Schedule saved. Previously posted months were not changed."
          : "Recurring schedule saved",
    );
  }

  function toggleActive(rule: RecurringRule) {
    if (!editable()) return;
    const resuming = !rule.active;
    if (resuming && rule.endDate && rule.endDate < today)
      return notify(
        "This schedule has ended. Edit its end date before resuming.",
      );
    update((current) => ({
      ...current,
      recurring: (current.recurring ?? []).map((existing) =>
        existing.id === rule.id
          ? {
              ...existing,
              active: resuming,
              ...(resuming
                ? {
                    startDate:
                      existing.startDate < today ? today : existing.startDate,
                  }
                : {}),
            }
          : existing,
      ),
    }));
    notify(
      resuming
        ? "Resuming starts today; paused months are not backfilled."
        : "Schedule paused. Existing transactions were not deleted.",
    );
  }

  function requestDeletion() {
    if (!editing) return;
    setOpen(false);
    setDeleting(editing);
  }

  function deleteRule() {
    if (!deleting || !editable()) return;
    update((current) => ({
      ...current,
      recurring: (current.recurring ?? []).filter(
        (rule) => rule.id !== deleting.id,
      ),
    }));
    setDeleting(null);
    notify("Schedule deleted. Existing transactions were left unchanged.");
  }

  function nextDueLabel(rule: RecurringRule): string {
    if (!rule.active) return "Paused";
    if (rule.endDate && rule.endDate < today)
      return `Ended ${dateLabel(rule.endDate)}`;
    const due = nextDue(rule, today);
    return due ? `Next due ${dateLabel(due)}` : "No future due date";
  }

  const expenseTotals = totalsFor("expense");
  const incomeTotals = totalsFor("income");
  const displayedRules = [...rules].sort((left, right) => {
    const leftDue = left.active
      ? (nextDue(left, today) ?? "9999-12-31")
      : "9999-12-31";
    const rightDue = right.active
      ? (nextDue(right, today) ?? "9999-12-31")
      : "9999-12-31";
    return (
      leftDue.localeCompare(rightDue) || left.note.localeCompare(right.note)
    );
  });

  return (
    <View style={{ gap: 20 }}>
      <Card style={{ backgroundColor: C.lilac, borderColor: "#E3DCF3" }}>
        <SectionHeading
          title="Recurring schedules"
          sub="A little less manual bookkeeping, every month."
          right={<Icon name="repeat-outline" color={C.purple} size={23} />}
        />
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            gap: 10,
            backgroundColor: "rgba(255,255,255,0.58)",
            borderRadius: 11,
            padding: 13,
          }}
        >
          <Icon name="information-circle-outline" color={C.purple} size={18} />
          <Txt style={{ color: C.purpleDark, fontSize: 12, flex: 1 }}>
            Pocketly automatically posts due ledger entries when the app opens
            or resumes, and catches up while it can. These are not bank
            payments, and schedules cannot run while the app is closed.
          </Txt>
        </View>
      </Card>

      <View
        style={{
          flexDirection: width >= 760 ? "row" : "column",
          gap: 16,
        }}
      >
        <SummaryTile
          label="Active monthly expenses"
          totals={expenseTotals}
          currency={home}
        />
        <SummaryTile
          label="Active monthly income"
          totals={incomeTotals}
          currency={home}
          income
        />
      </View>

      <Card>
        <SectionHeading
          title="Your schedules"
          sub="Amounts stay in the currency you entered."
          right={
            <Button
              small
              label="New schedule"
              icon="add-outline"
              onPress={() => openEditor()}
            />
          }
        />
        {displayedRules.length === 0 ? (
          <Empty
            icon="repeat-outline"
            title="Nothing repeats here yet"
            detail="Add paydays, bills, or other predictable entries so your ledger can stay up to date."
            action={
              <Button
                small
                label="Add a schedule"
                icon="add-outline"
                onPress={() => openEditor()}
                style={{ marginTop: 5 }}
              />
            }
          />
        ) : (
          <View>
            {displayedRules.map((rule, index) => {
              const category = data.categories.find(
                (item) => item.id === rule.categoryId,
              );
              const converted = homeAmount(rule);
              const paused = !rule.active;
              return (
                <View
                  key={rule.id}
                  style={{
                    paddingVertical: 16,
                    borderTopWidth: index ? 1 : 0,
                    borderTopColor: C.line,
                    gap: 13,
                    opacity: paused ? 0.72 : 1,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "flex-start",
                      gap: 12,
                    }}
                  >
                    <View
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 11,
                        backgroundColor: (category?.color ?? C.purple) + "18",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Icon
                        name={category?.icon ?? "repeat-outline"}
                        color={category?.color ?? C.purple}
                        size={19}
                      />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          flexWrap: "wrap",
                          gap: 7,
                        }}
                      >
                        <Txt style={{ fontSize: 14, fontWeight: "600" }}>
                          {rule.note ||
                            category?.name ||
                            "Uncategorized schedule"}
                        </Txt>
                        {paused && (
                          <View
                            style={{
                              backgroundColor: C.bg,
                              borderRadius: 6,
                              paddingHorizontal: 7,
                              paddingVertical: 3,
                              borderWidth: 1,
                              borderColor: C.line,
                            }}
                          >
                            <Txt
                              style={{
                                color: C.muted,
                                fontSize: 10,
                                fontWeight: "600",
                              }}
                            >
                              PAUSED
                            </Txt>
                          </View>
                        )}
                      </View>
                      <Txt
                        style={{ color: C.muted, fontSize: 11, marginTop: 2 }}
                      >
                        {category?.name ?? "Category unavailable"} · Every month
                        on day {rule.day}
                      </Txt>
                    </View>
                    <View style={{ alignItems: "flex-end", maxWidth: 150 }}>
                      <Txt
                        style={{
                          color: rule.type === "income" ? C.mint : C.ink,
                          fontSize: 17,
                          fontWeight: "700",
                          textAlign: "right",
                        }}
                      >
                        {rule.type === "income" ? "+" : "−"}
                        {money(rule.amount, rule.currency)}
                      </Txt>
                      <Txt
                        style={{
                          color: C.muted,
                          fontSize: 10,
                          textAlign: "right",
                          marginTop: 2,
                        }}
                      >
                        {converted == null
                          ? "Home amount pending rate"
                          : `≈ ${money(converted, home)} home`}
                      </Txt>
                    </View>
                  </View>

                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: 10,
                      paddingLeft: 50,
                    }}
                  >
                    <View style={{ flex: 1, minWidth: 160 }}>
                      <Txt
                        style={{
                          color: paused ? C.amber : C.muted,
                          fontSize: 11,
                        }}
                      >
                        {nextDueLabel(rule)}
                      </Txt>
                      {paused && (
                        <Txt
                          style={{ color: C.muted, fontSize: 10, marginTop: 2 }}
                        >
                          Resume to start today; paused months are not
                          backfilled.
                        </Txt>
                      )}
                    </View>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <IconButton
                        label={`Edit ${rule.note || category?.name || "schedule"}`}
                        icon="create-outline"
                        onPress={() => openEditor(rule)}
                        color={C.purple}
                      />
                      <Button
                        small
                        secondary
                        label={paused ? "Resume" : "Pause"}
                        icon={paused ? "play-outline" : "pause-outline"}
                        onPress={() => toggleActive(rule)}
                      />
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </Card>

      <Dialog
        visible={open}
        title={editing ? "Edit schedule" : "A recurring entry"}
        subtitle={
          editing
            ? "Changes affect future posting only. Previously posted months stay put."
            : "Set it once, then let Pocketly keep your ledger in step."
        }
        onClose={() => setOpen(false)}
      >
        <View style={{ flexDirection: "row", gap: 10, marginBottom: 22 }}>
          <Chip
            label="↗ Expense"
            active={type === "expense"}
            onPress={() => selectType("expense")}
          />
          <Chip
            label="↙ Income"
            active={type === "income"}
            onPress={() => selectType("income")}
          />
        </View>
        <Field
          label={`Original amount (${currency})`}
          value={amount}
          numeric
          onChangeText={setAmount}
          placeholder="0.00"
        />
        <CurrencySelect
          label="Original currency"
          value={currency}
          onChange={setCurrency}
        />
        {currency !== home &&
          availableRate(data.rates, currency, home) == null && (
            <View
              style={{
                flexDirection: "row",
                gap: 7,
                alignItems: "flex-start",
                marginTop: -6,
                marginBottom: 16,
              }}
            >
              <Icon name="time-outline" color={C.amber} size={15} />
              <Txt style={{ color: C.amber, fontSize: 11, flex: 1 }}>
                No cached rate is available for this conversion yet. You can
                still save this schedule; it will post once a rate is available.
              </Txt>
            </View>
          )}
        <Txt style={[s.label, { marginBottom: 9 }]}>Category</Txt>
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 8,
            marginBottom: 20,
          }}
        >
          {matchingCategories.map((category) => (
            <Chip
              key={category.id}
              label={category.name}
              active={categoryId === category.id}
              onPress={() => setCategoryId(category.id)}
            />
          ))}
          {matchingCategories.length === 0 && (
            <Txt style={{ color: C.muted, fontSize: 12 }}>
              Add a {type} category in Data & settings first.
            </Txt>
          )}
        </View>
        <Field
          label="Note (optional)"
          value={note}
          onChangeText={setNote}
          placeholder="e.g. Rent, salary, or streaming"
        />
        <View style={{ flexDirection: "row", gap: 12 }}>
          <View style={{ width: 120 }}>
            <Field
              label="Day of month"
              value={day}
              numeric
              onChangeText={setDay}
              placeholder="1–31"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Field
              label="Start date"
              value={startDate}
              onChangeText={setStartDate}
              placeholder="YYYY-MM-DD"
            />
          </View>
        </View>
        <Field
          label="End date (optional)"
          value={endDate}
          onChangeText={setEndDate}
          placeholder="YYYY-MM-DD"
        />
        <Txt
          style={{
            color: C.muted,
            fontSize: 11,
            marginTop: -4,
            marginBottom: 18,
          }}
        >
          Schedules on days 29–31 use the last day of shorter months. A past
          start date posts all missed due months immediately. Edits do not
          regenerate months already posted.
        </Txt>
        {!!error && <Txt style={s.error}>{error}</Txt>}
        <Button
          label={editing ? "Save changes" : "Save schedule"}
          icon="checkmark-outline"
          onPress={save}
        />
        {editing && (
          <Button
            secondary
            label="Delete schedule"
            icon="trash-outline"
            onPress={requestDeletion}
            style={{ marginTop: 10, borderColor: "#F0D9D9" }}
          />
        )}
      </Dialog>

      <Dialog
        visible={!!deleting}
        title="Delete this schedule?"
        subtitle="This only removes the future rule."
        onClose={() => setDeleting(null)}
      >
        <Txt style={{ color: C.muted, fontSize: 13, marginBottom: 21 }}>
          Existing transactions stay in your ledger. This action cannot be
          undone.
        </Txt>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Button
            secondary
            label="Keep schedule"
            onPress={() => setDeleting(null)}
          />
          <Button
            label="Delete schedule"
            icon="trash-outline"
            onPress={deleteRule}
            style={{ backgroundColor: C.red }}
          />
        </View>
      </Dialog>
    </View>
  );
}
