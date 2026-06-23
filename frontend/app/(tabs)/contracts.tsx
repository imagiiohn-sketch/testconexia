import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, FlatList, RefreshControl, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { api } from "@/src/api";
import { colors, spacing, radius, font, STATUS_COLORS, RISK_COLORS, fmtMoney, fmtDate } from "@/src/theme";

const FILTERS = [
  { key: "all", label: "Todos" },
  { key: "draft", label: "Borrador" },
  { key: "in_review", label: "En Revisión" },
  { key: "approved", label: "Aprobado" },
  { key: "signed", label: "Firmado" },
  { key: "active", label: "Activo" },
  { key: "expiring", label: "Por Vencer" },
];

export default function Contracts() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [filter, setFilter] = useState("all");
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.listContracts(filter === "all" ? undefined : filter);
      setItems(data);
    } catch (e) { console.warn(e); }
    setLoading(false); setRefreshing(false);
  }, [filter]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="contracts-screen">
      <View style={styles.header}>
        <Text style={styles.title}>Contratos</Text>
        <Pressable onPress={() => router.push("/contract/new")} style={styles.newBtn} testID="new-contract-button">
          <Ionicons name="add" size={18} color={colors.onBrandPrimary} />
          <Text style={styles.newBtnText}>Nuevo</Text>
        </Pressable>
      </View>

      <View style={styles.chipRowWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.lg }}
          style={styles.chipRow}
        >
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <Pressable
                key={f.key}
                onPress={() => setFilter(f.key)}
                style={[styles.chip, active && styles.chipActive]}
                testID={`filter-${f.key}`}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{f.label}</Text>
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
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brandPrimary} />}
          ListEmptyComponent={<Text style={styles.empty}>Sin contratos para este filtro.</Text>}
          renderItem={({ item }) => <ContractCard item={item} onPress={() => router.push(`/contract/${item.contract_id}` as any)} />}
        />
      )}
    </View>
  );
}

export function ContractCard({ item, onPress }: { item: any; onPress: () => void }) {
  const s = STATUS_COLORS[item.status] || STATUS_COLORS.draft;
  const r = RISK_COLORS[item.risk_level] || RISK_COLORS.low;
  return (
    <Pressable style={styles.card} onPress={onPress} testID={`contract-card-${item.contract_id}`}>
      <View style={styles.cardTop}>
        <View style={[styles.statusPill, { backgroundColor: s.bg }]}>
          <Text style={[styles.statusPillText, { color: s.fg }]}>{s.label.toUpperCase()}</Text>
        </View>
        <View style={[styles.statusPill, { backgroundColor: r.bg, marginLeft: 6 }]}>
          <Text style={[styles.statusPillText, { color: r.fg }]}>RIESGO {r.label.toUpperCase()}</Text>
        </View>
      </View>
      <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
      <Text style={styles.cardSub} numberOfLines={1}>{item.counterparty}</Text>
      <View style={styles.cardBottom}>
        <View>
          <Text style={styles.cardLabel}>VALOR</Text>
          <Text style={styles.cardMono}>{fmtMoney(item.total_value, item.currency)}</Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={styles.cardLabel}>VENCE</Text>
          <Text style={styles.cardMono}>{fmtDate(item.end_date)}</Text>
        </View>
      </View>
    </Pressable>
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
  cardTop: { flexDirection: "row", marginBottom: spacing.sm },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  statusPillText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.8 },
  cardTitle: { fontSize: 16, fontWeight: "700", color: colors.onSurface },
  cardSub: { fontSize: 12, color: colors.onSurfaceSecondary, marginTop: 2 },
  cardBottom: { flexDirection: "row", justifyContent: "space-between", marginTop: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider },
  cardLabel: { fontSize: 9, color: colors.onSurfaceSecondary, letterSpacing: 1, fontWeight: "700" },
  cardMono: { fontFamily: font.mono, fontSize: 13, color: colors.onSurface, fontWeight: "700", marginTop: 2 },
  empty: { textAlign: "center", color: colors.onSurfaceSecondary, marginTop: 40, fontStyle: "italic" },
});
