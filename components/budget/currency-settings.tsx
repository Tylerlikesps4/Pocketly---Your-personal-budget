import React, { useState } from "react";
import { View } from "react-native";
import { useBudget } from "@/hooks/budget-store";
import { baseCurrency, changeBaseCurrency, rateFor } from "@/lib/currency";
import { C, Card, SectionHeading, Txt, Icon, Button, Dialog, s } from "./ui";
import { CurrencySelect } from "./currency-select";
export function CurrencySettings({
  notify,
}: {
  notify: (message: string) => void;
}) {
  const {
    data,
    demo,
    recoveryRequired,
    update,
    refreshRates,
    ratesLoading,
    ratesError,
  } = useBudget();
  const [choice, setChoice] = useState(baseCurrency(data)),
    [confirm, setConfirm] = useState(false),
    [error, setError] = useState("");
  const home = baseCurrency(data);
  async function prepare() {
    if (demo || recoveryRequired)
      return notify(
        demo
          ? "Go to your personal budget to change its home currency."
          : "Edits are paused to protect unreadable saved data.",
      );
    setError("");
    try {
      let snapshot = data.rates;
      try {
        snapshot = await refreshRates(true);
      } catch {
        if (!snapshot)
          throw new Error(
            "No cached rates are available. Connect to the internet before changing your home currency.",
          );
      }
      rateFor(snapshot || data.rates, home, choice);
      setConfirm(true);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Refresh exchange rates before changing home currency.",
      );
    }
  }
  function change() {
    try {
      if (!data.rates) throw new Error("Refresh exchange rates first.");
      update((d) => changeBaseCurrency(d, choice, d.rates!));
      setConfirm(false);
      notify(
        `Home currency changed to ${choice}. Existing amounts and budgets were converted.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to change currency.");
      setConfirm(false);
    }
  }
  return (
    <>
      <Card>
        <SectionHeading
          title="One budget. More currencies."
          sub={`Your home currency is ${home}. Budgets and dashboard totals use it.`}
          right={<Icon name="globe-outline" color={C.purple} />}
        />
        <CurrencySelect
          label="Home currency"
          value={choice}
          onChange={setChoice}
        />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          <Button
            small
            label="Change home currency"
            disabled={choice === home || ratesLoading}
            onPress={prepare}
          />
          <Button
            small
            secondary
            label={
              ratesLoading ? "Refreshing rates…" : "Refresh exchange rates"
            }
            disabled={ratesLoading || demo || recoveryRequired}
            icon="refresh-outline"
            onPress={() => {
              refreshRates(true)
                .then(() => notify("Reference rates refreshed"))
                .catch(() =>
                  notify(
                    "Rates could not be refreshed. Any cached rates remain available.",
                  ),
                );
            }}
          />
        </View>
        {!!error && <Txt style={[s.error, { marginTop: 15 }]}>{error}</Txt>}
        <View
          style={{
            padding: 14,
            borderRadius: 10,
            backgroundColor: C.bg,
            marginTop: 18,
            gap: 5,
          }}
        >
          <Txt style={{ fontSize: 12, fontWeight: "500" }}>
            {data.rates
              ? `ECB reference rates · ${data.rates.date}`
              : "Exchange rates will load when you open your personal budget."}
          </Txt>
          <Txt style={{ fontSize: 11, color: C.muted }}>
            Daily reference rates via Frankfurter—not live bank or card
            settlement rates. New foreign transactions use the latest cached
            rate, locked when saved. No transaction data is sent to the rate
            provider.
          </Txt>
          {data.rates && (
            <Txt style={{ fontSize: 10, color: C.muted }}>
              Last checked: {new Date(data.rates.fetchedAt).toLocaleString()}
            </Txt>
          )}
          {!!ratesError && (
            <Txt style={{ fontSize: 11, color: C.amber }}>{ratesError}</Txt>
          )}
        </View>
      </Card>
      <Dialog
        visible={confirm}
        title={`Use ${choice} as your home currency?`}
        subtitle="This changes how your whole budget is expressed."
        onClose={() => setConfirm(false)}
      >
        <Txt style={{ fontSize: 13, color: C.muted, marginBottom: 18 }}>
          All saved transaction accounting amounts and category budgets will be
          converted from {home} to {choice} at the cached reference rate from{" "}
          {data.rates?.date || "the latest check"}. Original transaction amounts
          and currencies stay attached. Recurring schedules keep their original
          currency.
        </Txt>
        <Txt style={{ fontSize: 12, color: C.purple, marginBottom: 22 }}>
          This is a currency conversion, not just a different currency symbol.
          Export backups first if you want a copy of the old accounting values.
        </Txt>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Button
            secondary
            label="Keep current"
            onPress={() => setConfirm(false)}
          />
          <Button label="Convert my budget" onPress={change} />
        </View>
      </Dialog>
    </>
  );
}
