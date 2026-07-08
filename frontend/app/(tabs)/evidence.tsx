import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, RefreshControl, Dimensions } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";

import { api } from "@/src/api";
import { colors, spacing, radius, font } from "@/src/theme";

const { width } = Dimensions.get("window");
const TILE = (width - spacing.lg * 3) / 2;

export default function EvidenceScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setItems(await api.listEvidence()); } catch (e) { console.warn(e); }
    setLoading(false); setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="evidence-screen">
      <View style={styles.header}>
        <Text style={styles.title}>Evidencias</Text>
        <Text style={styles.subtitle}>{items.length} registros con metadatos GPS + timestamp inmutables</Text>
      </View>
      {loading ? (
        <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: 32 }} />
      ) : (
        <FlatList
          data={items}
          numColumns={2}
          keyExtractor={(it) => it.evidence_id}
          columnWrapperStyle={{ gap: spacing.md }}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 140, gap: spacing.md }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brandPrimary} />}
          ListEmptyComponent={
            <View style={{ alignItems: "center", marginTop: 60 }}>
              <Ionicons name="camera-outline" size={42} color={colors.borderStrong} />
              <Text style={styles.empty}>Aún no hay evidencias. Toca + para registrar.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable style={styles.tile} onPress={() => router.push(`/evidence/${item.evidence_id}` as any)} testID={`evidence-tile-${item.evidence_id}`}>
              <Image source={{ uri: dataUriOf(item.image_base64) }} style={StyleSheet.absoluteFill} contentFit="cover" />
              <LinearGradient colors={["transparent", "rgba(13,20,20,0.85)"]} style={styles.scrim} />
              <View style={styles.metaPill}>
                <Ionicons name="location-outline" size={11} color="#FFF" />
                <Text style={styles.metaText} numberOfLines={1}>
                  {item.latitude != null ? `${item.latitude.toFixed(3)}, ${item.longitude.toFixed(3)}` : "Sin GPS"}
                </Text>
              </View>
              <Text style={styles.timestamp} numberOfLines={1}>{shortTime(item.captured_at)}</Text>
            </Pressable>
          )}
        />
      )}

      <Pressable style={[styles.fab, { bottom: insets.bottom + 88 }]} onPress={() => router.push("/evidence/new")} testID="fab-new-evidence">
        <Ionicons name="add" size={26} color="#FFF" />
      </Pressable>
    </View>
  );
}

function shortTime(iso?: string) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
}

function dataUriOf(b64: string) {
  if (!b64) return "";
  if (b64.startsWith("data:")) return b64;
  return `data:image/jpeg;base64,${b64}`;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  title: { fontSize: 28, fontWeight: "800", color: colors.onSurface },
  subtitle: { fontSize: 12, color: colors.onSurfaceSecondary, marginTop: 2 },
  tile: { width: TILE, height: TILE * 1.1, borderRadius: radius.md, overflow: "hidden", backgroundColor: colors.surfaceTertiary },
  scrim: { position: "absolute", bottom: 0, left: 0, right: 0, height: "60%" },
  metaPill: { position: "absolute", left: 8, bottom: 30, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: "rgba(13,20,20,0.7)", borderRadius: radius.pill, maxWidth: TILE - 16 },
  metaText: { color: "#FFF", fontSize: 10, fontWeight: "600", fontFamily: font.mono },
  timestamp: { position: "absolute", left: 10, bottom: 10, color: "#FFF", fontSize: 11, fontFamily: font.mono, fontWeight: "600" },
  empty: { color: colors.onSurfaceSecondary, marginTop: spacing.md, fontStyle: "italic" },
  fab: { position: "absolute", right: spacing.lg, width: 56, height: 56, borderRadius: 28, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
});
