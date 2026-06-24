import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, FlatList, RefreshControl, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { api } from "@/src/api";
import { useT } from "@/src/i18n";
import { colors, spacing, radius, font, STATUS_COLORS, RISK_COLORS, fmtMoney, fmtDate } from "@/src/theme";

const CATS = ["all", "bienes", "obras", "servicios_no_consultoria", "consultor_individual", "firma_consultora", "acuerdo_marco"] as const;

export default function Contracts() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useT();
  const [cat, setCat] = useState<string>("all");
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.listContracts({ category: cat });
      setItems(data);
    } catch (e) { console.warn(e); }
    setLoading(false); setRefreshing(false);
  }, [cat]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="contracts-screen">
      <View style={styles.header}>
        <Text style={styles.title}>{t("contracts.title")}</Text>
        <Pressable onPress={() => router.push("/contract/new")} style={styles.newBtn} testID="new-contract-button">
          <Ionicons name="add" size={18} color={colors.onBrandPrimary} />
          <Text style={styles.newBtnText}>{t("contracts.new")}</Text>
        </Pressable>
      </View>

      <View style={styles.chipRowWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.lg }} style={styles.chipRow}>
          {CATS.map((c) => {
            const active = cat === c;
            return (
              <Pressable key={c} onPress={() => setCat(c)} style={[styles.chip, active && styles.chipActive]} testID={`filter-${c}`}>
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{t(`cat.${c}`)}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: 32 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => it.contract_id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 140 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brandPrimary} />}
          ListEmptyComponent={<Text style={styles.empty}>{t("contracts.empty")}</Text>}
          renderItem={({ item }) => <ContractCard item={item} t={t} onPress={() => router.push(`/contract/${item.contract_id}` as any)} />}
        />
      )}
    </View>
  );
}

function ContractCard({ item, t, onPress }: any) {
  const s = STATUS_COLORS[item.status] || STATUS_COLORS.draft;
  const r = RISK_COLORS[item.risk_level] || RISK_COLORS.low;
  return (
    <Pressable style={styles.card} onPress={onPress} testID={`contract-card-${item.contract_id}`}>
      <View style={styles.cardTop}>
        <View style={[styles.pill, { backgroundColor: s.bg }]}><Text style={[styles.pillText, { color: s.fg }]}>{s.label.toUpperCase()}</Text></View>
        <View style={[styles.pill, { backgroundColor: r.bg, marginLeft: 6 }]}><Text style={[styles.pillText, { color: r.fg }]}>{t("contracts.risk")} {r.label.toUpperCase()}</Text></View>
        <View style={[styles.pill, { backgroundColor: colors.brandTertiary, marginLeft: 6 }]}>
          <Text style={[styles.pillText, { color: colors.brandPrimary }]}>{t(`cat.${item.category || "bienes"}`).toUpperCase()}</Text>
        </View>
      </View>
      <Text style={styles.contractNumber}>{item.contract_number || "—"}</Text>
      <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
      <Text style={styles.cardSub} numberOfLines={1}>{item.counterparty}</Text>

      <View style={styles.grid}>
        <Cell label={t("contracts.label.consultant")} value={item.consultant || "—"} />
        <Cell label={t("contracts.label.product")} value={item.product || "—"} />
        <Cell label={t("contracts.label.scheduled")} value={fmtDate(item.scheduled_date)} mono />
        <Cell label={t("contracts.label.delivery")} value={fmtDate(item.delivery_date || item.end_date)} mono />
        <Cell label={t("contracts.label.pay")} value={`${item.pay_pct || 0}%`} mono />
        <Cell label={t("contracts.label.value")} value={fmtMoney(item.total_value, item.currency)} mono />
      </View>

      {item.observations ? (
        <View style={styles.obsRow}>
          <Text style={styles.obsLabel}>{t("contracts.label.observations")}</Text>
          <Text style={styles.obsText} numberOfLines={2}>{item.observations}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function Cell({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={{ width: "33.33%", padding: 4 }}>
      <Text style={styles.cellLabel}>{label}</Text>
      <Text style={[styles.cellValue, mono && { fontFamily: font.mono }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  title: { fontSize: 28, fontWeight: "800", color: colors.onSurface },
  newBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.brandPrimary, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill },
  newBtnText: { color: colors.onBrandPrimary, fontWeight: "700", fontSize: 13 },
  chipRowWrap: { height: 56, justifyContent: "center", borderBottomWidth: 1, borderBottomColor: colors.divider },
  chipRow: { flexGrow: 0 },
  chip: { height: 36, flexShrink: 0, borderRadius: radius.pill, paddingHorizontal: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  chipText: { color: colors.onSurfaceSecondary, fontSize: 12, fontWeight: "600" },
  chipTextActive: { color: colors.onBrandPrimary },
  card: { backgroundColor: colors.surfaceSecondary, padding: spacing.md, borderRadius: radius.md, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border },
  cardTop: { flexDirection: "row", flexWrap: "wrap", marginBottom: 6, rowGap: 4 },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  pillText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.8 },
  contractNumber: { fontFamily: font.mono, fontSize: 10, color: colors.brandPrimary, fontWeight: "800", letterSpacing: 1 },
  cardTitle: { fontSize: 16, fontWeight: "700", color: colors.onSurface, marginTop: 2 },
  cardSub: { fontSize: 12, color: colors.onSurfaceSecondary, marginTop: 2 },
  grid: { flexDirection: "row", flexWrap: "wrap", marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: spacing.sm },
  cellLabel: { fontSize: 8, fontWeight: "800", color: colors.onSurfaceSecondary, letterSpacing: 0.6 },
  cellValue: { fontSize: 12, color: colors.onSurface, fontWeight: "600", marginTop: 1 },
  obsRow: { borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: spacing.sm, marginTop: spacing.sm },
  obsLabel: { fontSize: 8, fontWeight: "800", color: colors.onSurfaceSecondary, letterSpacing: 0.6 },
  obsText: { fontSize: 11, color: colors.onSurfaceSecondary, fontStyle: "italic", marginTop: 2 },
  empty: { textAlign: "center", color: colors.onSurfaceSecondary, marginTop: 40, fontStyle: "italic" },
});
