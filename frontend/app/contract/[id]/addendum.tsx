import React, { useState } from "react";
import { View, Text, StyleSheet, TextInput, Pressable, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { api } from "@/src/api";
import { colors, spacing, radius, font } from "@/src/theme";

export default function NewAddendum() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [valueDelta, setValueDelta] = useState("0");
  const [daysDelta, setDaysDelta] = useState("0");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!id || !title.trim()) { setErr("Título requerido"); return; }
    setBusy(true); setErr(null);
    try {
      await api.addAddendum(id, {
        title: title.trim(), description,
        value_delta: parseFloat(valueDelta || "0") || 0,
        end_date_delta_days: parseInt(daysDelta || "0", 10) || 0,
      });
      router.back();
    } catch (e: any) {
      setErr(e?.message || "Error");
    } finally { setBusy(false); }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.surface }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} testID="back-button"><Ionicons name="chevron-back" size={26} color={colors.onSurface} /></Pressable>
        <Text style={styles.headerTitle}>Nueva Adenda</Text>
        <View style={{ width: 26 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg }} keyboardShouldPersistTaps="handled">
        <Text style={styles.helper}>Las adendas se vinculan al contrato padre y preservan el histórico (modelo Padre-Hijo).</Text>
        <Label>Título</Label>
        <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Ej: Extensión de plazo Hito 2" placeholderTextColor={colors.onSurfaceSecondary} testID="addendum-title" />
        <Label>Descripción</Label>
        <TextInput style={[styles.input, { height: 80, textAlignVertical: "top" }]} multiline value={description} onChangeText={setDescription} placeholder="Razones, alcance, condiciones" placeholderTextColor={colors.onSurfaceSecondary} testID="addendum-desc" />
        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <View style={{ flex: 1 }}>
            <Label>Δ Valor</Label>
            <TextInput style={styles.input} value={valueDelta} onChangeText={setValueDelta} keyboardType="numbers-and-punctuation" placeholder="+/- 0" placeholderTextColor={colors.onSurfaceSecondary} testID="addendum-value" />
          </View>
          <View style={{ flex: 1 }}>
            <Label>Δ Días</Label>
            <TextInput style={styles.input} value={daysDelta} onChangeText={setDaysDelta} keyboardType="numbers-and-punctuation" placeholder="+/- 0" placeholderTextColor={colors.onSurfaceSecondary} testID="addendum-days" />
          </View>
        </View>
        {err ? <Text style={styles.err}>{err}</Text> : null}
        <Pressable style={styles.submit} onPress={submit} disabled={busy} testID="addendum-submit">
          {busy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.submitText}>Registrar Adenda</Text>}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
function Label({ children }: { children: string }) {
  return <Text style={styles.fieldLabel}>{children}</Text>;
}
const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.divider },
  headerTitle: { fontSize: 14, fontWeight: "700", color: colors.onSurfaceSecondary, letterSpacing: 1 },
  helper: { fontSize: 12, color: colors.onSurfaceSecondary, marginBottom: spacing.md, fontStyle: "italic" },
  fieldLabel: { fontSize: 11, fontWeight: "700", color: colors.onSurfaceSecondary, letterSpacing: 0.8, marginBottom: 4, marginTop: 8 },
  input: { backgroundColor: colors.surfaceSecondary, paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, color: colors.onSurface, fontSize: 14, fontFamily: font.mono },
  submit: { backgroundColor: colors.brandPrimary, paddingVertical: 14, borderRadius: radius.md, alignItems: "center", marginTop: spacing.lg },
  submitText: { color: "#FFF", fontWeight: "700", fontSize: 15 },
  err: { color: colors.error, fontSize: 12, marginTop: spacing.sm },
});
