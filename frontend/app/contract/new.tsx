import React, { useState } from "react";
import { View, Text, StyleSheet, TextInput, Pressable, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { api } from "@/src/api";
import { colors, spacing, radius, font } from "@/src/theme";

export default function NewContract() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [description, setDescription] = useState("");
  const [value, setValue] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [days, setDays] = useState("90");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setErr(null);
    if (!title.trim() || !counterparty.trim() || !value.trim()) {
      setErr("Completa título, contraparte y valor."); return;
    }
    setBusy(true);
    try {
      const start = new Date();
      const end = new Date(); end.setDate(end.getDate() + (parseInt(days || "90", 10) || 90));
      const res = await api.createContract({
        title: title.trim(), counterparty: counterparty.trim(), description,
        total_value: parseFloat(value), currency, start_date: start.toISOString(), end_date: end.toISOString(),
      });
      router.replace(`/contract/${res.contract_id}` as any);
    } catch (e: any) {
      setErr(e?.message || "No se pudo crear");
    } finally { setBusy(false); }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.surface }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} testID="back-button"><Ionicons name="chevron-back" size={26} color={colors.onSurface} /></Pressable>
        <Text style={styles.headerTitle}>Nuevo Contrato</Text>
        <View style={{ width: 26 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 80 }} keyboardShouldPersistTaps="handled">
        <Field label="Título" value={title} onChangeText={setTitle} testID="contract-title-input" placeholder="Ej: Obra Civil Bodegas" />
        <Field label="Contraparte" value={counterparty} onChangeText={setCounterparty} testID="contract-counterparty-input" placeholder="Razón social del proveedor" />
        <Field label="Descripción" value={description} onChangeText={setDescription} multiline testID="contract-desc-input" placeholder="Objeto del contrato" />
        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <Field label="Valor" value={value} onChangeText={setValue} keyboardType="numeric" style={{ flex: 1 }} testID="contract-value-input" placeholder="0.00" />
          <Field label="Moneda" value={currency} onChangeText={setCurrency} style={{ width: 100 }} testID="contract-currency-input" />
        </View>
        <Field label="Duración (días)" value={days} onChangeText={setDays} keyboardType="numeric" testID="contract-days-input" />
        {err ? <Text style={styles.err}>{err}</Text> : null}
        <Pressable style={styles.submit} onPress={submit} disabled={busy} testID="contract-submit-button">
          {busy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.submitText}>Crear Borrador</Text>}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, style, multiline, ...rest }: any) {
  return (
    <View style={[{ marginBottom: spacing.md }, style]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && { height: 80, textAlignVertical: "top" }]}
        placeholderTextColor={colors.onSurfaceSecondary}
        multiline={multiline}
        {...rest}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.divider },
  headerTitle: { fontSize: 14, fontWeight: "700", color: colors.onSurfaceSecondary, letterSpacing: 1 },
  fieldLabel: { fontSize: 11, fontWeight: "700", color: colors.onSurfaceSecondary, letterSpacing: 0.8, marginBottom: 4 },
  input: { backgroundColor: colors.surfaceSecondary, paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, color: colors.onSurface, fontSize: 14, fontFamily: font.mono },
  submit: { backgroundColor: colors.brandPrimary, paddingVertical: 14, borderRadius: radius.md, alignItems: "center", marginTop: spacing.md },
  submitText: { color: "#FFF", fontWeight: "700", fontSize: 15 },
  err: { color: colors.error, fontSize: 12, marginTop: 4, marginBottom: 4 },
});
