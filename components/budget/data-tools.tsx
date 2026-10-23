import React, { useState } from "react";
import { View, Platform } from "react-native";
import { useBudget } from "@/hooks/budget-store";
import {
  parseCSV,
  guessMapping,
  previewImport,
  csvTransactions,
  csvBudgets,
  csvRecurring,
  type ColumnMapping,
} from "@/lib/csv";
import { downloadCSV, chooseCSV } from "@/lib/file-io";
import {
  C,
  Card,
  Txt,
  Icon,
  SectionHeading,
  Button,
  Dialog,
  Field,
  Chip,
  s,
} from "./ui";
import { Categories } from "./categories";
import { CurrencySettings } from "./currency-settings";
import { formatMoney } from "@/lib/budget";
import { baseCurrency } from "@/lib/currency";

type Preview = ReturnType<typeof previewImport>;
export function DataTools({
  notify,
  importOpen,
  setImportOpen,
}: {
  notify: (v: string) => void;
  importOpen: boolean;
  setImportOpen: (v: boolean) => void;
}) {
  const {
    data,
    demo,
    update,
    leaveDemo,
    viewDemo,
    startFresh,
    recoveryRequired,
  } = useBudget();
  const [source, setSource] = useState(""),
    [fileName, setFileName] = useState(""),
    [headers, setHeaders] = useState<string[]>([]),
    [mapping, setMapping] = useState<ColumnMapping>({
      date: -1,
      type: -1,
      amount: -1,
      category: -1,
      note: -1,
    }),
    [step, setStep] = useState(0),
    [error, setError] = useState(""),
    [preview, setPreview] = useState<Preview | null>(null),
    [reset, setReset] = useState(false);
  function openImport() {
    if (recoveryRequired)
      return notify(
        "Import is paused to protect unreadable saved data. Check storage permissions or explicitly clear the budget.",
      );
    if (demo) leaveDemo();
    setStep(0);
    setSource("");
    setFileName("");
    setPreview(null);
    setError("");
    setImportOpen(true);
  }
  function read(text: string) {
    try {
      if (text.length > 10 * 1024 * 1024)
        throw new Error("Please use a CSV smaller than 10 MB.");
      const rows = parseCSV(text);
      if (rows.length < 2)
        throw new Error("Include a header row and at least one transaction.");
      if (rows[0].length < 4)
        throw new Error(
          "Your CSV needs columns for date, type, amount, and category.",
        );
      setSource(text);
      setHeaders(rows[0]);
      setMapping(guessMapping(rows[0]));
      setError("");
      setStep(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "This file could not be read.");
    }
  }
  async function pick() {
    try {
      const file = await chooseCSV();
      if (file) {
        setFileName(file.name);
        read(file.text);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to open this file.");
    }
  }
  function review() {
    const p = previewImport(source, mapping, data);
    if (p.errors.some((e) => e.row === 1)) {
      setError(p.errors.map((e) => e.message).join(" "));
      return;
    }
    setPreview(p);
    setStep(2);
    setError("");
  }
  function commit() {
    let count = 0;
    update((d) => {
      const p = previewImport(source, mapping, d);
      count = p.transactions.length;
      return {
        ...d,
        categories: [...d.categories, ...p.categories],
        transactions: [...p.transactions, ...d.transactions],
      };
    });
    setImportOpen(false);
    setStep(0);
    setSource("");
    notify(
      `${count} transaction${count === 1 ? "" : "s"} imported. Invalid and duplicate rows were skipped.`,
    );
  }
  async function exportData(kind: "transactions" | "budgets" | "recurring") {
    if (recoveryRequired)
      return notify(
        "Saved data is unreadable. An empty export would not be a valid backup.",
      );
    try {
      await downloadCSV(
        kind === "transactions"
          ? csvTransactions(data)
          : kind === "budgets"
            ? csvBudgets(data)
            : csvRecurring(data),
        `pocketly-${kind}${demo ? "-sample" : ""}.csv`,
      );
      notify(
        `${kind === "transactions" ? "Transactions" : kind === "budgets" ? "Budgets" : "Schedules"} CSV ${Platform.OS === "web" ? "downloaded" : "ready to share"}`,
      );
    } catch {
      notify("Export failed. Please allow downloads and try again.");
    }
  }
  return (
    <View style={{ gap: 20 }}>
      <CurrencySettings key={baseCurrency(data)} notify={notify} />
      <Card>
        <SectionHeading
          title="Your data, your way"
          sub="Move in, back up, or take it with you"
        />
        <View style={{ gap: 14 }}>
          {[
            {
              icon: "cloud-upload-outline",
              title: "Bring your transactions over",
              sub: "Import a CSV. Match the columns, then review before saving.",
              label: "Import CSV",
              onPress: openImport,
            },
            {
              icon: "download-outline",
              title: "Export transactions",
              sub: `${data.transactions.length} entries · All months · Original currency, saved accounting amount, reference rate`,
              label: "Export CSV",
              onPress: () => exportData("transactions"),
            },
            {
              icon: "wallet-outline",
              title: "Export monthly budgets",
              sub: `${data.budgets.length} category budgets · All months · Month, category, budget`,
              label: "Export CSV",
              onPress: () => exportData("budgets"),
            },
            {
              icon: "repeat-outline",
              title: "Export recurring schedules",
              sub: `${(data.recurring || []).length} monthly schedules · Original amount and currency`,
              label: "Export CSV",
              onPress: () => exportData("recurring"),
            },
          ].map((v) => (
            <View
              key={v.title}
              style={{
                flexDirection: "row",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 13,
                padding: 17,
                borderColor: C.line,
                borderWidth: 1,
                borderRadius: 12,
              }}
            >
              <View
                style={{
                  padding: 10,
                  borderRadius: 10,
                  backgroundColor: C.lilac,
                }}
              >
                <Icon name={v.icon} color={C.purple} />
              </View>
              <View style={{ flex: 1, minWidth: 170 }}>
                <Txt style={{ fontSize: 13, fontWeight: "600" }}>{v.title}</Txt>
                <Txt style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>
                  {v.sub}
                </Txt>
              </View>
              <Button small secondary label={v.label} onPress={v.onPress} />
            </View>
          ))}
        </View>
        {demo && (
          <Txt style={{ color: C.muted, fontSize: 11, marginTop: 16 }}>
            You are viewing sample data. Sample exports are marked in the
            filename.
          </Txt>
        )}
      </Card>
      <Categories notify={notify} />
      <Card style={{ backgroundColor: "#F0F5F2", borderColor: "#E5EEE8" }}>
        <SectionHeading
          title="Private by design"
          right={<Icon name="shield-checkmark-outline" color={C.mint} />}
        />
        <Txt style={{ fontSize: 12, color: "#678475" }}>
          Your financial records stay in this browser or in local storage on
          native mobile. No bank connection or cloud financial database. Public
          rate checks send no transactions. Browser receipt OCR runs locally;
          native receipt images are sent only after you tap Scan to the app
          server for temporary OCR, not stored there. Export backups before
          clearing storage or changing devices.
        </Txt>
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 10,
            marginTop: 19,
          }}
        >
          <Button
            small
            secondary
            label={demo ? "Go to my budget" : "Explore sample budget"}
            onPress={() => {
              if (demo) leaveDemo();
              else if (!recoveryRequired) viewDemo();
              else
                return notify(
                  "Check storage access before opening sample mode.",
                );
              notify(
                demo ? "Your personal budget" : "Viewing read-only sample data",
              );
            }}
          />
          {!demo && (
            <Button
              small
              secondary
              label="Clear my budget"
              onPress={() => setReset(true)}
            />
          )}
        </View>
      </Card>
      <Dialog
        visible={importOpen}
        title={
          step === 2
            ? "Ready to bring it over?"
            : step === 1
              ? "Match your columns"
              : "Import transactions"
        }
        subtitle={
          step === 2
            ? "Only valid, non-duplicate rows will be saved."
            : step === 1
              ? `${fileName || "Pasted CSV"} · First row is treated as column headers`
              : "Your CSV stays on this device. Nothing is uploaded."
        }
        wide
        onClose={() => {
          setImportOpen(false);
          setStep(0);
          setError("");
        }}
      >
        {step === 0 && (
          <>
            <Button
              secondary
              label="Choose a CSV file"
              icon="document-text-outline"
              onPress={pick}
              style={{ marginBottom: 18 }}
            />
            <Field
              label="Or paste CSV content"
              value={source}
              onChangeText={setSource}
              multiline
              placeholder={
                "date,type,amount,category,note\n2026-10-10,expense,24.50,Dining,Lunch"
              }
            />
            <Txt style={{ color: C.muted, fontSize: 11, marginBottom: 16 }}>
              Required: date (YYYY-MM-DD), type (income / expense), positive
              amount, and category. Note and currency are optional; omitted
              currency means your home currency. Column names can be mapped in
              the next step.
            </Txt>
            <Button
              label="Match columns"
              disabled={!source.trim()}
              onPress={() => read(source)}
            />
          </>
        )}
        {step === 1 && (
          <>
            {(
              [
                "date",
                "type",
                "amount",
                "category",
                "note",
                "currency",
              ] as const
            ).map((field) => (
              <View key={field} style={{ marginBottom: 18 }}>
                <Txt
                  style={[
                    s.label,
                    { marginBottom: 8, textTransform: "capitalize" },
                  ]}
                >
                  {field}
                  {field === "note" || field === "currency"
                    ? " (optional)"
                    : " *"}
                </Txt>
                <View
                  style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}
                >
                  <Chip
                    label={
                      field === "note"
                        ? "Skip"
                        : field === "currency"
                          ? `Use ${baseCurrency(data)}`
                          : "Not mapped"
                    }
                    active={
                      mapping[field] === -1 || mapping[field] === undefined
                    }
                    onPress={() => setMapping((m) => ({ ...m, [field]: -1 }))}
                  />
                  {headers.map((h, i) => (
                    <Chip
                      key={`${field}-${i}`}
                      label={h || `Column ${i + 1}`}
                      active={mapping[field] === i}
                      onPress={() => setMapping((m) => ({ ...m, [field]: i }))}
                    />
                  ))}
                </View>
              </View>
            ))}
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Button secondary label="Back" onPress={() => setStep(0)} />
              <Button label="Review import" onPress={review} />
            </View>
          </>
        )}
        {step === 2 && preview && (
          <>
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: 10,
                marginBottom: 20,
              }}
            >
              {[
                {
                  n: preview.transactions.length,
                  l: "Ready to import",
                  c: C.mint,
                },
                { n: preview.errors.length, l: "Invalid rows", c: C.red },
                { n: preview.duplicates, l: "Duplicates skipped", c: C.muted },
              ].map((v) => (
                <View
                  key={v.l}
                  style={{
                    flex: 1,
                    minWidth: 100,
                    borderRadius: 10,
                    backgroundColor: C.bg,
                    padding: 15,
                  }}
                >
                  <Txt style={{ fontSize: 25, fontWeight: "600", color: v.c }}>
                    {v.n}
                  </Txt>
                  <Txt style={{ fontSize: 10, color: C.muted }}>{v.l}</Txt>
                </View>
              ))}
            </View>
            <Txt style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>
              {preview.totalRows} data rows checked. {preview.categories.length}{" "}
              new categor{preview.categories.length === 1 ? "y" : "ies"} will be
              created.
            </Txt>
            {preview.transactions.slice(0, 4).map((t) => (
              <View
                key={t.id}
                style={{
                  paddingVertical: 9,
                  borderBottomColor: C.line,
                  borderBottomWidth: 1,
                }}
              >
                <Txt style={{ fontSize: 12 }}>
                  {t.date} · {t.type} ·{" "}
                  {formatMoney(
                    t.originalAmount ?? t.amount,
                    t.currency || baseCurrency(data),
                  )}
                </Txt>
                <Txt style={{ color: C.muted, fontSize: 11 }}>
                  {data.categories.find((c) => c.id === t.categoryId)?.name ||
                    preview.categories.find((c) => c.id === t.categoryId)?.name}
                  {t.note ? ` · ${t.note}` : ""}
                </Txt>
              </View>
            ))}
            {preview.errors.length > 0 && (
              <View
                style={{
                  backgroundColor: C.redLight,
                  borderRadius: 10,
                  padding: 14,
                  marginVertical: 16,
                }}
              >
                {preview.errors.slice(0, 8).map((e) => (
                  <Txt key={e.row} style={{ fontSize: 11, color: C.red }}>
                    Row {e.row}: {e.message}
                  </Txt>
                ))}
                {preview.errors.length > 8 && (
                  <Txt style={{ fontSize: 11, color: C.red }}>
                    …and {preview.errors.length - 8} more invalid rows.
                  </Txt>
                )}
              </View>
            )}
            <Txt style={{ fontSize: 11, color: C.muted, marginVertical: 16 }}>
              Exact duplicates (same date, type, amount, category and note) are
              skipped. Give genuinely separate identical purchases different
              notes before importing.
            </Txt>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Button secondary label="Back" onPress={() => setStep(1)} />
              <Button
                label={`Import ${preview.transactions.length} transactions`}
                disabled={!preview.transactions.length}
                onPress={commit}
              />
            </View>
          </>
        )}
        {!!error && <Txt style={[s.error, { marginTop: 15 }]}>{error}</Txt>}
      </Dialog>
      <Dialog
        visible={reset}
        title="Start with a clean slate?"
        subtitle="This removes your local transactions, budgets, and custom categories."
        onClose={() => setReset(false)}
      >
        <Txt style={{ fontSize: 13, color: C.muted, marginBottom: 22 }}>
          Export your CSV backups first. This action cannot be undone and only
          affects this browser or device.
        </Txt>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Button
            secondary
            label="Keep my data"
            onPress={() => setReset(false)}
          />
          <Button
            label="Clear all data"
            onPress={() => {
              startFresh();
              setReset(false);
              notify("Your budget is now a clean slate");
            }}
            style={{ backgroundColor: C.red }}
          />
        </View>
      </Dialog>
    </View>
  );
}
