import React, { useState } from "react";
import { View } from "react-native";
import { useBudget } from "@/hooks/budget-store";
import { uniqueId, type Category, type TransactionType } from "@/lib/budget";
import {
  C,
  Card,
  SectionHeading,
  Button,
  Dialog,
  Field,
  Txt,
  Chip,
  IconButton,
  Icon,
  s,
} from "./ui";
const colors = [
  "#8A76CB",
  "#E4A47F",
  "#75AFA0",
  "#DB91A7",
  "#8DA4CB",
  "#CCB879",
  "#A3B582",
];
const icons = [
  "bag-outline",
  "restaurant-outline",
  "home-outline",
  "car-outline",
  "heart-outline",
  "film-outline",
  "wallet-outline",
];
export function Categories({ notify }: { notify: (v: string) => void }) {
  const { data, demo, update, recoveryRequired } = useBudget();
  const [open, setOpen] = useState(false),
    [editing, setEditing] = useState<Category | null>(null),
    [name, setName] = useState(""),
    [type, setType] = useState<TransactionType>("expense"),
    [color, setColor] = useState(colors[0]),
    [error, setError] = useState(""),
    [deleteConfirm, setDeleteConfirm] = useState(false);
  function show(c?: Category) {
    if (recoveryRequired)
      return notify(
        "Edits are paused to protect unreadable saved data. See Data & settings.",
      );
    if (demo) return notify("Go to your personal budget to manage categories.");
    setEditing(c || null);
    setName(c?.name || "");
    setType(c?.type || "expense");
    setColor(c?.color || colors[0]);
    setError("");
    setDeleteConfirm(false);
    setOpen(true);
  }
  function save() {
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 40)
      return setError("Use a category name between 1 and 40 characters.");
    if (
      data.categories.some(
        (c) =>
          c.type === type &&
          c.name.toLowerCase() === trimmed.toLowerCase() &&
          c.id !== editing?.id,
      )
    )
      return setError("A category with that name already exists.");
    const category: Category = {
      id: editing?.id || uniqueId(),
      name: trimmed,
      type,
      color,
      icon: editing?.icon || icons[colors.indexOf(color)] || "bag-outline",
    };
    update((d) => ({
      ...d,
      categories: editing
        ? d.categories.map((c) => (c.id === editing.id ? category : c))
        : [...d.categories, category],
    }));
    setOpen(false);
    notify("Category saved");
  }
  function remove() {
    if (!editing) return;
    if (
      data.transactions.some((t) => t.categoryId === editing.id) ||
      data.budgets.some((b) => b.categoryId === editing.id) ||
      (data.recurring || []).some((r) => r.categoryId === editing.id)
    )
      return setError(
        "This category is used by transactions, budgets, or recurring schedules. Move or delete those entries before removing it.",
      );
    if (!deleteConfirm) {
      setDeleteConfirm(true);
      return;
    }
    update((d) => ({
      ...d,
      categories: d.categories.filter((c) => c.id !== editing.id),
    }));
    setOpen(false);
    notify("Category deleted");
  }
  return (
    <>
      <Card>
        <SectionHeading
          title="Your categories"
          sub="A place for every kind of income and expense"
          right={
            <Button
              small
              secondary
              label="New category"
              icon="add-outline"
              onPress={() => show()}
            />
          }
        />
        {(["expense", "income"] as const).map((t) => (
          <View key={t} style={{ marginBottom: 12 }}>
            <Txt
              style={{
                fontSize: 10,
                color: C.muted,
                fontWeight: "600",
                textTransform: "uppercase",
                marginVertical: 10,
              }}
            >
              {t === "expense" ? "Expenses" : "Income"}
            </Txt>
            {data.categories
              .filter((c) => c.type === t)
              .map((c) => (
                <View
                  key={c.id}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    paddingVertical: 10,
                    borderBottomColor: C.line,
                    borderBottomWidth: 1,
                  }}
                >
                  <View
                    style={{
                      width: 31,
                      height: 31,
                      backgroundColor: c.color + "18",
                      borderRadius: 9,
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    <Icon name={c.icon} color={c.color} size={17} />
                  </View>
                  <Txt style={{ flex: 1, fontSize: 12 }}>{c.name}</Txt>
                  <IconButton
                    label={`Edit ${c.name}`}
                    icon="create-outline"
                    onPress={() => show(c)}
                  />
                </View>
              ))}
          </View>
        ))}
      </Card>
      <Dialog
        visible={open}
        title={editing ? "Edit category" : "A new category"}
        subtitle="Make your budget feel like you."
        onClose={() => setOpen(false)}
      >
        <Field
          label="Category name"
          value={name}
          onChangeText={setName}
          placeholder="e.g. Pets or Side projects"
        />
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 18 }}>
          {(["expense", "income"] as const).map((t) => (
            <Chip
              key={t}
              label={t === "expense" ? "Expense" : "Income"}
              active={type === t}
              onPress={() => {
                if (!editing) setType(t);
              }}
            />
          ))}
        </View>
        {editing && (
          <Txt style={{ color: C.muted, fontSize: 11, marginBottom: 16 }}>
            Category type is fixed to keep your existing entries consistent.
          </Txt>
        )}
        <Txt style={[s.label, { marginBottom: 10 }]}>Category color</Txt>
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 8,
            marginBottom: 22,
          }}
        >
          {colors.map((c) => (
            <IconButton
              key={c}
              label={`Select ${c} color`}
              icon={color === c ? "checkmark-circle" : "ellipse"}
              color={c}
              onPress={() => setColor(c)}
            />
          ))}
        </View>
        {!!error && <Txt style={s.error}>{error}</Txt>}
        {deleteConfirm && (
          <Txt style={{ color: C.red, fontSize: 12, marginBottom: 12 }}>
            Delete this unused category? This cannot be undone.
          </Txt>
        )}
        <Button label="Save category" onPress={save} />
        {editing && (
          <Button
            secondary
            label={deleteConfirm ? "Confirm deletion" : "Delete category"}
            onPress={remove}
            style={{ marginTop: 10 }}
          />
        )}
      </Dialog>
    </>
  );
}
