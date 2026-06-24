import React, { useState } from "react";
import { View, Text, StyleSheet, TextInput, Pressable, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { api } from "@/src/api";
import { useT } from "@/src/i18n";
import { colors, spacing, radius, font } from "@/src/theme";

const CATEGORIES = ["bienes", "obras", "servicios_no_consultoria", "consultor_individual", "firma_consultora", "acuerdo_marco"];

export default function NewContract() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useT();
  const [category, setCategory] = useState<string>("bienes");
  const [title, setTitle] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [description, setDescription] = useState("");
  const [contractNumber, setContractNumber] = useState("");
  const [consultant, setConsultant] = useState("");
  const [product, setProduct] = useState("");
  const [value, setValue] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [days, setDays] = useState("90");
  const [scheduledDate, setScheduledDate] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [payPct, setPayPct] = useState("0");
  const [observations, setObservations] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function parseDate(s: string): Date | null {
    if (!s) return null;
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

  async function submit() {
    setErr(null);
    if (!title.trim() || !counterparty.trim() || !value.trim()) {
      setErr(t("newc.err.required")); return;
    }
    setBusy(true);
    try {
      const start = new Date();
      const end = new Date(); end.setDate(end.getDate() + (parseInt(days || "90", 10) || 90));
      const sched = parseDate(scheduledDate) || start;
      const deliv = parseDate(deliveryDate) || end;
      const res = await api.createContract({
        title: title.trim(), counterparty: counterparty.trim(), description,
        total_value: parseFloat(value) || 0, currency,
        start_date: start.toISOString(), end_date: end.toISOString(),
        category, contract_number: contractNumber || undefined,
        consultant: consultant || undefined, product: product || undefined,
        scheduled_date: sched.toISOString(), delivery_date: deliv.toISOString(),
        pay_pct: parseFloat(payPct) || 0, observations,
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
        <Text style={styles.headerTitle}>{t("newc.title")}</Text>
        <View style={{ width: 26 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>{t("newc.category")}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 4 }} style={{ flexGrow: 0, marginBottom: spacing.md }}>
          {CATEGORIES.map((c) => {
            const active = category === c;
            return (
              <Pressable key={c} onPress={() => setCategory(c)} style={[styles.catChip, active && styles.catChipActive]} testID={`category-${c}`}>
                <Text style={[styles.catChipText, active && styles.catChipTextActive]}>{t(`cat.${c}`)}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <Field label={t("newc.field.number")} value={contractNumber} onChangeText={setContractNumber} testID="contract-number" placeholder="CON-2026-0001" />
        <Field label={t("newc.field.title")} value={title} onChangeText={setTitle} testID="contract-title-input" />
        <Field label={t("newc.field.counterparty")} value={counterparty} onChangeText={setCounterparty} testID="contract-counterparty-input" />
        <Field label={t("newc.field.consultant")} value={consultant} onChangeText={setConsultant} testID="contract-consultant" />
        <Field label={t("newc.field.product")} value={product} onChangeText={setProduct} testID="contract-product" />
        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <Field label={t("newc.field.value")} value={value} onChangeText={setValue} keyboardType="numeric" style={{ flex: 1 }} testID="contract-value-input" />
          <Field label={t("newc.field.currency")} value={currency} onChangeText={setCurrency} style={{ width: 100 }} testID="contract-currency-input" />
        </View>
        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <Field label={t("newc.field.days")} value={days} onChangeText={setDays} keyboardType="numeric" style={{ flex: 1 }} testID="contract-days-input" />
          <Field label={t("newc.field.payPct")} value={payPct} onChangeText={setPayPct} keyboardType="numeric" style={{ flex: 1 }} testID="contract-pay-input" />
        </View>
        <Field label={t("newc.field.scheduled")} value={scheduledDate} onChangeText={setScheduledDate} testID="contract-scheduled" placeholder="2026-03-15" />
        <Field label={t("newc.field.delivery")} value={deliveryDate} onChangeText={setDeliveryDate} testID="contract-delivery" placeholder="2026-09-15" />
        <Field label={t("newc.field.description")} value={description} onChangeText={setDescription} multiline testID="contract-desc-input" />
        <Field label={t("newc.field.observations")} value={observations} onChangeText={setObservations} multiline testID="contract-obs-input" />

        {err ? <Text style={styles.err}>{err}</Text> : null}
        <Pressable style={styles.submit} onPress={submit} disabled={busy} testID="contract-submit-button">
          {busy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.submitText}>{t("newc.submit")}</Text>}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, style, multiline, ...rest }: any) {
  return (
    <View style={[{ marginBottom: spacing.md }, style]}>
      <Text style={styles.label}>{label}</Text>
      <TextInput style={[styles.input, multiline && { height: 70, textAlignVertical: "top" }]} placeholderTextColor={colors.onSurfaceSecondary} multiline={multiline} {...rest} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.divider },
  headerTitle: { fontSize: 14, fontWeight: "700", color: colors.onSurfaceSecondary, letterSpacing: 1 },
  label: { fontSize: 11, fontWeight: "700", color: colors.onSurfaceSecondary, letterSpacing: 0.8, marginBottom: 4 },
  input: { backgroundColor: colors.surfaceSecondary, paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, color: colors.onSurface, fontSize: 14, fontFamily: font.mono },
  catChip: { flexShrink: 0, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  catChipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  catChipText: { fontSize: 11, fontWeight: "700", color: colors.onSurfaceSecondary },
  catChipTextActive: { color: "#FFF" },
  submit: { backgroundColor: colors.brandPrimary, paddingVertical: 14, borderRadius: radius.md, alignItems: "center", marginTop: spacing.md },
  submitText: { color: "#FFF", fontWeight: "700", fontSize: 15 },
  err: { color: colors.error, fontSize: 12, marginTop: 4 },
});
