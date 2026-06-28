import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { api } from "@/src/api";
import { colors, spacing, radius, font, fmtDate } from "@/src/theme";

type Notif = {
  id: string;
  type: "expiration" | "penalty" | "workflow_rejected" | "esf_pending";
  level: "high" | "medium" | "low";
  title: string;
  message: string;
  contract_id?: string;
  contract_number?: string;
  at?: string;
};

const TYPE_ICON: Record<string, any> = {
  expiration: "time-outline",
  penalty: "alert-circle-outline",
  workflow_rejected: "close-circle-outline",
  esf_pending: "leaf-outline",
};

const LEVEL_COLOR: Record<string, string> = {
  high: colors.error,
  medium: colors.warning,
  low: colors.info,
};

export default function Notifications() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [items, setItems] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.notifications();
      setItems(r.items || []);
    } catch (e) { console.warn(e); }
    setLoading(false); setRefreshing(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }} testID="notifications-screen">
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} testID="back-button">
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Notificaciones</Text>
        <View style={{ width: 26 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: 32 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => it.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 80 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brandPrimary} />}
          ListEmptyComponent={
            <View style={{ alignItems: "center", marginTop: 80 }}>
              <Ionicons name="checkmark-done-circle-outline" size={56} color={colors.borderStrong} />
              <Text style={styles.empty}>Sin notificaciones pendientes</Text>
              <Text style={styles.emptySub}>Todo bajo control. Te avisaremos cuando haya vencimientos, multas o aprobaciones pendientes.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.card}
              onPress={() => item.contract_id ? router.push(`/contract/${item.contract_id}` as any) : null}
              testID={`notif-${item.id}`}
            >
              <View style={[styles.iconWrap, { backgroundColor: LEVEL_COLOR[item.level] + "22" }]}>
                <Ionicons name={TYPE_ICON[item.type] || "alert-outline"} size={20} color={LEVEL_COLOR[item.level]} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.row}>
                  <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
                  <View style={[styles.levelPill, { backgroundColor: LEVEL_COLOR[item.level] }]}>
                    <Text style={styles.levelText}>{item.level.toUpperCase()}</Text>
                  </View>
                </View>
                <Text style={styles.msg} numberOfLines={2}>{item.message}</Text>
                <View style={styles.meta}>
                  {item.contract_number ? <Text style={styles.metaText}>{item.contract_number}</Text> : null}
                  {item.at ? <Text style={styles.metaText}>{fmtDate(item.at)}</Text> : null}
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceSecondary} />
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.divider },
  headerTitle: { fontSize: 14, fontWeight: "700", color: colors.onSurfaceSecondary, letterSpacing: 1 },
  card: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm },
  iconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6 },
  title: { flex: 1, fontSize: 14, fontWeight: "700", color: colors.onSurface },
  levelPill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.pill },
  levelText: { fontSize: 9, fontWeight: "800", color: "#FFF", letterSpacing: 0.6 },
  msg: { fontSize: 12, color: colors.onSurfaceSecondary, marginTop: 2 },
  meta: { flexDirection: "row", gap: 8, marginTop: 4 },
  metaText: { fontSize: 10, color: colors.onSurfaceSecondary, fontFamily: font.mono },
  empty: { fontSize: 16, fontWeight: "700", color: colors.onSurface, marginTop: spacing.md },
  emptySub: { fontSize: 12, color: colors.onSurfaceSecondary, textAlign: "center", paddingHorizontal: 24, marginTop: spacing.sm, lineHeight: 17 },
});
