import React from "react";
import { View } from "react-native";
import Svg, {
  Circle,
  Path,
  Line,
  Text as SvgText,
  Defs,
  LinearGradient,
  Stop,
} from "react-native-svg";
import { C, Txt } from "./ui";
import { type Category } from "@/lib/budget";

import { useBudget } from "@/hooks/budget-store";
export function Donut({
  rows,
  total,
}: {
  rows: { category: Category; spent: number }[];
  total: number;
}) {
  const { money: formatMoney } = useBudget();
  const r = 62,
    circumference = 2 * Math.PI * r;
  return (
    <View
      style={{
        width: 166,
        height: 166,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Svg
        width={166}
        height={166}
        viewBox="0 0 166 166"
        accessibilityLabel={`Spending by category: ${rows.map((r) => r.category.name + " " + formatMoney(r.spent)).join(", ")}`}
      >
        <Circle
          cx={83}
          cy={83}
          r={r}
          fill="none"
          stroke={C.line}
          strokeWidth={18}
        />
        {rows
          .filter((r) => r.spent > 0)
          .map((row, index, segments) => {
            const length = total ? (row.spent / total) * circumference : 0;
            const start = total
              ? (segments
                  .slice(0, index)
                  .reduce((sum, segment) => sum + segment.spent, 0) /
                  total) *
                circumference
              : 0;
            return (
              <Circle
                key={row.category.id}
                cx={83}
                cy={83}
                r={r}
                fill="none"
                stroke={row.category.color}
                strokeWidth={18}
                strokeDasharray={`${Math.max(0, length - 3)} ${circumference - Math.max(0, length - 3)}`}
                strokeDashoffset={-start}
                transform="rotate(-90 83 83)"
              />
            );
          })}
      </Svg>
      <View
        pointerEvents="none"
        style={{ position: "absolute", alignItems: "center" }}
      >
        <Txt style={{ color: C.muted, fontSize: 10 }}>TOTAL SPENT</Txt>
        <Txt
          style={{
            fontSize: 23,
            fontWeight: "700",
            letterSpacing: -0.8,
            marginTop: 4,
          }}
        >
          {formatMoney(total).replace(".00", "")}
        </Txt>
      </View>
    </View>
  );
}
export function Sparkline({
  values,
  color,
}: {
  values: number[];
  color: string;
}) {
  const min = Math.min(...values),
    max = Math.max(...values),
    range = max - min || 1;
  const points = values
    .map(
      (v, i) =>
        `${i * (100 / Math.max(values.length - 1, 1))},${30 - ((v - min) / range) * 22}`,
    )
    .join(" L ");
  return (
    <Svg width={100} height={35}>
      <Path
        d={`M ${points}`}
        stroke={color}
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
export function TrendChart({
  rows,
}: {
  rows: { month: string; label: string; income: number; expenses: number }[];
}) {
  const { data, money: formatMoney } = useBudget();
  const symbol =
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: data.baseCurrency || "USD",
      currencyDisplay: "narrowSymbol",
    })
      .formatToParts(0)
      .find((p) => p.type === "currency")?.value || "";
  const w = 520,
    h = 194,
    left = 43,
    right = 12,
    top = 12,
    bottom = 29;
  const max = Math.max(
    1000,
    Math.ceil(Math.max(...rows.flatMap((r) => [r.income, r.expenses])) / 1000) *
      1000,
  );
  const x = (i: number) =>
    left + i * ((w - left - right) / Math.max(rows.length - 1, 1));
  const y = (v: number) => h - bottom - (v / max) * (h - top - bottom);
  const path = (key: "income" | "expenses") =>
    rows.map((r, i) => `${i ? "L" : "M"} ${x(i)} ${y(r[key])}`).join(" ");
  const expensePath = path("expenses");
  return (
    <View
      accessibilityLabel={`Monthly trend. ${rows.map((r) => `${r.label}: income ${formatMoney(r.income)}, spending ${formatMoney(r.expenses)}`).join(". ")}`}
    >
      <Svg width="100%" height={194} viewBox={`0 0 ${w} ${h}`}>
        <Defs>
          <LinearGradient id="spendingFade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={C.purple} stopOpacity={0.11} />
            <Stop offset="1" stopColor={C.purple} stopOpacity={0.01} />
          </LinearGradient>
        </Defs>
        {[0, 1, 2, 3].map((i) => {
          const value = (max * i) / 3;
          return (
            <React.Fragment key={i}>
              <Line
                x1={left}
                x2={w - right}
                y1={y(value)}
                y2={y(value)}
                stroke={C.line}
                strokeDasharray="4,5"
              />
              <SvgText
                x={left - 9}
                y={y(value) + 4}
                textAnchor="end"
                fill={C.muted}
                fontSize={10}
              >
                {value
                  ? `${symbol}${(value / 1000).toFixed(1).replace(".0", "")}k`
                  : `${symbol}0`}
              </SvgText>
            </React.Fragment>
          );
        })}
        <Path
          d={`${expensePath} L ${x(rows.length - 1)} ${h - bottom} L ${left} ${h - bottom} Z`}
          fill="url(#spendingFade)"
        />
        <Path
          d={path("income")}
          stroke={C.mint}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <Path
          d={expensePath}
          stroke={C.purple}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        {rows.map((r, i) => (
          <React.Fragment key={r.month}>
            <Circle
              cx={x(i)}
              cy={y(r.expenses)}
              r={3.5}
              fill="#fff"
              stroke={C.purple}
              strokeWidth={2}
            />
            <SvgText
              x={x(i)}
              y={h - 5}
              textAnchor="middle"
              fill={C.muted}
              fontSize={11}
            >
              {r.label.split(" ")[0]}
            </SvgText>
          </React.Fragment>
        ))}
      </Svg>
    </View>
  );
}
