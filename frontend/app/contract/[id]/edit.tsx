import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TextInput, Pressable, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { api } from "@/src/api";
import { useT } from "@/src/i18n";
import { colors, spacing, radius, font } from "@/src/theme";

const CATEGORIES = ["bienes", "obras", "servicios_no_consultoria", "consultor_individual", "firma_consultora", "acuerdo_marco"];
const CURRENCIES = ["USD", "HNL", "EUR", "GTQ", "MXN", "COP", "CLP", "PEN"];
const PAY_TYPES = ["anticipo", "hito", "adenda", "contra_entrega", "final"];

function toDateStr(v: any): string {
  if (!v) return "";
  try { return new Date(v).toISOString().slice(0, 10); } catch { return ""; }
}

export default function EditContract() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useT();

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [category, setCategory] = useState<string>("bienes");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [contractNumber, setContractNumber] = useState("");
  const [provider, setProvider] = useState("");
  const [product, setProduct] = useState("");
  const [value, setValue] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [signedDate, setSignedDate] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [payPct, setPayPct] = useState("0");
  const [breakdown, setBreakdown] = useState<{ type: string; pct: string; note: string }[]>([]);
  const [observations, setObservations] = useState("");

  useEffect(() => {
    (async () => {
      if (!id) return;
      try {
        const d = await api.getContract(id as string);
        setCategory(d.category || "bienes");
        setTitle(d.title || "");
        setDescription(d.description || "");
        setContractNumber(d.contract_number || "");
        setProvider(d.provider || d.consultant || "");
        setProduct(d.product || "");
        setValue(d.total_value != null ? String(d.total_value) : "");
        setCurrency(d.currency || "USD");
        setSignedDate(toDateStr(d.signed_date));
        setScheduledDate(toDateStr(d.scheduled_date));
        setDeliveryDate(toDateStr(d.delivery_date || d.end_date));
        setPayPct(String(d.pay_pct ?? 0));
        setBreakdown(Array.isArray(d.payment_breakdown) ? d.payment_breakdown.map((b: any) => ({
          type: PAY_TYPES.includes(b.type) ? b.type : "hito",
          pct: String(b.pct ?? 0), note: String(b.note || ""),
        })) : []);
        setObservations(d.observations || "");
      } catch (e: any) {
        setErr(e?.message || "No se pudo cargar el contrato");
      } finally { setLoading(false); }
    })();
  }, [id]);

  function parseDateStr(s: string): Date | null {
    if (!s) return null;
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

  function addBreakdown() { setBreakdown([...breakdown, { type: "anticipo", pct: "0", note: "" }]); }
  function updateBreakdown(i: number, patch: Partial<{ type: string; pct: string; note: string }>) {
    setBreakdown(breakdown.map((b, idx) => idx === i ? { ...b, ...patch } : b));
  }
  function removeBreakdown(i: number) { setBreakdown(breakdown.filter((_, idx) => idx !== i)); }

  async function submit() {
    if (!id) return;
    setErr(null);
    if (!title.trim() || !value.trim()) { setErr(t("newc.err.required")); return; }
    setBusy(true);
    try {
      const signed = parseDateStr(signedDate);
      const sched = parseDateStr(scheduledDate);
      const deliv = parseDateStr(deliveryDate);
      const body: any = {
        title: title.trim(), description,
        total_value: parseFloat(value) || 0, currency,
        category, contract_number: contractNumber || undefined,
        provider: provider || undefined, product: product || undefined,
        signed_date: signed ? signed.toISOString() : undefined,
        scheduled_date: sched ? sched.toISOString() : undefined,
        delivery_date: deliv ? deliv.toISOString() : undefined,
        pay_pct: parseFloat(payPct) || 0,
        payment_breakdown: breakdown.map(b => ({ type: b.type, pct: parseFloat(b.pct) || 0, note: b.note })),
        observations,
      };
      await api.updateContract(id as string, body);
      router.back();
    } catch (e: any) {
      setErr(e?.message || "No se pudo guardar");
    } finally { setBusy(false); }
  }

  if (loading) {
    return <View style={[styles.header, { flex: 1, justifyContent: "center" }]}><ActivityIndicator color={colors.brandPrimary} /></View>;
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.surface }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} testID="back-button"><Ionicons name="chevron-back" size={26} color={colors.onSurface} /></Pressable>
        <Text style={styles.headerTitle}>EDITAR CONTRATO</Text>
        <View style={{ width: 26 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>{t("newc.category")}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 4 }} style={{ flexGrow: 0, marginBottom: spacing.md }}>
          {CATEGORIES.map((c) => {
            const active = category === c;
            return (
              <Pressable key={c} onPress={() => setCategory(c)} style={[styles.chip, active && styles.chipActive]} testID={`edit-category-${c}`}>
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{t(`cat.${c}`)}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <Field label={t("newc.field.number")} value={contractNumber} onChangeText={setContractNumber} testID="edit-contract-number" />
        <Field label={t("newc.field.title")} value={title} onChangeText={setTitle} testID="edit-contract-title" />
        <Field label={t("newc.field.consultant")} value={provider} onChangeText={setProvider} testID="edit-contract-provider" />
        <Field label={t("newc.field.product")} value={product} onChangeText={setProduct} testID="edit-contract-product" />

        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <Field label={t("newc.field.value")} value={value} onChangeText={setValue} keyboardType="numeric" style={{ flex: 1 }} testID="edit-contract-value" />
          <View style={{ width: 130, marginBottom: spacing.md }}>
            <Text style={styles.label}>{t("newc.field.currency")}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4 }} style={styles.currencyRow}>
              {CURRENCIES.map((c) => {
                const active = currency === c;
                return (
                  <Pressable key={c} onPress={() => setCurrency(c)} style={[styles.currChip, active && styles.currChipActive]}>
                    <Text style={[styles.currText, active && styles.currTextActive]}>{c}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>

        <Field label={t("newc.field.signed")} value={signedDate} onChangeText={setSignedDate} placeholder="2026-03-15" />
        <Field label={t("newc.field.scheduled")} value={scheduledDate} onChangeText={setScheduledDate} placeholder="2026-04-15" />
        <Field label={t("newc.field.delivery")} value={deliveryDate} onChangeText={setDeliveryDate} placeholder="2026-09-15" />
        <Field label={t("newc.field.payPct")} value={payPct} onChangeText={setPayPct} keyboardType="numeric" />

        <Text style={styles.label}>{t("newc.field.payBreakdown")}</Text>
        {breakdown.map((b, i) => (
          <View key={i} style={styles.brRow}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4 }} style={{ flex: 1 }}>
              {PAY_TYPES.map((pt) => (
                <Pressable key={pt} onPress={() => updateBreakdown(i, { type: pt })} style={[styles.brTypeChip, b.type === pt && styles.brTypeChipActive]}>
                  <Text style={[styles.brTypeText, b.type === pt && styles.brTypeTextActive]}>{t(`newc.field.payType.${pt}`)}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <TextInput style={styles.brPct} value={b.pct} onChangeText={(v) => updateBreakdown(i, { pct: v })} keyboardType="numeric" placeholder="%" placeholderTextColor={colors.onSurfaceSecondary} />
            <Pressable onPress={() => removeBreakdown(i)}><Ionicons name="close-circle" size={22} color={colors.error} /></Pressable>
          </View>
        ))}
        <Pressable style={styles.addBr} onPress={addBreakdown}>
          <Ionicons name="add-circle-outline" size={16} color={colors.brandPrimary} />
          <Text style={styles.addBrText}>Agregar tramo de pago</Text>
        </Pressable>

        <Field label={t("newc.field.description")} value={description} onChangeText={setDescription} multiline />
        <Field label={t("newc.field.observations")} value={observations} onChangeText={setObservations} multiline />

        {err ? <Text style={styles.err}>{err}</Text> : null}
        <Pressable style={styles.submit} onPress={submit} disabled={busy} testID="edit-submit">
          {busy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.submitText}>Guardar cambios</Text>}
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
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.divider, backgroundColor: colors.surface },
  headerTitle: { fontSize: 14, fontWeight: "700", color: colors.onSurfaceSecondary, letterSpacing: 1 },
  label: { fontSize: 11, fontWeight: "700", color: colors.onSurfaceSecondary, letterSpacing: 0.8, marginBottom: 4 },
  input: { backgroundColor: colors.surfaceSecondary, paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, color: colors.onSurface, fontSize: 14, fontFamily: font.mono },
  chip: { flexShrink: 0, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  chipText: { fontSize: 11, fontWeight: "700", color: colors.onSurfaceSecondary },
  chipTextActive: { color: "#FFF" },
  currencyRow: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 6, paddingVertical: 6 },
  currChip: { paddingHorizontal: 8, paddingVertical: 6, borderRadius: radius.sm, backgroundColor: "#FFF", borderWidth: 1, borderColor: colors.border, minWidth: 44, alignItems: "center" },
  currChipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  currText: { fontSize: 11, fontWeight: "700", color: colors.onSurface, fontFamily: font.mono },
  currTextActive: { color: "#FFF" },
  brRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6, backgroundColor: colors.surfaceSecondary, padding: 8, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border },
  brTypeChip: { paddingHorizontal: 8, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: "#FFF", borderWidth: 1, borderColor: colors.border },
  brTypeChipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  brTypeText: { fontSize: 10, fontWeight: "700", color: colors.onSurfaceSecondary },
  brTypeTextActive: { color: "#FFF" },
  brPct: { width: 60, backgroundColor: "#FFF", padding: 8, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, textAlign: "right", fontFamily: font.mono, fontSize: 12, color: colors.onSurface },
  addBr: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, padding: 10, borderRadius: radius.sm, borderWidth: 1, borderStyle: "dashed", borderColor: colors.brandPrimary, marginBottom: spacing.md },
  addBrText: { color: colors.brandPrimary, fontSize: 12, fontWeight: "700" },
  submit: { backgroundColor: colors.brandPrimary, paddingVertical: 14, borderRadius: radius.md, alignItems: "center", marginTop: spacing.md },
  submitText: { color: "#FFF", fontWeight: "700", fontSize: 15 },
  err: { color: colors.error, fontSize: 12, marginTop: 4 },
});
