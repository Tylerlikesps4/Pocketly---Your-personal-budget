import React from "react";
import { View, Pressable, useWindowDimensions } from "react-native";
import { useBudget } from "@/hooks/budget-store";
import {
  categorySpending,
  summarize,
  trends,
  insights,
  formatMonth,
} from "@/lib/budget";
import { Card, C, Txt, Icon, SectionHeading, Empty } from "./ui";
import { Donut, Sparkline, TrendChart } from "./charts";
import { TransactionRow } from "./transaction-row";

export function Dashboard({
  onTransactions,
  onBudgets,
  onAdd,
}: {
  onTransactions: () => void;
  onBudgets: () => void;
  onAdd: () => void;
}) {
  const { data, month, money: formatMoney } = useBudget();
  const { width } = useWindowDimensions();
  const wide = width >= 1050;
  const sum = summarize(data, month),
    rows = categorySpending(data, month),
    trend = trends(data, month, 6),
    tips = insights(data, month).slice(0, 3);
  const spentRows = rows
    .filter((r) => r.spent > 0)
    .sort((a, b) => b.spent - a.spent);
  const recent = data.transactions
    .filter((t) => t.date.startsWith(month))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 4);
  const percent =
    sum.budgetTotal > 0
      ? Math.round((sum.expenses / sum.budgetTotal) * 100)
      : 0;
  return (
    <View style={{ gap: 20 }}>
      <View style={{ flexDirection: wide ? "row" : "column", gap: 16 }}>
        <View
          style={{
            flex: wide ? 1.5 : undefined,
            backgroundColor: C.lilac,
            borderRadius: 17,
            padding: 26,
            minHeight: 207,
            overflow: "hidden",
          }}
        >
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              right: -60,
              top: -80,
              width: 220,
              height: 220,
              borderRadius: 110,
              borderWidth: 28,
              borderColor: "#E6DFF5",
            }}
          />
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Txt
              style={{ color: C.purpleDark, fontSize: 12, fontWeight: "500" }}
            >
              {sum.budgetTotal ? "LEFT IN YOUR BUDGET" : "YOUR NET BALANCE"}
            </Txt>
            <Icon name="sparkles-outline" size={19} color={C.purple} />
          </View>
          <Txt
            style={{
              color: "#4B3B7B",
              fontWeight: "700",
              fontSize: 39,
              lineHeight: 53,
              letterSpacing: -1.6,
              marginTop: 9,
            }}
          >
            {formatMoney(sum.budgetTotal ? sum.remaining : sum.balance)}
          </Txt>
          <Txt style={{ color: "#8C7FA6", fontSize: 11, marginTop: 1 }}>
            {sum.budgetTotal
              ? `of ${formatMoney(sum.budgetTotal)} planned for ${formatMonth(month, true)}`
              : "Income minus expenses this month"}
          </Txt>
          <View
            style={{
              height: 5,
              borderRadius: 5,
              backgroundColor: "#DDD4ED",
              marginTop: 21,
              overflow: "hidden",
            }}
          >
            <View
              style={{
                width: `${Math.min(percent, 100)}%`,
                height: "100%",
                backgroundColor: sum.remaining < 0 ? C.red : C.purple,
                borderRadius: 5,
              }}
            />
          </View>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              marginTop: 7,
            }}
          >
            <Txt style={{ fontSize: 10, color: C.purpleDark }}>
              {sum.budgetTotal
                ? `${percent}% of budget used`
                : "Set budgets to plan your spending"}
            </Txt>
            {sum.budgetTotal > 0 && (
              <Txt style={{ fontSize: 10, color: C.purpleDark }}>
                Net {formatMoney(sum.balance)}
              </Txt>
            )}
          </View>
        </View>
        <View
          style={{ flex: wide ? 2 : undefined, flexDirection: "row", gap: 16 }}
        >
          {[
            {
              title: "Income",
              value: sum.income,
              icon: "arrow-down-outline",
              color: C.mint,
              bg: C.mintLight,
              values: trend.map((t) => t.income),
              text: "Money coming in",
            },
            {
              title: "Expenses",
              value: sum.expenses,
              icon: "arrow-up-outline",
              color: C.red,
              bg: C.redLight,
              values: trend.map((t) => t.expenses),
              text: "Money going out",
            },
          ].map((stat) => (
            <Card
              key={stat.title}
              style={{
                flex: 1,
                padding: wide ? 23 : 18,
                justifyContent: "space-between",
                minHeight: 207,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <Txt style={{ color: C.muted, fontSize: 12 }}>{stat.title}</Txt>
                <View
                  style={{
                    width: 31,
                    height: 31,
                    borderRadius: 9,
                    backgroundColor: stat.bg,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon name={stat.icon} size={17} color={stat.color} />
                </View>
              </View>
              <View>
                <Txt
                  style={{
                    fontSize: wide ? 28 : 25,
                    lineHeight: 38,
                    fontWeight: "600",
                    letterSpacing: -0.9,
                  }}
                >
                  {formatMoney(stat.value)}
                </Txt>
                <Txt style={{ color: C.muted, fontSize: 10 }}>{stat.text}</Txt>
              </View>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginTop: 8,
                }}
              >
                <Txt style={{ color: stat.color, fontSize: 10 }}>
                  Last 6 months
                </Txt>
                {wide && <Sparkline values={stat.values} color={stat.color} />}
              </View>
            </Card>
          ))}
        </View>
      </View>
      <View style={{ flexDirection: wide ? "row" : "column", gap: 20 }}>
        <Card style={{ flex: wide ? 1 : undefined }}>
          <SectionHeading
            title="Where it goes"
            sub="Spending by category"
            right={<Icon name="pie-chart-outline" size={18} />}
          />
          {sum.expenses ? (
            <>
              <View
                style={{
                  alignItems: "center",
                  marginTop: -4,
                  marginBottom: 19,
                }}
              >
                <Donut rows={spentRows} total={sum.expenses} />
              </View>
              <View style={{ gap: 12 }}>
                {spentRows.slice(0, 6).map((r) => (
                  <View
                    key={r.category.id}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 9,
                    }}
                  >
                    <View
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 3,
                        backgroundColor: r.category.color,
                      }}
                    />
                    <Txt style={{ flex: 1, fontSize: 12 }}>
                      {r.category.name}
                    </Txt>
                    <Txt style={{ fontSize: 12, fontWeight: "500" }}>
                      {formatMoney(r.spent).replace(".00", "")}
                    </Txt>
                    <Txt
                      style={{
                        fontSize: 11,
                        color: C.muted,
                        width: 33,
                        textAlign: "right",
                      }}
                    >
                      {Math.round((r.spent / sum.expenses) * 100)}%
                    </Txt>
                  </View>
                ))}
                {spentRows.length > 6 && (
                  <Txt style={{ fontSize: 11, color: C.muted }}>
                    +{spentRows.length - 6} more categories included in chart
                  </Txt>
                )}
              </View>
            </>
          ) : (
            <Empty
              title="A clean slate"
              detail="Log your first expense to see where your money goes."
            />
          )}
        </Card>
        <View style={{ flex: wide ? 1.65 : undefined, gap: 20 }}>
          <Card>
            <SectionHeading
              title="The bigger picture"
              sub="Income & expenses, month over month"
              right={
                <View
                  style={{
                    backgroundColor: C.bg,
                    borderRadius: 7,
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                  }}
                >
                  <Txt style={{ color: C.muted, fontSize: 10 }}>6 months</Txt>
                </View>
              }
            />
            <View style={{ flexDirection: "row", gap: 19, marginBottom: 15 }}>
              {[
                { c: C.mint, t: "Income" },
                { c: C.purple, t: "Expenses" },
              ].map((l) => (
                <View
                  key={l.t}
                  style={{ flexDirection: "row", gap: 6, alignItems: "center" }}
                >
                  <View
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: 5,
                      backgroundColor: l.c,
                    }}
                  />
                  <Txt style={{ color: C.muted, fontSize: 10 }}>{l.t}</Txt>
                </View>
              ))}
            </View>
            <TrendChart rows={trend} />
            <Txt style={{ fontSize: 10, color: C.muted, marginTop: 8 }}>
              Current month is month-to-date; past months show full totals.
            </Txt>
          </Card>
          <Pressable
            onPress={onBudgets}
            accessibilityRole="button"
            accessibilityLabel="View all category budgets"
            style={{
              backgroundColor: "#F0F5F2",
              borderRadius: 15,
              padding: 22,
              flexDirection: "row",
              alignItems: "center",
              gap: 13,
            }}
          >
            <View
              style={{
                width: 38,
                height: 38,
                borderRadius: 12,
                backgroundColor: "#DDEDE4",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name="leaf-outline" color={C.mint} />
            </View>
            <View style={{ flex: 1 }}>
              <Txt
                style={{ fontSize: 13, fontWeight: "600", color: "#446F5D" }}
              >
                {sum.budgetTotal
                  ? "A plan for every pocket"
                  : "Give your money a little direction"}
              </Txt>
              <Txt style={{ fontSize: 11, color: "#7E978B", marginTop: 2 }}>
                {sum.budgetTotal
                  ? `${rows.filter((r) => r.budget > 0 && r.spent <= r.budget).length} of ${rows.filter((r) => r.budget > 0).length} budgeted categories are on track.`
                  : "Set a monthly limit for each spending category."}
              </Txt>
            </View>
            <Icon name="arrow-forward-outline" color={C.mint} size={18} />
          </Pressable>
        </View>
      </View>
      <View style={{ flexDirection: wide ? "row" : "column", gap: 20 }}>
        <Card style={{ flex: wide ? 1 : undefined }}>
          <SectionHeading
            title="A few things to know"
            sub="Small insights. Smarter decisions."
            right={<Icon name="bulb-outline" size={18} color={C.purple} />}
          />
          <View style={{ gap: 15 }}>
            {tips.length ? (
              tips.map((t) => (
                <View
                  key={t.id}
                  style={{
                    flexDirection: "row",
                    gap: 11,
                    alignItems: "flex-start",
                  }}
                >
                  <View
                    style={{
                      padding: 8,
                      backgroundColor:
                        t.tone === "warning"
                          ? "#FAF0E6"
                          : t.tone === "positive"
                            ? C.mintLight
                            : C.lilac,
                      borderRadius: 9,
                    }}
                  >
                    <Icon
                      name={
                        t.tone === "warning"
                          ? "alert-circle-outline"
                          : t.tone === "positive"
                            ? "checkmark-circle-outline"
                            : "sparkles-outline"
                      }
                      size={17}
                      color={
                        t.tone === "warning"
                          ? C.amber
                          : t.tone === "positive"
                            ? C.mint
                            : C.purple
                      }
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Txt style={{ fontSize: 12, fontWeight: "600" }}>
                      {t.title}
                    </Txt>
                    <Txt
                      style={{
                        fontSize: 11,
                        color: C.muted,
                        lineHeight: 18,
                        marginTop: 2,
                      }}
                    >
                      {t.detail}
                    </Txt>
                  </View>
                </View>
              ))
            ) : (
              <Txt style={{ color: C.muted, fontSize: 12 }}>
                Your insights will appear as you add transactions and budgets.
              </Txt>
            )}
          </View>
        </Card>
        <Card style={{ flex: wide ? 1.65 : undefined }}>
          <SectionHeading
            title="Recent transactions"
            sub="Your latest comings and goings"
            right={
              <Pressable onPress={onTransactions} accessibilityRole="button">
                <Txt
                  style={{ color: C.purple, fontSize: 11, fontWeight: "600" }}
                >
                  View all →
                </Txt>
              </Pressable>
            }
          />
          {recent.length ? (
            recent.map((t) => (
              <TransactionRow
                key={t.id}
                compact
                transaction={t}
                category={data.categories.find((c) => c.id === t.categoryId)}
              />
            ))
          ) : (
            <Empty
              icon="receipt-outline"
              title="Nothing here just yet"
              detail="Your next coffee, paycheck, or grocery trip belongs here."
              action={
                <Pressable onPress={onAdd}>
                  <Txt style={{ color: C.purple, fontSize: 12 }}>
                    Add a transaction →
                  </Txt>
                </Pressable>
              }
            />
          )}
        </Card>
      </View>
    </View>
  );
}
