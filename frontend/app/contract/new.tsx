import React, { useState } from "react";
import { View, Text, StyleSheet, TextInput, Pressable, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";

import { api } from "@/src/api";
import { useT } from "@/src/i18n";
import { colors, spacing, radius, font } from "@/src/theme";

const CATEGORIES = ["bienes", "obras", "servicios_no_consultoria", "consultor_individual", "firma_consultora", "acuerdo_marco"];
const CURRENCIES = ["USD", "HNL", "EUR", "GTQ", "MXN", "COP", "CLP", "PEN"];
const PAY_TYPES = ["anticipo", "hito", "adenda", "contra_entrega", "final"];

export default function NewContract() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useT();
  const [category, setCategory] = useState<string>("bienes");
  const [title, setTitle] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [description, setDescription] = useState("");
  const [contractNumber, setContractNumber] = useState("");
  const [provider, setProvider] = useState("");
  const [product, setProduct] = useState("");
  const [value, setValue] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [days, setDays] = useState("90");
  const [signedDate, setSignedDate] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [payPct, setPayPct] = useState("0");
  const [breakdown, setBreakdown] = useState<{ type: string; pct: string; note: string }[]>([]);
  const [observations, setObservations] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMsg, setAiMsg] = useState<string | null>(null);

  function parseDate(s: string): Date | null {
    if (!s) return null;
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

  async function importDoc() {
    setAiMsg(null); setErr(null);
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"],
        copyToCacheDirectory: true, multiple: false,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const file = res.assets[0];
      setAiBusy(true);
      let b64 = "";
      if (Platform.OS === "web" && file.file) {
        const buf = await file.file.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let s = ""; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
        b64 = btoa(s);
      } else if (file.uri) {
        // expo-file-system v18+ moved readAsStringAsync to /legacy
        try {
          const FSLegacy: any = await import("expo-file-system/legacy");
          b64 = await FSLegacy.readAsStringAsync(file.uri, { encoding: "base64" });
        } catch (_e) {
          // Fallback to new File API (SDK 54+)
          const FS: any = await import("expo-file-system");
          if (FS.File) {
            const f = new FS.File(file.uri);
            b64 = await f.base64();
          } else if (typeof FS.readAsStringAsync === "function") {
            b64 = await FS.readAsStringAsync(file.uri, { encoding: FS.EncodingType?.Base64 || "base64" });
          } else {
            throw new Error("No file reader available on this platform");
          }
        }
      }
      if (!b64) throw new Error("No se pudo leer el archivo");
      const data = await api.aiExtractContract({ file_base64: b64, mime_type: file.mimeType, filename: file.name });
      // Pre-fill fields (only overwrite empty ones so user typed data is preserved)
      const set = (setter: any, cur: string, val?: any) => { if (val && !cur) setter(String(val)); };
      set(setTitle, title, data.title);
      set(setCounterparty, counterparty, data.counterparty);
      set(setDescription, description, data.description);
      set(setContractNumber, contractNumber, data.contract_number);
      set(setProvider, provider, data.provider);
      set(setProduct, product, data.product);
      if (data.total_value && !value) setValue(String(data.total_value));
      if (data.currency && CURRENCIES.includes(String(data.currency).toUpperCase())) setCurrency(String(data.currency).toUpperCase());
      if (data.signed_date && !signedDate) setSignedDate(String(data.signed_date));
      if (data.scheduled_date && !scheduledDate) setScheduledDate(String(data.scheduled_date));
      if (data.delivery_date && !deliveryDate) setDeliveryDate(String(data.delivery_date));
      if (data.pay_pct != null && payPct === "0") setPayPct(String(data.pay_pct));
      if (Array.isArray(data.payment_breakdown) && data.payment_breakdown.length > 0) {
        setBreakdown(data.payment_breakdown.map((p: any) => ({ type: PAY_TYPES.includes(p.type) ? p.type : "hito", pct: String(p.pct ?? 0), note: String(p.note || "") })));
      }
      if (data.category && CATEGORIES.includes(data.category)) setCategory(data.category);
      set(setObservations, observations, data.observations);
      setAiMsg(t("newc.import.done"));
    } catch (e: any) {
      setErr(e?.message || t("newc.import.err"));
    } finally { setAiBusy(false); }
  }

  function addBreakdown() { setBreakdown([...breakdown, { type: "anticipo", pct: "0", note: "" }]); }
  function updateBreakdown(i: number, patch: Partial<{ type: string; pct: string; note: string }>) {
    setBreakdown(breakdown.map((b, idx) => idx === i ? { ...b, ...patch } : b));
  }
  function removeBreakdown(i: number) { setBreakdown(breakdown.filter((_, idx) => idx !== i)); }

  async function submit() {
    setErr(null);
    if (!title.trim() || !counterparty.trim() || !value.trim()) { setErr(t("newc.err.required")); return; }
    setBusy(true);
    try {
      // start_date = signed date (or today as fallback)
      const start = parseDate(signedDate) || new Date();
      const end = new Date(start); end.setDate(end.getDate() + (parseInt(days || "90", 10) || 90));
      const sched = parseDate(scheduledDate) || start;
      const deliv = parseDate(deliveryDate) || end;
      const signed = parseDate(signedDate);
      const res = await api.createContract({
        title: title.trim(), counterparty: counterparty.trim(), description,
        total_value: parseFloat(value) || 0, currency,
        start_date: start.toISOString(), end_date: end.toISOString(),
        signed_date: signed ? signed.toISOString() : undefined,
        category, contract_number: contractNumber || undefined,
        provider: provider || undefined, product: product || undefined,
        scheduled_date: sched.toISOString(), delivery_date: deliv.toISOString(),
        pay_pct: parseFloat(payPct) || 0,
        payment_breakdown: breakdown.map(b => ({ type: b.type, pct: parseFloat(b.pct) || 0, note: b.note })),
        observations,
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

        <Pressable style={styles.importBtn} onPress={importDoc} disabled={aiBusy} testID="import-doc-button">
          {aiBusy ? <ActivityIndicator color="#FFF" /> : <>
            <Ionicons name="sparkles-outline" size={18} color="#FFF" />
            <Text style={styles.importBtnText}>{aiBusy ? t("newc.import.busy") : t("newc.import")}</Text>
          </>}
        </Pressable>
        {aiMsg ? <Text style={styles.okMsg}>{aiMsg}</Text> : null}

        <Text style={styles.label}>{t("newc.category")}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 4 }} style={{ flexGrow: 0, marginBottom: spacing.md }}>
          {CATEGORIES.map((c) => {
            const active = category === c;
            return (
              <Pressable key={c} onPress={() => setCategory(c)} style={[styles.chip, active && styles.chipActive]} testID={`category-${c}`}>
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{t(`cat.${c}`)}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <Field label={t("newc.field.number")} value={contractNumber} onChangeText={setContractNumber} testID="contract-number" placeholder="CON-2026-0001" />
        <Field label={t("newc.field.title")} value={title} onChangeText={setTitle} testID="contract-title-input" />
        <Field label={t("newc.field.counterparty")} value={counterparty} onChangeText={setCounterparty} testID="contract-counterparty-input" />
        <Field label={t("newc.field.consultant")} value={provider} onChangeText={setProvider} testID="contract-provider" />
        <Field label={t("newc.field.product")} value={product} onChangeText={setProduct} testID="contract-product" />

        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <Field label={t("newc.field.value")} value={value} onChangeText={setValue} keyboardType="numeric" style={{ flex: 1 }} testID="contract-value-input" />
          <View style={{ width: 130, marginBottom: spacing.md }}>
            <Text style={styles.label}>{t("newc.field.currency")}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4 }} style={styles.currencyRow}>
              {CURRENCIES.map((c) => {
                const active = currency === c;
                return (
                  <Pressable key={c} onPress={() => setCurrency(c)} style={[styles.currChip, active && styles.currChipActive]} testID={`currency-${c}`}>
                    <Text style={[styles.currText, active && styles.currTextActive]}>{c}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>

        <Field label={t("newc.field.signed")} value={signedDate} onChangeText={setSignedDate} testID="contract-signed" placeholder="2026-03-15" />
        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <Field label={t("newc.field.days")} value={days} onChangeText={setDays} keyboardType="numeric" style={{ flex: 1 }} testID="contract-days-input" />
          <Field label={t("newc.field.payPct")} value={payPct} onChangeText={setPayPct} keyboardType="numeric" style={{ flex: 1 }} testID="contract-pay-input" />
        </View>
        <Field label={t("newc.field.scheduled")} value={scheduledDate} onChangeText={setScheduledDate} testID="contract-scheduled" placeholder="2026-04-15" />
        <Field label={t("newc.field.delivery")} value={deliveryDate} onChangeText={setDeliveryDate} testID="contract-delivery" placeholder="2026-09-15" />

        <Text style={styles.label}>{t("newc.field.payBreakdown")}</Text>
        {breakdown.map((b, i) => (
          <View key={i} style={styles.brRow} testID={`breakdown-${i}`}>
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
        <Pressable style={styles.addBr} onPress={addBreakdown} testID="add-breakdown">
          <Ionicons name="add-circle-outline" size={16} color={colors.brandPrimary} />
          <Text style={styles.addBrText}>Agregar tramo de pago</Text>
        </Pressable>

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
  chip: { flexShrink: 0, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  chipText: { fontSize: 11, fontWeight: "700", color: colors.onSurfaceSecondary },
  chipTextActive: { color: "#FFF" },
  importBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.brandSecondary, paddingVertical: 12, borderRadius: radius.md, marginBottom: spacing.md },
  importBtnText: { color: "#FFF", fontWeight: "700", fontSize: 14 },
  okMsg: { color: colors.success, fontSize: 12, fontWeight: "700", textAlign: "center", marginBottom: spacing.sm },
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
