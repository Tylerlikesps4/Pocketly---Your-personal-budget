import React from "react";
import { View, Pressable } from "react-native";
import { C, Txt, Icon } from "./ui";
import { formatMoney, type Category, type Transaction } from "@/lib/budget";
import { useBudget } from "@/hooks/budget-store";
export function TransactionRow({
  transaction: t,
  category,
  onPress,
  compact = false,
}: {
  transaction: Transaction;
  category?: Category;
  onPress?: () => void;
  compact?: boolean;
}) {
  const { data, money } = useBudget();
  const date = new Date(t.date + "T12:00:00");
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={`${t.note || category?.name}, ${t.type} ${money(t.amount)}, ${t.date}${onPress ? ", edit transaction" : ""}`}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: C.line,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          backgroundColor: (category?.color || C.purple) + "18",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon
          name={
            category?.icon ||
            (t.type === "income" ? "wallet-outline" : "bag-outline")
          }
          color={category?.color || C.purple}
          size={19}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Txt numberOfLines={1} style={{ fontWeight: "500", fontSize: 13 }}>
          {t.note || category?.name || "Transaction"}
        </Txt>
        <Txt style={{ color: C.muted, fontSize: 11 }}>
          {category?.name} ·{" "}
          {date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </Txt>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Txt
          style={{
            fontWeight: "600",
            fontSize: 13,
            color: t.type === "income" ? C.mint : C.ink,
          }}
        >
          {t.type === "income" ? "+" : "−"}
          {money(t.amount)}
        </Txt>
        {t.currency && t.currency !== (data.baseCurrency || "USD") && (
          <Txt style={{ fontSize: 10, color: C.muted }}>
            {formatMoney(t.originalAmount ?? t.amount, t.currency)} original
          </Txt>
        )}
        {!compact && (
          <Txt style={{ fontSize: 10, color: C.muted }}>
            {t.recurringId ? "Recurring · " : ""}
            {t.type === "income" ? "Income" : "Expense"}
          </Txt>
        )}
      </View>
      {onPress && !compact && <Icon name="chevron-forward-outline" size={15} />}
    </Pressable>
  );
}
