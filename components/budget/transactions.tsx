import React, { useState } from "react";
import { View, TextInput } from "react-native";
import { useBudget } from "@/hooks/budget-store";
import { type Transaction } from "@/lib/budget";
import { C, Card, Chip, Txt, Icon, Empty, Button } from "./ui";
import { TransactionRow } from "./transaction-row";
export function Transactions({
  onEdit,
  onAdd,
  onImport,
}: {
  onEdit: (t: Transaction) => void;
  onAdd: () => void;
  onImport: () => void;
}) {
  const { data, month, demo, money: formatMoney } = useBudget();
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [category, setCategory] = useState("all"),
    [limit, setLimit] = useState(50);
  const rows = data.transactions
    .filter(
      (t) =>
        t.date.startsWith(month) &&
        (filter === "all" || t.type === filter) &&
        (category === "all" || t.categoryId === category) &&
        `${t.note} ${data.categories.find((c) => c.id === t.categoryId)?.name || ""} ${t.amount}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) => b.date.localeCompare(a.date));
  return (
    <Card>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: C.bg,
          borderWidth: 1,
          borderColor: C.line,
          borderRadius: 10,
          paddingHorizontal: 13,
          marginBottom: 17,
        }}
      >
        <Icon name="search-outline" size={18} />
        <TextInput
          accessibilityLabel="Search transactions"
          value={query}
          onChangeText={(v) => {
            setQuery(v);
            setLimit(50);
          }}
          placeholder="Search a note, category, or amount"
          placeholderTextColor={C.muted}
          style={{ flex: 1, padding: 14, color: C.ink, fontSize: 13 }}
        />
      </View>
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 8,
          marginBottom: 12,
        }}
      >
        {["all", "expense", "income"].map((f) => (
          <Chip
            key={f}
            label={
              f === "all"
                ? "All transactions"
                : f === "expense"
                  ? "Expenses"
                  : "Income"
            }
            active={filter === f}
            onPress={() => {
              setFilter(f);
              setLimit(50);
            }}
          />
        ))}
      </View>
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 7,
          marginBottom: 18,
        }}
      >
        <Chip
          label="All categories"
          active={category === "all"}
          onPress={() => setCategory("all")}
        />
        {data.categories
          .filter((c) => filter === "all" || c.type === filter)
          .map((c) => (
            <Chip
              key={c.id}
              label={c.name}
              active={category === c.id}
              onPress={() => setCategory(c.id)}
            />
          ))}
      </View>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          paddingVertical: 12,
          borderTopWidth: 1,
          borderTopColor: C.line,
        }}
      >
        <Txt style={{ fontSize: 11, color: C.muted }}>
          {rows.length} transaction{rows.length !== 1 ? "s" : ""}
        </Txt>
        <Txt style={{ fontSize: 11, color: C.muted }}>
          Net{" "}
          {formatMoney(
            rows.reduce(
              (s, t) => s + (t.type === "income" ? t.amount : -t.amount),
              0,
            ),
          )}
        </Txt>
      </View>
      {rows.length ? (
        rows
          .slice(0, limit)
          .map((t) => (
            <TransactionRow
              key={t.id}
              transaction={t}
              category={data.categories.find((c) => c.id === t.categoryId)}
              onPress={demo ? undefined : () => onEdit(t)}
            />
          ))
      ) : (
        <Empty
          icon="receipt-outline"
          title={
            query || filter !== "all" || category !== "all"
              ? "No matches this month"
              : "Your story starts here"
          }
          detail="Record income and expenses, or bring your existing transactions over from a CSV."
          action={
            <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
              <Button small label="Add transaction" onPress={onAdd} />
              <Button small secondary label="Import CSV" onPress={onImport} />
            </View>
          }
        />
      )}
      {rows.length > limit && (
        <Button
          secondary
          label={`Show more (${rows.length - limit} remaining)`}
          onPress={() => setLimit(limit + 50)}
          style={{ marginTop: 20 }}
        />
      )}
      {demo && (
        <Txt style={{ fontSize: 11, color: C.muted, marginTop: 16 }}>
          Sample transactions are read-only. Start your own budget to add and
          edit.
        </Txt>
      )}
    </Card>
  );
}
