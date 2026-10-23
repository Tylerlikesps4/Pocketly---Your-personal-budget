import React, { useState } from "react";
import { View, Pressable, useWindowDimensions } from "react-native";
import { useBudget } from "@/hooks/budget-store";
import {
  categorySpending,
  summarize,
  formatMonth,
  type Category,
} from "@/lib/budget";
import {
  C,
  Card,
  Txt,
  Icon,
  SectionHeading,
  Dialog,
  Field,
  Button,
  s,
} from "./ui";
export function Budgets({ notify }: { notify: (s: string) => void }) {
  const {
    data,
    month,
    update,
    demo,
    recoveryRequired,
    money: formatMoney,
  } = useBudget();
  const { width } = useWindowDimensions();
  const [category, setCategory] = useState<Category | null>(null),
    [amount, setAmount] = useState(""),
    [error, setError] = useState("");
  const rows = categorySpending(data, month),
    total = summarize(data, month);
  function edit(c: Category, budget: number) {
    if (recoveryRequired)
      return notify(
        "Edits are paused to protect unreadable saved data. See Data & settings.",
      );
    if (demo)
      return notify("Go to your personal budget to set category limits.");
    setCategory(c);
    setAmount(budget ? String(budget) : "");
    setError("");
  }
  function save() {
    if (
      !/^\d+(\.\d{1,2})?$/.test(amount) ||
      Number(amount) < 0 ||
      !Number.isFinite(Number(amount)) ||
      Number(amount) > 999999999
    )
      return setError(
        "Enter a budget of zero or more, with up to two decimals.",
      );
    update((d) => ({
      ...d,
      budgets: [
        ...d.budgets.filter(
          (b) => !(b.month === month && b.categoryId === category?.id),
        ),
        ...(Number(amount) > 0
          ? [{ month, categoryId: category!.id, amount: Number(amount) }]
          : []),
      ],
    }));
    notify("Monthly budget saved");
    setCategory(null);
  }
  return (
    <View style={{ gap: 20 }}>
      <Card>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 20,
          }}
        >
          {[
            { label: "Total monthly budget", value: total.budgetTotal },
            { label: "Spent this month", value: total.expenses },
            { label: "Remaining", value: total.remaining },
          ].map((v, i) => (
            <View key={v.label}>
              <Txt style={{ fontSize: 11, color: C.muted }}>{v.label}</Txt>
              <Txt
                style={{
                  fontSize: 26,
                  fontWeight: "600",
                  marginTop: 7,
                  color: i === 2 ? (v.value < 0 ? C.red : C.purple) : C.ink,
                }}
              >
                {formatMoney(v.value)}
              </Txt>
            </View>
          ))}
        </View>
        <Txt style={{ fontSize: 11, color: C.muted, marginTop: 20 }}>
          Budgets are set per month. Unbudgeted expenses still count toward your
          total spending.
        </Txt>
      </Card>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16 }}>
        {rows.map((r) => {
          const over = r.budget > 0 && r.spent > r.budget,
            progress = r.budget > 0 ? r.spent / r.budget : 0;
          return (
            <Card
              key={r.category.id}
              style={{ width: width >= 1100 ? "48%" : "100%" }}
            >
              <SectionHeading
                title={r.category.name}
                right={
                  <View
                    style={{
                      padding: 9,
                      backgroundColor: r.category.color + "18",
                      borderRadius: 11,
                    }}
                  >
                    <Icon name={r.category.icon} color={r.category.color} />
                  </View>
                }
              />
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                }}
              >
                <Txt
                  style={{
                    fontSize: 25,
                    fontWeight: "600",
                    letterSpacing: -0.5,
                  }}
                >
                  {formatMoney(r.spent)}
                  <Txt style={{ fontSize: 12, color: C.muted }}> spent</Txt>
                </Txt>
                <Txt style={{ fontSize: 11, color: C.muted }}>
                  of {formatMoney(r.budget)}
                </Txt>
              </View>
              <View
                style={{
                  height: 7,
                  backgroundColor: C.line,
                  borderRadius: 6,
                  overflow: "hidden",
                  marginVertical: 16,
                }}
              >
                <View
                  style={{
                    width: `${Math.min(progress * 100, 100)}%`,
                    height: "100%",
                    borderRadius: 6,
                    backgroundColor: over ? C.red : r.category.color,
                  }}
                />
              </View>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <Txt style={{ color: over ? C.red : C.muted, fontSize: 12 }}>
                  {r.budget
                    ? `${formatMoney(Math.abs(r.remaining))} ${over ? "over budget" : "left"}`
                    : "No budget set"}
                </Txt>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Set ${r.category.name} budget`}
                  onPress={() => edit(r.category, r.budget)}
                >
                  <Txt
                    style={{ color: C.purple, fontSize: 12, fontWeight: "600" }}
                  >
                    {r.budget ? "Edit budget" : "Set budget"} →
                  </Txt>
                </Pressable>
              </View>
            </Card>
          );
        })}
      </View>
      <Dialog
        visible={!!category}
        title={`${category?.name || "Category"} budget`}
        subtitle={`Plan a little breathing room for ${formatMonth(month)}.`}
        onClose={() => setCategory(null)}
      >
        <Field
          label={`Monthly budget (${data.baseCurrency || "USD"})`}
          value={amount}
          numeric
          onChangeText={setAmount}
          placeholder="300.00"
        />
        <Txt style={{ fontSize: 11, color: C.muted, marginBottom: 18 }}>
          Enter 0 to remove this month’s budget. Other months stay unchanged.
        </Txt>
        {!!error && <Txt style={s.error}>{error}</Txt>}
        <Button label="Save budget" icon="checkmark-outline" onPress={save} />
      </Dialog>
    </View>
  );
}
