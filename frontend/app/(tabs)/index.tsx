import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl, ActivityIndicator, Platform } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useT } from "@/src/i18n";
import { colors, spacing, radius, font, fmtMoney, fmtDate, RISK_COLORS, STATUS_COLORS } from "@/src/theme";

export default function Dashboard() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { t } = useT();
  const router = useRouter();
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setData(await api.dashboard()); } catch (e) { console.warn(e); }
    setLoading(false); setRefreshing(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View style={styles.root} testID="dashboard-screen">
      <ScrollView
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brandPrimary} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.hero, { paddingTop: insets.top + spacing.md }]}>
          <Image source={{ uri: "https://images.unsplash.com/photo-1721244654394-36a7bc2da288?crop=entropy&cs=srgb&fm=jpg&q=85" }} style={StyleSheet.absoluteFill} contentFit="cover" />
          <LinearGradient colors={["rgba(31,74,74,0.92)", "rgba(31,74,74,0.78)", "rgba(13,20,20,0.95)"]} style={StyleSheet.absoluteFill} />
          <View style={styles.heroRow}>
            <View>
              <Text style={styles.heroEyebrow}>CONEXIA CLM</Text>
              <Text style={styles.heroTitle} testID="hero-greeting">{t("dash.greeting")}, {user?.name?.split(" ")[0] || "Equipo"}</Text>
              <Text style={styles.heroSub}>{user?.department || "Dirección Ejecutiva"}</Text>
            </View>
            <Pressable style={styles.bellBtn} onPress={() => router.push("/notifications")} testID="hero-bell-button">
              <Ionicons name="notifications-outline" size={20} color="#FFF" />
              {data && data.alerts.length > 0 ? <View style={styles.bellDot} /> : null}
            </Pressable>
          </View>

          {data && data.alerts.length > 0 ? (
            <Pressable onPress={() => router.push(`/contract/${data.alerts[0].contract_id}` as any)} testID="critical-alert-card">
              {Platform.OS === "ios" ? (
                <BlurView intensity={50} tint="dark" style={styles.glass}><AlertContent a={data.alerts[0]} t={t} /></BlurView>
              ) : (
                <View style={[styles.glass, { backgroundColor: "rgba(13,20,20,0.55)" }]}><AlertContent a={data.alerts[0]} t={t} /></View>
              )}
            </Pressable>
          ) : null}
        </View>

        <View style={styles.kpiSection}>
          <Text style={styles.sectionTitle}>{t("dash.kpi.title")}</Text>
          {loading ? <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: 24 }} /> : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.md, paddingHorizontal: spacing.lg }}>
              <KpiTile label={t("dash.kpi.total")} value={fmtMoney(data?.kpis.total_value || 0)} sub={`${data?.kpis.total_contracts || 0} ${t("dash.kpi.contracts")}`} tone="brand" testID="kpi-total" />
              <KpiTile label={t("dash.kpi.executed")} value={fmtMoney(data?.kpis.executed || 0)} sub={t("dash.kpi.progress")} tone="success" testID="kpi-executed" />
              <KpiTile label={t("dash.kpi.retention")} value={fmtMoney(data?.kpis.retention || 0)} sub={t("dash.kpi.warranty")} tone="info" testID="kpi-retention" />
              <KpiTile label={t("dash.kpi.penalties")} value={fmtMoney(data?.kpis.penalties || 0)} sub={t("dash.kpi.fines")} tone={data && data.kpis.penalties > 0 ? "error" : "muted"} testID="kpi-penalties" />
            </ScrollView>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle2}>{t("dash.semaphore.title")}</Text>
            <Pressable onPress={() => router.push("/(tabs)/contracts")} testID="see-all-contracts">
              <Text style={styles.linkText}>{t("dash.semaphore.seeall")}</Text>
            </Pressable>
          </View>
          {!loading && (data?.alerts.length || 0) === 0 ? <Text style={styles.empty}>{t("dash.semaphore.empty")}</Text> : null}
          {data?.alerts.map((a: any) => (
            <Pressable key={a.contract_id} style={styles.alertRow} onPress={() => router.push(`/contract/${a.contract_id}` as any)} testID={`alert-${a.contract_id}`}>
              <View style={[styles.semaphore, { backgroundColor: a.level === "high" ? colors.error : a.level === "medium" ? colors.warning : colors.success }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.alertTitle} numberOfLines={1}>{a.title}</Text>
                <Text style={styles.alertSub} numberOfLines={1}>{a.counterparty} · {t(`cat.${a.category || "bienes"}`)}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.alertDays}>{a.days_to_end}d</Text>
                <Text style={styles.alertValue}>{fmtMoney(a.value, a.currency)}</Text>
              </View>
            </Pressable>
          ))}
        </View>

        {/* Recent contracts with full row */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle2}>{t("dash.recent.list")}</Text>
          {data?.recent?.map((c: any) => <DashRow key={c.contract_id} c={c} t={t} onPress={() => router.push(`/contract/${c.contract_id}` as any)} />)}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle2}>{t("dash.pipe.title")}</Text>
          <View style={styles.pipeRow}>
            <PipeCell label={t("dash.pipe.drafts")} value={data ? Math.max(data.kpis.in_review - data.kpis.active, 0) : 0} icon="create-outline" />
            <PipeCell label={t("dash.pipe.review")} value={data?.kpis.in_review || 0} icon="time-outline" />
            <PipeCell label={t("dash.pipe.active")} value={data?.kpis.active || 0} icon="checkmark-done-outline" />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function AlertContent({ a, t }: { a: any; t: any }) {
  const r = RISK_COLORS[a.level];
  return (
    <View style={{ padding: spacing.lg, gap: 6 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <View style={[styles.riskPill, { backgroundColor: r.bg }]}><Text style={[styles.riskPillText, { color: r.fg }]}>{r.label.toUpperCase()}</Text></View>
        <Text style={styles.glassEyebrow}>{t("dash.alert.critical")}</Text>
      </View>
      <Text style={styles.glassTitle} numberOfLines={1}>{a.title}</Text>
      <Text style={styles.glassSub}>{t("dash.alert.days", { days: a.days_to_end })} — {a.counterparty}</Text>
    </View>
  );
}

function DashRow({ c, t, onPress }: { c: any; t: any; onPress: () => void }) {
  const s = STATUS_COLORS[c.status] || STATUS_COLORS.draft;
  return (
    <Pressable style={styles.dashCard} onPress={onPress} testID={`dash-row-${c.contract_id}`}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <View style={{ flex: 1 }}>
          <Text style={styles.dashNum}>{c.contract_number || "—"}</Text>
          <Text style={styles.dashTitle} numberOfLines={1}>{c.title}</Text>
        </View>
        <View style={[styles.statusPill, { backgroundColor: s.bg }]}><Text style={[styles.statusPillText, { color: s.fg }]}>{s.label.toUpperCase()}</Text></View>
      </View>
      <View style={styles.dashGrid}>
        <Mini label={t("contracts.label.consultant")} value={c.consultant || "—"} />
        <Mini label={t("contracts.label.product")} value={c.product || "—"} />
        <Mini label={t("contracts.label.scheduled")} value={fmtDate(c.scheduled_date)} mono />
        <Mini label={t("contracts.label.delivery")} value={fmtDate(c.delivery_date || c.end_date)} mono />
        <Mini label={t("contracts.label.pay")} value={`${c.pay_pct || 0}%`} mono />
        <Mini label={t("contracts.label.value")} value={fmtMoney(c.total_value, c.currency)} mono />
      </View>
      {c.observations ? <Text style={styles.dashObs} numberOfLines={2}>« {c.observations} »</Text> : null}
    </Pressable>
  );
}

function Mini({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={{ width: "33.3%", paddingTop: 4 }}>
      <Text style={styles.miniLabel}>{label}</Text>
      <Text style={[styles.miniVal, mono && { fontFamily: font.mono }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function KpiTile({ label, value, sub, tone, testID }: any) {
  const toneMap: any = { brand: colors.brandPrimary, success: colors.success, info: colors.info, error: colors.error, muted: colors.onSurfaceSecondary };
  return (
    <View style={styles.kpiTile} testID={testID}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={[styles.kpiValue, { color: toneMap[tone] }]}>{value}</Text>
      <Text style={styles.kpiSub}>{sub}</Text>
    </View>
  );
}

function PipeCell({ label, value, icon }: { label: string; value: number; icon: any }) {
  return (
    <View style={styles.pipeCell}>
      <Ionicons name={icon} size={22} color={colors.brandPrimary} />
      <Text style={styles.pipeValue}>{value}</Text>
      <Text style={styles.pipeLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  hero: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, minHeight: 260, overflow: "hidden" },
  heroRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: spacing.lg },
  heroEyebrow: { color: "rgba(255,255,255,0.7)", fontSize: 11, letterSpacing: 2, fontWeight: "600" },
  heroTitle: { color: "#FFF", fontSize: 26, fontWeight: "700", marginTop: 2 },
  heroSub: { color: "rgba(255,255,255,0.75)", fontSize: 12, marginTop: 2 },
  bellBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" },
  bellDot: { position: "absolute", top: 8, right: 8, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.error },
  glass: { borderRadius: radius.md, overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,255,255,0.18)" },
  glassEyebrow: { color: "rgba(255,255,255,0.85)", fontSize: 10, letterSpacing: 2, fontWeight: "700" },
  glassTitle: { color: "#FFF", fontSize: 16, fontWeight: "700" },
  glassSub: { color: "rgba(255,255,255,0.8)", fontSize: 12 },
  riskPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill },
  riskPillText: { fontSize: 9, fontWeight: "800", letterSpacing: 1 },
  kpiSection: { marginTop: spacing.lg },
  sectionTitle: { fontSize: 14, fontWeight: "700", color: colors.onSurface, paddingHorizontal: spacing.lg, marginBottom: spacing.md, letterSpacing: 0.2 },
  section: { marginTop: spacing.xl, paddingHorizontal: spacing.lg },
  sectionTitle2: { fontSize: 14, fontWeight: "700", color: colors.onSurface, marginBottom: spacing.md, letterSpacing: 0.2 },
  sectionHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md },
  linkText: { color: colors.brandPrimary, fontSize: 12, fontWeight: "600" },
  kpiTile: { width: 170, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  kpiLabel: { fontSize: 11, color: colors.onSurfaceSecondary, fontWeight: "600", letterSpacing: 0.6, textTransform: "uppercase" },
  kpiValue: { fontSize: 22, fontWeight: "700", marginTop: 6, fontFamily: font.mono },
  kpiSub: { fontSize: 11, color: colors.onSurfaceSecondary, marginTop: 4 },
  alertRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, marginBottom: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  semaphore: { width: 10, height: 40, borderRadius: 5 },
  alertTitle: { fontSize: 14, fontWeight: "700", color: colors.onSurface },
  alertSub: { fontSize: 12, color: colors.onSurfaceSecondary, marginTop: 2 },
  alertDays: { fontSize: 14, fontWeight: "800", color: colors.brandPrimary, fontFamily: font.mono },
  alertValue: { fontSize: 11, color: colors.onSurfaceSecondary, fontFamily: font.mono, marginTop: 2 },
  empty: { color: colors.onSurfaceSecondary, fontSize: 12, fontStyle: "italic" },
  dashCard: { backgroundColor: colors.surfaceSecondary, padding: spacing.md, borderRadius: radius.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border },
  dashNum: { fontFamily: font.mono, fontSize: 10, color: colors.brandPrimary, fontWeight: "800", letterSpacing: 1 },
  dashTitle: { fontSize: 14, fontWeight: "700", color: colors.onSurface, marginTop: 2 },
  dashGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: spacing.sm, gap: 0 },
  dashObs: { fontSize: 11, color: colors.onSurfaceSecondary, marginTop: spacing.sm, fontStyle: "italic", borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: spacing.sm },
  miniLabel: { fontSize: 8, fontWeight: "800", color: colors.onSurfaceSecondary, letterSpacing: 0.6 },
  miniVal: { fontSize: 12, color: colors.onSurface, fontWeight: "600", marginTop: 1 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, marginLeft: 8 },
  statusPillText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.8 },
  pipeRow: { flexDirection: "row", gap: spacing.sm },
  pipeCell: { flex: 1, padding: spacing.md, alignItems: "flex-start", backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, gap: 4 },
  pipeValue: { fontSize: 24, fontWeight: "800", color: colors.onSurface, fontFamily: font.mono },
  pipeLabel: { fontSize: 11, color: colors.onSurfaceSecondary, fontWeight: "600" },
});
