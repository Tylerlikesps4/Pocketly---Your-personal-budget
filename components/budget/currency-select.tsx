import React, { useState } from "react";
import { View, Pressable, TextInput } from "react-native";
import { CURRENCIES } from "@/lib/currency";
import { C, Txt, Icon, Dialog, s } from "./ui";
export function CurrencySelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (code: string) => void;
}) {
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState("");
  const rows = CURRENCIES.filter((c) =>
    `${c.code} ${c.name}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <View style={{ marginBottom: 16 }}>
      <Txt style={[s.label, { marginBottom: 7 }]}>{label}</Txt>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value}`}
        onPress={() => {
          setQuery("");
          setOpen(true);
        }}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          minHeight: 46,
          padding: 13,
          borderWidth: 1,
          borderColor: C.line,
          backgroundColor: C.bg,
          borderRadius: 9,
        }}
      >
        <Txt style={{ fontSize: 13 }}>
          {value} ·{" "}
          {CURRENCIES.find((c) => c.code === value)?.name || "Currency"}
        </Txt>
        <Icon name="chevron-down-outline" size={16} />
      </Pressable>
      <Dialog
        visible={open}
        title="Choose a currency"
        subtitle="Official reference-rate currencies"
        onClose={() => setOpen(false)}
      >
        <TextInput
          accessibilityLabel="Search currencies"
          placeholder="Search currency or country"
          value={query}
          onChangeText={setQuery}
          style={[s.input, { marginBottom: 13 }]}
        />
        {rows.map((c) => (
          <Pressable
            key={c.code}
            accessibilityRole="button"
            accessibilityLabel={`${c.code} ${c.name}`}
            onPress={() => {
              onChange(c.code);
              setOpen(false);
            }}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              paddingVertical: 13,
              borderBottomWidth: 1,
              borderBottomColor: C.line,
            }}
          >
            <Txt
              style={{
                color: value === c.code ? C.purple : C.ink,
                fontWeight: "600",
                width: 43,
              }}
            >
              {c.code}
            </Txt>
            <Txt style={{ flex: 1, fontSize: 12, color: C.muted }}>
              {c.name}
            </Txt>
            {value === c.code && (
              <Icon name="checkmark-outline" color={C.purple} size={18} />
            )}
          </Pressable>
        ))}
        {!rows.length && (
          <Txt style={{ color: C.muted, fontSize: 12 }}>
            No supported currencies match.
          </Txt>
        )}
      </Dialog>
    </View>
  );
}
