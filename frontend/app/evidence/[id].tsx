import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { api } from "@/src/api";
import { colors, spacing, radius, font, fmtDate } from "@/src/theme";

export default function EvidenceDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [data, setData] = useState<any | null>(null);

  useEffect(() => { if (id) api.getEvidence(id).then(setData).catch(console.warn); }, [id]);

  if (!data) return <View style={[styles.root, { justifyContent: "center" }]}><ActivityIndicator color={colors.brandPrimary} /></View>;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="evidence-detail-screen">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} testID="back-button"><Ionicons name="chevron-back" size={26} color={colors.onSurface} /></Pressable>
        <Text style={styles.headerTitle}>Evidencia</Text>
        <View style={{ width: 26 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 80 }}>
        <Image source={{ uri: `data:image/jpeg;base64,${data.image_base64}` }} style={styles.image} contentFit="cover" />
        <Row label="CAPTURADA POR" value={data.captured_by_name || "—"} />
        <Row label="FECHA" value={fmtDate(data.captured_at)} mono />
        <Row label="GPS" value={data.latitude != null ? `${data.latitude.toFixed(5)}, ${data.longitude.toFixed(5)}${data.accuracy_m ? `  ±${Math.round(data.accuracy_m)}m` : ""}` : "—"} mono />
        <Row label="HITO" value={data.milestone_name || "—"} />
        <Row label="HASH INMUTABLE" value={data.immutable_hash} mono />
        {data.note ? <Row label="NOTA" value={data.note} /> : null}
        <Pressable style={styles.linkBtn} onPress={() => router.push(`/contract/${data.contract_id}` as any)} testID="open-contract-button">
          <Ionicons name="document-text-outline" size={16} color={colors.brandPrimary} />
          <Text style={styles.linkBtnText}>Ir al contrato vinculado</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, mono && { fontFamily: font.mono }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider },
  headerTitle: { fontSize: 14, fontWeight: "700", color: colors.onSurfaceSecondary, letterSpacing: 1 },
  image: { width: "100%", height: 280, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary, marginBottom: spacing.lg },
  row: { paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.divider },
  rowLabel: { fontSize: 10, color: colors.onSurfaceSecondary, fontWeight: "800", letterSpacing: 1 },
  rowValue: { fontSize: 14, color: colors.onSurface, fontWeight: "600", marginTop: 2 },
  linkBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: spacing.xl, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.brandPrimary },
  linkBtnText: { color: colors.brandPrimary, fontWeight: "700" },
});
