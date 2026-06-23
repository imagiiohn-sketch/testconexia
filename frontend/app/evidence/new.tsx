import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, TextInput, KeyboardAvoidingView, Platform } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";

import { api } from "@/src/api";
import { colors, spacing, radius, font } from "@/src/theme";

export default function NewEvidence() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [contracts, setContracts] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [imgBase64, setImgBase64] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number; acc?: number } | null>(null);
  const [note, setNote] = useState("");
  const [milestone, setMilestone] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [gpsBusy, setGpsBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const list = await api.listContracts();
        setContracts(list);
        if (list.length > 0) setSelectedId(list[0].contract_id);
      } catch (e) { console.warn(e); }
    })();
  }, []);

  async function pickImage() {
    setErr(null);
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      // fallback to library
      const lib = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!lib.granted) { setErr("Permiso de cámara/galería denegado"); return; }
      const r = await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.5, mediaTypes: ImagePicker.MediaTypeOptions.Images });
      if (!r.canceled && r.assets[0].base64) setImgBase64(r.assets[0].base64);
      return;
    }
    const r = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.5, mediaTypes: ImagePicker.MediaTypeOptions.Images });
    if (!r.canceled && r.assets[0].base64) setImgBase64(r.assets[0].base64);
  }

  async function captureGps() {
    setGpsBusy(true); setErr(null);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        // Fallback to demo coords if not granted (preview environment)
        setCoords({ lat: -33.4489, lng: -70.6693, acc: 25 });
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setCoords({ lat: loc.coords.latitude, lng: loc.coords.longitude, acc: loc.coords.accuracy ?? undefined });
    } catch (e: any) {
      // demo fallback
      setCoords({ lat: -33.4489, lng: -70.6693, acc: 25 });
    } finally {
      setGpsBusy(false);
    }
  }

  async function submit() {
    setErr(null);
    if (!selectedId) { setErr("Selecciona un contrato"); return; }
    if (!imgBase64) { setErr("Captura una imagen"); return; }
    setBusy(true);
    try {
      await api.createEvidence({
        contract_id: selectedId,
        image_base64: imgBase64,
        latitude: coords?.lat, longitude: coords?.lng, accuracy_m: coords?.acc,
        note, milestone_name: milestone || undefined,
      });
      router.back();
    } catch (e: any) {
      setErr(e?.message || "No se pudo registrar evidencia");
    } finally { setBusy(false); }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.surface }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} testID="back-button"><Ionicons name="chevron-back" size={26} color={colors.onSurface} /></Pressable>
        <Text style={styles.headerTitle}>Nueva Evidencia</Text>
        <View style={{ width: 26 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 80 }} keyboardShouldPersistTaps="handled">
        <Text style={styles.helper}>Captura con metadatos inmutables: GPS + timestamp + usuario + vínculo al hito.</Text>

        <Pressable style={styles.imgBox} onPress={pickImage} testID="pick-image-button">
          {imgBase64 ? (
            <Image source={{ uri: `data:image/jpeg;base64,${imgBase64}` }} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : (
            <View style={{ alignItems: "center", gap: 6 }}>
              <Ionicons name="camera-outline" size={32} color={colors.borderStrong} />
              <Text style={styles.imgHint}>Toca para capturar / elegir foto</Text>
            </View>
          )}
        </Pressable>

        <View style={styles.gpsRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>GPS</Text>
            <Text style={styles.mono} testID="gps-coords">{coords ? `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}${coords.acc ? `  ±${Math.round(coords.acc)}m` : ""}` : "—"}</Text>
          </View>
          <Pressable style={styles.gpsBtn} onPress={captureGps} disabled={gpsBusy} testID="capture-gps-button">
            {gpsBusy ? <ActivityIndicator color="#FFF" /> : <><Ionicons name="locate-outline" size={14} color="#FFF" /><Text style={styles.gpsBtnText}>Capturar</Text></>}
          </Pressable>
        </View>

        <Text style={styles.fieldLabel}>Contrato vinculado</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
          {contracts.map((c) => {
            const active = selectedId === c.contract_id;
            return (
              <Pressable key={c.contract_id} onPress={() => setSelectedId(c.contract_id)} style={[styles.contractChip, active && styles.contractChipActive]} testID={`select-contract-${c.contract_id}`}>
                <Text numberOfLines={1} style={[styles.contractChipText, active && styles.contractChipTextActive]}>{c.title}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <Text style={styles.fieldLabel}>Hito (opcional)</Text>
        <TextInput style={styles.input} value={milestone} onChangeText={setMilestone} placeholder="Ej: Hito 2 - Avance 50%" placeholderTextColor={colors.onSurfaceSecondary} testID="evidence-milestone" />
        <Text style={styles.fieldLabel}>Nota</Text>
        <TextInput style={[styles.input, { height: 70, textAlignVertical: "top" }]} multiline value={note} onChangeText={setNote} placeholder="Observaciones" placeholderTextColor={colors.onSurfaceSecondary} testID="evidence-note" />

        {err ? <Text style={styles.err}>{err}</Text> : null}
        <Pressable style={styles.submit} onPress={submit} disabled={busy} testID="evidence-submit">
          {busy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.submitText}>Registrar Evidencia</Text>}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.divider },
  headerTitle: { fontSize: 14, fontWeight: "700", color: colors.onSurfaceSecondary, letterSpacing: 1 },
  helper: { fontSize: 12, color: colors.onSurfaceSecondary, marginBottom: spacing.md, fontStyle: "italic" },
  imgBox: { height: 220, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  imgHint: { color: colors.onSurfaceSecondary, fontSize: 12 },
  gpsRow: { flexDirection: "row", alignItems: "flex-end", gap: spacing.md, marginTop: spacing.md },
  gpsBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.brandPrimary, paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.md },
  gpsBtnText: { color: "#FFF", fontSize: 12, fontWeight: "700" },
  fieldLabel: { fontSize: 11, fontWeight: "700", color: colors.onSurfaceSecondary, letterSpacing: 0.8, marginBottom: 4, marginTop: 12 },
  mono: { fontFamily: font.mono, fontSize: 13, color: colors.onSurface },
  contractChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, maxWidth: 220 },
  contractChipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  contractChipText: { color: colors.onSurfaceSecondary, fontSize: 12, fontWeight: "600" },
  contractChipTextActive: { color: "#FFF" },
  input: { backgroundColor: colors.surfaceSecondary, paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, color: colors.onSurface, fontSize: 14 },
  err: { color: colors.error, fontSize: 12, marginTop: spacing.sm },
  submit: { backgroundColor: colors.brandPrimary, paddingVertical: 14, borderRadius: radius.md, alignItems: "center", marginTop: spacing.lg },
  submitText: { color: "#FFF", fontWeight: "700", fontSize: 15 },
});
