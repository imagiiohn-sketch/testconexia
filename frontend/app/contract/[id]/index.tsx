import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, TextInput, RefreshControl } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { api } from "@/src/api";
import { colors, spacing, radius, font, STATUS_COLORS, RISK_COLORS, fmtMoney, fmtDate } from "@/src/theme";

const STEP_LABELS: Record<string, string> = {
  legal: "Legal", finance: "Finanzas", operations: "Operaciones", direction: "Dirección",
};

export default function ContractDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiText, setAiText] = useState("");
  const [showAi, setShowAi] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try { setData(await api.getContract(id)); } catch (e) { console.warn(e); }
    setLoading(false); setRefreshing(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function decide(step: string, decision: "approved" | "rejected") {
    if (!id) return;
    try { setData(await api.workflowDecision(id, step, decision)); } catch (e) { console.warn(e); }
  }
  async function sign() {
    if (!id) return;
    try { setData(await api.sign(id)); } catch (e) { console.warn(e); }
  }
  async function runAi() {
    setAiBusy(true);
    try {
      const text = aiText.trim() || `${data?.title} - ${data?.description}. Counterparty: ${data?.counterparty}. Value: ${data?.total_value} ${data?.currency}. Ends ${data?.end_date}.`;
      await api.aiAnalyze({ contract_id: id as string, contract_text: text });
      await load();
    } catch (e: any) { console.warn(e); }
    setAiBusy(false);
  }

  if (loading || !data) {
    return <View style={[styles.root, { justifyContent: "center" }]}><ActivityIndicator color={colors.brandPrimary} /></View>;
  }

  const s = STATUS_COLORS[data.status] || STATUS_COLORS.draft;
  const r = RISK_COLORS[data.risk_level] || RISK_COLORS.low;
  const progress = data.total_value > 0 ? Math.min(data.executed_value / data.total_value, 1) : 0;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="contract-detail-screen">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} testID="back-button"><Ionicons name="chevron-back" size={26} color={colors.onSurface} /></Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>Contrato</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 80 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brandPrimary} />}
      >
        <View style={{ flexDirection: "row", gap: 6, marginBottom: 8 }}>
          <View style={[styles.pill, { backgroundColor: s.bg }]}><Text style={[styles.pillText, { color: s.fg }]}>{s.label.toUpperCase()}</Text></View>
          <View style={[styles.pill, { backgroundColor: r.bg }]}><Text style={[styles.pillText, { color: r.fg }]}>RIESGO {r.label.toUpperCase()}</Text></View>
        </View>
        <Text style={styles.title}>{data.title}</Text>
        <Text style={styles.counter}>{data.counterparty}</Text>
        {data.description ? <Text style={styles.desc}>{data.description}</Text> : null}

        {/* Financial KPIs */}
        <View style={styles.kpiCard}>
          <View style={styles.kpiRow}>
            <KpiSm label="VALOR" value={fmtMoney(data.total_value, data.currency)} />
            <KpiSm label="EJECUTADO" value={fmtMoney(data.executed_value, data.currency)} tone="success" />
            <KpiSm label="RETENCIÓN" value={fmtMoney(data.retention_value, data.currency)} tone="info" />
            <KpiSm label="MULTAS" value={fmtMoney(data.penalty_value, data.currency)} tone={data.penalty_value > 0 ? "error" : "muted"} />
          </View>
          <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${progress * 100}%` }]} /></View>
          <View style={styles.dateRow}>
            <Text style={styles.dateLabel}>Inicio: <Text style={styles.dateValue}>{fmtDate(data.start_date)}</Text></Text>
            <Text style={styles.dateLabel}>Vence: <Text style={styles.dateValue}>{fmtDate(data.end_date)}</Text></Text>
          </View>
        </View>

        {/* Workflow */}
        <Text style={styles.sectionTitle}>Flujo de Aprobación</Text>
        <View style={styles.workflowCard}>
          {(data.workflow || []).map((step: any, i: number) => {
            const colorByStatus = step.status === "approved" ? colors.success : step.status === "rejected" ? colors.error : colors.borderStrong;
            return (
              <View key={step.step} style={styles.stepRow}>
                <View style={[styles.stepDot, { backgroundColor: colorByStatus }]}>
                  {step.status === "approved" ? <Ionicons name="checkmark" size={14} color="#FFF" /> :
                    step.status === "rejected" ? <Ionicons name="close" size={14} color="#FFF" /> :
                    <Text style={{ color: "#FFF", fontWeight: "800", fontSize: 11 }}>{i + 1}</Text>}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.stepLabel}>{STEP_LABELS[step.step]}</Text>
                  <Text style={styles.stepSub}>
                    {step.status === "pending" ? "Pendiente de decisión" : `${step.status === "approved" ? "Aprobado" : "Rechazado"} por ${step.approver_name || "—"}`}
                  </Text>
                </View>
                {step.status === "pending" ? (
                  <View style={{ flexDirection: "row", gap: 6 }}>
                    <Pressable style={[styles.miniBtn, { backgroundColor: colors.success }]} onPress={() => decide(step.step, "approved")} testID={`approve-${step.step}`}>
                      <Ionicons name="checkmark" size={14} color="#FFF" />
                    </Pressable>
                    <Pressable style={[styles.miniBtn, { backgroundColor: colors.error }]} onPress={() => decide(step.step, "rejected")} testID={`reject-${step.step}`}>
                      <Ionicons name="close" size={14} color="#FFF" />
                    </Pressable>
                  </View>
                ) : null}
              </View>
            );
          })}

          {data.status === "approved" ? (
            <Pressable style={styles.signBtn} onPress={sign} testID="sign-button">
              <Ionicons name="pencil-outline" size={16} color="#FFF" />
              <Text style={styles.signBtnText}>Aplicar Firma Electrónica (Mock eIDAS)</Text>
            </Pressable>
          ) : null}
        </View>

        {/* AI Copilot */}
        <Text style={styles.sectionTitle}>Copiloto IA</Text>
        <View style={styles.aiCard}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <Ionicons name="sparkles-outline" size={16} color={colors.brandPrimary} />
            <Text style={styles.aiTitle}>Análisis Contractual con Claude</Text>
          </View>
          {data.ai_analysis ? (
            <View>
              <Text style={styles.aiSummary}>{data.ai_analysis.summary}</Text>
              {(data.ai_analysis.key_dates || []).length > 0 ? (
                <View style={styles.aiSub}>
                  <Text style={styles.aiSubLabel}>Fechas Clave</Text>
                  {data.ai_analysis.key_dates.slice(0, 5).map((d: any, i: number) => (
                    <Text key={i} style={styles.aiSubItem}>• {d.label}: <Text style={{ fontFamily: font.mono }}>{d.date}</Text></Text>
                  ))}
                </View>
              ) : null}
              {(data.ai_analysis.risk_clauses || []).length > 0 ? (
                <View style={styles.aiSub}>
                  <Text style={styles.aiSubLabel}>Cláusulas de Riesgo</Text>
                  {data.ai_analysis.risk_clauses.slice(0, 5).map((d: any, i: number) => (
                    <Text key={i} style={styles.aiSubItem}>• [{(d.severity || "low").toUpperCase()}] {d.clause}</Text>
                  ))}
                </View>
              ) : null}
            </View>
          ) : (
            <Text style={styles.aiHint}>Genera un análisis automatizado del contrato para extraer fechas, obligaciones y cláusulas riesgosas.</Text>
          )}
          <Pressable style={styles.aiToggle} onPress={() => setShowAi(!showAi)} testID="ai-toggle">
            <Text style={styles.aiToggleText}>{showAi ? "Ocultar" : "Pegar texto del contrato (opcional)"}</Text>
            <Ionicons name={showAi ? "chevron-up" : "chevron-down"} size={14} color={colors.brandPrimary} />
          </Pressable>
          {showAi ? (
            <TextInput
              style={styles.aiInput}
              multiline
              numberOfLines={4}
              value={aiText}
              onChangeText={setAiText}
              placeholder="Pega aquí cláusulas o el texto completo..."
              placeholderTextColor={colors.onSurfaceSecondary}
              testID="ai-input"
            />
          ) : null}
          <Pressable style={styles.aiRun} onPress={runAi} disabled={aiBusy} testID="ai-run-button">
            {aiBusy ? <ActivityIndicator color="#FFF" /> : <>
              <Ionicons name="flash-outline" size={14} color="#FFF" />
              <Text style={styles.aiRunText}>Analizar con IA</Text>
            </>}
          </Pressable>
        </View>

        {/* Timeline */}
        <Text style={styles.sectionTitle}>Línea de Tiempo</Text>
        <View style={styles.timeline}>
          {(data.timeline || []).slice().reverse().map((ev: any) => (
            <View key={ev.id} style={styles.tlRow}>
              <View style={styles.tlDot} />
              <View style={{ flex: 1 }}>
                <Text style={styles.tlMsg}>{ev.message}</Text>
                <Text style={styles.tlMeta}>{fmtDate(ev.at)} • {ev.actor_name || "Sistema"}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Addenda */}
        <Text style={styles.sectionTitle}>Adendas ({(data.addenda || []).length})</Text>
        {(data.addenda || []).map((a: any) => (
          <View key={a.contract_id} style={styles.addenCard}>
            <Text style={styles.addenTitle}>{a.title}</Text>
            <Text style={styles.addenSub}>Δ {fmtMoney(a.value_delta || 0, a.currency)} • {a.end_date_delta_days >= 0 ? "+" : ""}{a.end_date_delta_days || 0} días</Text>
          </View>
        ))}
        <Pressable style={styles.addBtn} onPress={() => router.push(`/contract/${id}/addendum` as any)} testID="add-addendum-button">
          <Ionicons name="add-circle-outline" size={16} color={colors.brandPrimary} />
          <Text style={styles.addBtnText}>Agregar Adenda</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function KpiSm({ label, value, tone }: { label: string; value: string; tone?: "success" | "info" | "error" | "muted" }) {
  const map: any = { success: colors.success, info: colors.info, error: colors.error, muted: colors.onSurfaceSecondary };
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.kpiSmLabel}>{label}</Text>
      <Text style={[styles.kpiSmValue, tone ? { color: map[tone] } : null]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider },
  headerTitle: { fontSize: 14, fontWeight: "700", color: colors.onSurfaceSecondary, letterSpacing: 1 },
  title: { fontSize: 22, fontWeight: "800", color: colors.onSurface },
  counter: { fontSize: 13, color: colors.onSurfaceSecondary, marginTop: 2 },
  desc: { fontSize: 13, color: colors.onSurfaceSecondary, marginTop: 6 },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  pillText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.8 },
  kpiCard: { backgroundColor: colors.surfaceSecondary, padding: spacing.md, borderRadius: radius.md, marginTop: spacing.lg, borderWidth: 1, borderColor: colors.border },
  kpiRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm },
  kpiSmLabel: { fontSize: 9, fontWeight: "700", color: colors.onSurfaceSecondary, letterSpacing: 0.8 },
  kpiSmValue: { fontSize: 13, fontWeight: "700", fontFamily: font.mono, color: colors.onSurface, marginTop: 2 },
  progressTrack: { height: 6, backgroundColor: colors.surfaceTertiary, borderRadius: 3, overflow: "hidden", marginVertical: spacing.sm },
  progressFill: { height: 6, backgroundColor: colors.brandPrimary },
  dateRow: { flexDirection: "row", justifyContent: "space-between" },
  dateLabel: { fontSize: 11, color: colors.onSurfaceSecondary },
  dateValue: { color: colors.onSurface, fontFamily: font.mono, fontWeight: "700" },
  sectionTitle: { fontSize: 12, fontWeight: "800", color: colors.onSurfaceSecondary, letterSpacing: 1.2, marginTop: spacing.xl, marginBottom: spacing.sm },
  workflowCard: { backgroundColor: colors.surfaceSecondary, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, gap: spacing.sm },
  stepRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  stepDot: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  stepLabel: { fontSize: 14, fontWeight: "700", color: colors.onSurface },
  stepSub: { fontSize: 11, color: colors.onSurfaceSecondary, marginTop: 1 },
  miniBtn: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  signBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.brandPrimary, padding: spacing.md, borderRadius: radius.md, marginTop: spacing.sm },
  signBtnText: { color: "#FFF", fontWeight: "700", fontSize: 13 },
  aiCard: { backgroundColor: colors.brandTertiary, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.brandPrimary },
  aiTitle: { fontSize: 13, fontWeight: "700", color: colors.brandPrimary },
  aiSummary: { fontSize: 13, color: colors.onSurface, marginBottom: 6 },
  aiSub: { marginTop: 6 },
  aiSubLabel: { fontSize: 11, fontWeight: "800", color: colors.brandPrimary, letterSpacing: 0.6, marginBottom: 2 },
  aiSubItem: { fontSize: 12, color: colors.onSurface, marginTop: 1 },
  aiHint: { fontSize: 12, color: colors.onSurfaceSecondary, fontStyle: "italic" },
  aiToggle: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: spacing.sm },
  aiToggleText: { color: colors.brandPrimary, fontSize: 12, fontWeight: "600" },
  aiInput: { marginTop: 6, padding: spacing.sm, backgroundColor: "#FFF", borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, minHeight: 80, color: colors.onSurface, textAlignVertical: "top" },
  aiRun: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: spacing.sm, backgroundColor: colors.brandPrimary, padding: spacing.sm, borderRadius: radius.sm },
  aiRunText: { color: "#FFF", fontWeight: "700", fontSize: 12 },
  timeline: { gap: spacing.sm },
  tlRow: { flexDirection: "row", gap: spacing.md, paddingVertical: spacing.xs },
  tlDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.brandPrimary, marginTop: 6 },
  tlMsg: { fontSize: 13, color: colors.onSurface, fontWeight: "600" },
  tlMeta: { fontSize: 11, color: colors.onSurfaceSecondary, marginTop: 1 },
  addenCard: { backgroundColor: colors.surfaceSecondary, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm },
  addenTitle: { fontSize: 14, fontWeight: "700", color: colors.onSurface },
  addenSub: { fontSize: 12, color: colors.onSurfaceSecondary, fontFamily: font.mono, marginTop: 2 },
  addBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.brandPrimary, borderStyle: "dashed" },
  addBtnText: { color: colors.brandPrimary, fontWeight: "700", fontSize: 13 },
});
