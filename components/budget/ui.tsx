import React from "react";
import {
  Pressable,
  View,
  Text,
  TextInput,
  StyleSheet,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

export const C = {
  bg: "#F8F9FC",
  card: "#FFFFFF",
  ink: "#262633",
  muted: "#858594",
  line: "#EBEBF2",
  purple: "#7661C5",
  purpleDark: "#5E49A4",
  lilac: "#EEE9FB",
  mint: "#4E9C85",
  mintLight: "#EAF5F0",
  red: "#C66A6A",
  redLight: "#FBEEEE",
  amber: "#B88940",
};
export function Icon({
  name,
  size = 20,
  color = C.muted,
}: {
  name: string;
  size?: number;
  color?: string;
}) {
  return <Ionicons name={name as any} size={size} color={color} />;
}
export function Txt({
  children,
  style,
  ...props
}: React.ComponentProps<typeof Text>) {
  return (
    <Text
      {...props}
      style={[
        {
          color: C.ink,
          fontSize: 14,
          lineHeight: 21,
          fontFamily: Platform.OS === "web" ? "system-ui" : undefined,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}
export function Button({
  label,
  icon,
  onPress,
  secondary = false,
  small = false,
  disabled = false,
  style,
}: {
  label: string;
  icon?: string;
  onPress: () => void;
  secondary?: boolean;
  small?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          paddingHorizontal: small ? 14 : 20,
          minHeight: small ? 38 : 46,
          borderRadius: 10,
          backgroundColor: secondary ? C.card : C.purple,
          borderWidth: secondary ? 1 : 0,
          borderColor: C.line,
          opacity: disabled ? 0.4 : pressed ? 0.75 : 1,
        },
        style,
      ]}
    >
      {icon && (
        <Icon name={icon} size={17} color={secondary ? C.ink : "#fff"} />
      )}
      <Txt
        style={{
          fontSize: small ? 12 : 13,
          fontWeight: "600",
          color: secondary ? C.ink : "#fff",
        }}
      >
        {label}
      </Txt>
    </Pressable>
  );
}
export function IconButton({
  icon,
  onPress,
  label,
  color = C.muted,
}: {
  icon: string;
  onPress: () => void;
  label: string;
  color?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 36,
        height: 36,
        borderRadius: 8,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: pressed ? C.lilac : "transparent",
      })}
    >
      <Icon name={icon} color={color} size={18} />
    </Pressable>
  );
}
export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  return <View style={[s.card, style]}>{children}</View>;
}
export function SectionHeading({
  title,
  sub,
  right,
}: {
  title: string;
  sub?: string;
  right?: React.ReactNode;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 20,
        gap: 12,
      }}
    >
      <View style={{ flex: 1 }}>
        <Txt style={{ fontSize: 16, fontWeight: "600" }}>{title}</Txt>
        {sub && (
          <Txt style={{ color: C.muted, fontSize: 12, marginTop: 3 }}>
            {sub}
          </Txt>
        )}
      </View>
      {right}
    </View>
  );
}
export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  numeric,
  multiline = false,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  numeric?: boolean;
  multiline?: boolean;
}) {
  return (
    <View style={{ gap: 7, marginBottom: 16 }}>
      <Txt style={s.label}>{label}</Txt>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#A5A4AF"
        keyboardType={numeric ? "decimal-pad" : "default"}
        multiline={multiline}
        style={[
          s.input,
          multiline && { height: 100, textAlignVertical: "top" },
        ]}
      />
    </View>
  );
}
export function Chip({
  label,
  active,
  onPress,
  color,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  color?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      onPress={onPress}
      style={{
        paddingHorizontal: 13,
        paddingVertical: 8,
        borderRadius: 8,
        backgroundColor: active ? C.lilac : C.bg,
        borderWidth: 1,
        borderColor: active ? "#D9CFF0" : C.line,
      }}
    >
      <Txt
        style={{
          fontSize: 12,
          fontWeight: active ? "600" : "400",
          color: color || (active ? C.purpleDark : C.muted),
        }}
      >
        {label}
      </Txt>
    </Pressable>
  );
}
export function Dialog({
  visible,
  title,
  subtitle,
  onClose,
  children,
  wide = false,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <View style={s.overlay}>
          <Pressable
            onPress={onClose}
            accessibilityLabel="Close dialog"
            style={StyleSheet.absoluteFill}
          />
          <View style={[s.dialog, { maxWidth: wide ? 680 : 480 }]}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "flex-start",
                justifyContent: "space-between",
                marginBottom: 20,
              }}
            >
              <View style={{ flex: 1 }}>
                <Txt
                  style={{ fontSize: 21, fontWeight: "700", lineHeight: 29 }}
                >
                  {title}
                </Txt>
                {subtitle && (
                  <Txt style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
                    {subtitle}
                  </Txt>
                )}
              </View>
              <IconButton
                label="Close"
                icon="close-outline"
                onPress={onClose}
              />
            </View>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {children}
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
export function Empty({
  icon = "leaf-outline",
  title,
  detail,
  action,
}: {
  icon?: string;
  title: string;
  detail: string;
  action?: React.ReactNode;
}) {
  return (
    <View
      style={{
        alignItems: "center",
        paddingVertical: 35,
        paddingHorizontal: 20,
        gap: 10,
      }}
    >
      <View style={{ backgroundColor: C.lilac, padding: 15, borderRadius: 18 }}>
        <Icon name={icon} size={25} color={C.purple} />
      </View>
      <Txt style={{ fontWeight: "600", fontSize: 15 }}>{title}</Txt>
      <Txt
        style={{
          color: C.muted,
          textAlign: "center",
          maxWidth: 300,
          fontSize: 12,
        }}
      >
        {detail}
      </Txt>
      {action}
    </View>
  );
}
export const s = StyleSheet.create({
  card: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 16,
    padding: 24,
  },
  label: { fontSize: 12, fontWeight: "600", color: "#666575" },
  input: {
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 9,
    padding: 13,
    fontSize: 14,
    color: C.ink,
    minHeight: 46,
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(26,22,42,0.35)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  dialog: {
    backgroundColor: "#fff",
    width: "100%",
    maxHeight: "90%",
    borderRadius: 20,
    padding: 26,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  error: { color: C.red, fontSize: 12, marginBottom: 14 },
  divider: { height: 1, backgroundColor: C.line, marginVertical: 20 },
});
