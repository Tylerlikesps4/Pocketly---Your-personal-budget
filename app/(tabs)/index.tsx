import React, { useEffect, useRef, useState } from "react";
import {
  View,
  ScrollView,
  Pressable,
  useWindowDimensions,
  Image,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBudget } from "@/hooks/budget-store";
import {
  formatMonth,
  shiftMonth,
  monthKey,
  type Transaction,
} from "@/lib/budget";
import { C, Txt, Icon, Button, IconButton } from "@/components/budget/ui";
import { Dashboard } from "@/components/budget/dashboard";
import { Transactions } from "@/components/budget/transactions";
import { Budgets } from "@/components/budget/budgets";
import { DataTools } from "@/components/budget/data-tools";
import { TransactionForm } from "@/components/budget/transaction-form";
import { Recurring } from "@/components/budget/recurring";
import { ReceiptScanner } from "@/components/budget/receipt-scanner";
import type { ReceiptDraft } from "@/lib/receipt";
import { baseCurrency } from "@/lib/currency";

type Page = "overview" | "transactions" | "budgets" | "recurring" | "data";
const nav: { id: Page; label: string; icon: string }[] = [
  { id: "overview", label: "Overview", icon: "grid-outline" },
  {
    id: "transactions",
    label: "Transactions",
    icon: "swap-horizontal-outline",
  },
  { id: "budgets", label: "Budgets", icon: "wallet-outline" },
  { id: "recurring", label: "Recurring", icon: "repeat-outline" },
  { id: "data", label: "Data & settings", icon: "options-outline" },
];
const headings: Record<Page, { title: string; sub: string }> = {
  overview: {
    title: "Your money, in the clear.",
    sub: "A little clarity. A lot more control.",
  },
  transactions: {
    title: "The little things add up.",
    sub: "Every payday, grocery run, and well-earned coffee.",
  },
  budgets: {
    title: "A plan for every pocket.",
    sub: "Set your limits. Find your breathing room.",
  },
  recurring: {
    title: "Put the regular things on repeat.",
    sub: "Monthly bills and payday, without the busywork.",
  },
  data: {
    title: "Make it your own.",
    sub: "Your categories, your data, your rules.",
  },
};
export default function HomeScreen() {
  const { width } = useWindowDimensions(),
    insets = useSafeAreaInsets();
  const desktop = width >= 900;
  const {
    ready,
    data,
    recurringWarning,
    demo,
    error,
    recoveryRequired,
    month,
    setMonth,
    update,
    leaveDemo,
  } = useBudget();
  const [page, setPage] = useState<Page>("overview"),
    [formOpen, setFormOpen] = useState(false),
    [editing, setEditing] = useState<Transaction | undefined>(),
    [importOpen, setImportOpen] = useState(false),
    [toast, setToast] = useState("");
  const [receiptOpen, setReceiptOpen] = useState(false),
    [receiptDraft, setReceiptDraft] = useState<ReceiptDraft | undefined>();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    scroll = useRef<ScrollView>(null);
  function notify(message: string) {
    setToast(message);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(""), 4500);
  }
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  function navigate(p: Page) {
    setPage(p);
    scroll.current?.scrollTo({ y: 0, animated: false });
  }
  function add() {
    if (recoveryRequired)
      return notify(
        "Edits are paused to protect unreadable saved data. See Data & settings.",
      );
    if (demo) leaveDemo();
    setEditing(undefined);
    setReceiptDraft(undefined);
    setFormOpen(true);
  }
  function openReceipt() {
    if (recoveryRequired)
      return notify("Edits are paused to protect unreadable saved data.");
    if (demo) leaveDemo();
    setFormOpen(false);
    setReceiptDraft(undefined);
    setReceiptOpen(true);
  }
  function openImport() {
    if (recoveryRequired)
      return notify(
        "Import is paused to protect unreadable saved data. See Data & settings.",
      );
    if (demo) leaveDemo();
    navigate("data");
    setImportOpen(true);
  }
  const logo = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
      <Image
        source={require("@/assets/images/favicon.png")}
        style={{ width: 36, height: 36, borderRadius: 10 }}
      />
      <Txt style={{ fontSize: 23, fontWeight: "700", letterSpacing: -1 }}>
        pocketly<Txt style={{ fontSize: 23, color: C.purple }}>.</Txt>
      </Txt>
    </View>
  );
  const monthControl = (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#fff",
        borderRadius: 10,
        borderWidth: 1,
        borderColor: C.line,
        paddingHorizontal: 3,
      }}
    >
      <IconButton
        label="Previous month"
        icon="chevron-back-outline"
        onPress={() => setMonth(shiftMonth(month, -1))}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Return to current month"
        onPress={() => setMonth(monthKey())}
        style={{ paddingHorizontal: 7 }}
      >
        <View style={{ flexDirection: "row", gap: 7, alignItems: "center" }}>
          <Icon name="calendar-outline" size={14} />
          <Txt style={{ fontSize: 12, fontWeight: "500" }}>
            {formatMonth(month, true)}
          </Txt>
        </View>
      </Pressable>
      <IconButton
        label="Next month"
        icon="chevron-forward-outline"
        onPress={() => setMonth(shiftMonth(month, 1))}
      />
    </View>
  );
  if (!ready)
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: C.bg,
          alignItems: "center",
          justifyContent: "center",
          gap: 15,
        }}
      >
        <ActivityIndicator color={C.purple} />
        <Txt style={{ color: C.muted }}>Opening your pocket…</Txt>
      </View>
    );
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: C.bg,
        flexDirection: "row",
        paddingTop: Platform.OS === "web" ? 0 : insets.top,
      }}
    >
      {desktop && (
        <View
          style={{
            width: 219,
            backgroundColor: "#fff",
            borderRightWidth: 1,
            borderRightColor: C.line,
            paddingHorizontal: 22,
            paddingTop: 30,
            paddingBottom: 23,
          }}
        >
          {logo}
          <Txt
            style={{
              fontSize: 9,
              color: C.muted,
              letterSpacing: 1.6,
              marginTop: 45,
              marginBottom: 14,
              paddingLeft: 12,
            }}
          >
            YOUR PERSONAL SPACE
          </Txt>
          <View style={{ gap: 6 }}>
            {nav.map((n) => (
              <Pressable
                key={n.id}
                accessibilityRole="button"
                accessibilityState={{ selected: page === n.id }}
                onPress={() => navigate(n.id)}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  paddingVertical: 13,
                  paddingHorizontal: 13,
                  borderRadius: 9,
                  backgroundColor:
                    page === n.id ? C.lilac : pressed ? C.bg : "transparent",
                })}
              >
                <Icon
                  name={n.icon}
                  size={18}
                  color={page === n.id ? C.purple : C.muted}
                />
                <Txt
                  style={{
                    fontSize: 12,
                    fontWeight: page === n.id ? "600" : "400",
                    color: page === n.id ? C.purpleDark : C.muted,
                  }}
                >
                  {n.label}
                </Txt>
              </Pressable>
            ))}
          </View>
          <View style={{ flex: 1 }} />
          <View
            style={{
              backgroundColor: "#F8F7FC",
              borderRadius: 13,
              padding: 16,
              gap: 8,
            }}
          >
            <View
              style={{
                backgroundColor: C.lilac,
                borderRadius: 9,
                width: 32,
                height: 32,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon
                name="shield-checkmark-outline"
                size={18}
                color={C.purple}
              />
            </View>
            <Txt style={{ fontSize: 12, fontWeight: "600" }}>
              Just between you & you.
            </Txt>
            <Txt style={{ fontSize: 10, lineHeight: 17, color: C.muted }}>
              Your records live on this device. No bank connection. Receipt
              scans are reviewed before saving.
            </Txt>
            <Pressable
              onPress={() => navigate("data")}
              accessibilityRole="button"
            >
              <Txt
                style={{
                  fontSize: 10,
                  color: C.purple,
                  fontWeight: "600",
                  marginTop: 4,
                }}
              >
                Back up your data →
              </Txt>
            </Pressable>
          </View>
          <Txt
            style={{
              color: "#B2AFBD",
              fontSize: 9,
              marginTop: 20,
              textAlign: "center",
            }}
          >
            A little less money stress.
          </Txt>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <View
          style={{
            height: desktop ? 80 : 68,
            backgroundColor: "#fff",
            borderBottomColor: C.line,
            borderBottomWidth: 1,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: desktop ? 38 : 20,
          }}
        >
          {desktop ? (
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            >
              <Txt style={{ color: C.muted, fontSize: 11 }}>My budget</Txt>
              <Icon name="chevron-forward-outline" size={12} />
              <Txt style={{ fontSize: 11 }}>
                {nav.find((n) => n.id === page)?.label}
              </Txt>
            </View>
          ) : (
            logo
          )}
          <View style={{ flexDirection: "row", gap: 11, alignItems: "center" }}>
            <View
              style={{
                flexDirection: "row",
                gap: 5,
                alignItems: "center",
                borderWidth: 1,
                borderColor: C.line,
                borderRadius: 20,
                paddingVertical: 6,
                paddingHorizontal: 10,
              }}
            >
              <View
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: 4,
                  backgroundColor: C.mint,
                }}
              />
              <Txt style={{ fontSize: 9, color: C.muted }}>
                Local records · {baseCurrency(data)}
              </Txt>
            </View>
            {desktop && (
              <View
                style={{
                  width: 33,
                  height: 33,
                  backgroundColor: C.lilac,
                  borderRadius: 18,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon name="person-outline" size={16} color={C.purple} />
              </View>
            )}
          </View>
        </View>
        <ScrollView
          ref={scroll}
          contentContainerStyle={{
            padding: desktop ? 35 : 20,
            paddingBottom: desktop ? 30 : 110,
            width: "100%",
            maxWidth: 1440,
            alignSelf: "center",
          }}
          showsVerticalScrollIndicator={false}
        >
          <View
            style={{
              flexDirection: desktop ? "row" : "column",
              justifyContent: "space-between",
              gap: 19,
              marginBottom: 24,
              alignItems: desktop ? "center" : "flex-start",
            }}
          >
            <View>
              <Txt
                style={{
                  fontSize: desktop ? 27 : 25,
                  fontWeight: "600",
                  lineHeight: 36,
                  letterSpacing: -0.9,
                }}
              >
                {headings[page].title}
              </Txt>
              <Txt style={{ color: C.muted, fontSize: 12, marginTop: 5 }}>
                {headings[page].sub}
              </Txt>
            </View>
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: 10,
                alignItems: "center",
              }}
            >
              {page !== "data" && page !== "recurring" && monthControl}
              <Button
                small
                secondary
                label="Scan receipt"
                icon="scan-outline"
                onPress={openReceipt}
              />
              {desktop && (
                <Button
                  label="Add transaction"
                  icon="add-outline"
                  onPress={add}
                />
              )}
            </View>
          </View>
          {demo && (
            <View
              style={{
                backgroundColor: "#F1EDF9",
                borderRadius: 10,
                borderWidth: 1,
                borderColor: "#E7E0F3",
                flexDirection: "row",
                flexWrap: "wrap",
                gap: 10,
                alignItems: "center",
                paddingVertical: 11,
                paddingHorizontal: 15,
                marginBottom: 22,
              }}
            >
              <Icon name="flask-outline" color={C.purple} size={16} />
              <View style={{ flex: 1, minWidth: 170 }}>
                <Txt style={{ fontSize: 11, color: "#80708E" }}>
                  <Txt
                    style={{
                      color: C.purpleDark,
                      fontSize: 11,
                      fontWeight: "600",
                    }}
                  >
                    A peek at what’s possible.
                  </Txt>{" "}
                  You’re viewing a sample budget.
                </Txt>
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  update((d) => d);
                  notify("Your personal budget is ready");
                }}
              >
                <Txt
                  style={{ fontSize: 11, color: C.purple, fontWeight: "600" }}
                >
                  Go to my budget →
                </Txt>
              </Pressable>
            </View>
          )}
          {!!error && (
            <View
              style={{
                backgroundColor: C.redLight,
                borderRadius: 10,
                padding: 15,
                marginBottom: 20,
              }}
            >
              <Txt style={{ color: C.red, fontSize: 12 }}>{error}</Txt>
            </View>
          )}
          {!!recurringWarning && (
            <View
              style={{
                backgroundColor: "#FAF0E6",
                padding: 13,
                borderRadius: 10,
                marginBottom: 20,
              }}
            >
              <Txt style={{ color: C.amber, fontSize: 11 }}>
                {recurringWarning}
              </Txt>
            </View>
          )}
          {page === "overview" && (
            <Dashboard
              onTransactions={() => navigate("transactions")}
              onBudgets={() => navigate("budgets")}
              onAdd={add}
            />
          )}
          {page === "transactions" && (
            <Transactions
              onAdd={add}
              onEdit={(t) => {
                setReceiptDraft(undefined);
                setEditing(t);
                setFormOpen(true);
              }}
              onImport={openImport}
            />
          )}
          {page === "budgets" && <Budgets notify={notify} />}
          {page === "recurring" && <Recurring notify={notify} />}
          {page === "data" && (
            <DataTools
              notify={notify}
              importOpen={importOpen}
              setImportOpen={setImportOpen}
            />
          )}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 5,
              marginTop: 27,
            }}
          >
            <Icon name="lock-closed-outline" size={10} />
            <Txt style={{ color: "#AAA8B4", fontSize: 9 }}>
              Stored on this device. A little peace of mind.
            </Txt>
          </View>
        </ScrollView>
        {!desktop && (
          <View
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              backgroundColor: "#fff",
              borderTopWidth: 1,
              borderTopColor: C.line,
              paddingTop: 10,
              paddingBottom: Math.max(insets.bottom, 12),
              flexDirection: "row",
              alignItems: "center",
            }}
          >
            {[nav[0], nav[1], null, nav[2], nav[3], nav[4]].map((n) =>
              n ? (
                <Pressable
                  key={n.id}
                  accessibilityRole="button"
                  accessibilityLabel={n.label}
                  accessibilityState={{ selected: page === n.id }}
                  onPress={() => navigate(n.id)}
                  style={{
                    flex: 1,
                    alignItems: "center",
                    gap: 4,
                    paddingVertical: 4,
                  }}
                >
                  <Icon
                    name={n.icon}
                    size={21}
                    color={page === n.id ? C.purple : "#AAA5B5"}
                  />
                  <Txt
                    style={{
                      color: page === n.id ? C.purple : "#AAA5B5",
                      fontSize: 8,
                      fontWeight: page === n.id ? "600" : "400",
                    }}
                  >
                    {n.id === "data" ? "Settings" : n.label}
                  </Txt>
                </Pressable>
              ) : (
                <View key="add" style={{ flex: 1, alignItems: "center" }}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Add transaction"
                    onPress={add}
                    style={({ pressed }) => ({
                      width: 47,
                      height: 47,
                      backgroundColor: C.purple,
                      borderRadius: 15,
                      justifyContent: "center",
                      alignItems: "center",
                      opacity: pressed ? 0.8 : 1,
                    })}
                  >
                    <Icon name="add-outline" size={27} color="#fff" />
                  </Pressable>
                </View>
              ),
            )}
          </View>
        )}
        {!!toast && (
          <View
            pointerEvents="none"
            accessibilityLiveRegion="polite"
            style={{
              position: "absolute",
              bottom: desktop ? 25 : 100,
              left: 22,
              right: 22,
              alignItems: "center",
            }}
          >
            <View
              style={{
                backgroundColor: "#383143",
                borderRadius: 10,
                paddingHorizontal: 20,
                paddingVertical: 12,
                maxWidth: 600,
              }}
            >
              <Txt style={{ color: "#fff", fontSize: 12 }}>{toast}</Txt>
            </View>
          </View>
        )}
      </View>
      {receiptOpen && (
        <ReceiptScanner
          open={receiptOpen}
          onClose={() => setReceiptOpen(false)}
          onReview={(draft) => {
            setReceiptOpen(false);
            setReceiptDraft(draft);
            setEditing(undefined);
            setFormOpen(true);
          }}
        />
      )}
      {formOpen && (
        <TransactionForm
          open={formOpen}
          transaction={editing}
          draft={receiptDraft}
          onScan={openReceipt}
          onClose={() => setFormOpen(false)}
          onSaved={notify}
        />
      )}
    </View>
  );
}
