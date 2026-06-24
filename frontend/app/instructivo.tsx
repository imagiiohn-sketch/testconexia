import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { useT } from "@/src/i18n";
import { colors, spacing, radius } from "@/src/theme";

const SECTIONS_ES = [
  { title: "Bienes", body: "Proyecto · Contrato · Proveedor · Monto Original · Monto Vigente · Fecha Inicio · Fecha Fin · % Avance · Pagado · Saldo · Garantía · Observaciones" },
  { title: "Obras", body: "Proyecto · Contrato · Contratista · Monto Original · Monto Vigente · Fecha Inicio · Fecha Fin · % Avance Físico · % Avance Financiero · Órdenes de Cambio · Prórrogas · Observaciones" },
  { title: "Servicios No Consultoría", body: "Proyecto · Contrato · Proveedor · Servicio · Monto · Fecha Inicio · Fecha Fin · Pagado · Incidencias · Observaciones" },
  { title: "Consultor Individual", body: "Proyecto · Consultor · Producto · Fecha Programada · Fecha Entrega · % Pago · Estado · Observaciones" },
  { title: "Firma Consultora", body: "Proyecto · Firma · Entregable · Fecha Programada · Fecha Entrega · % Pago · Personal Clave · Estado" },
  { title: "Acuerdo Marco", body: "Proyecto · Proveedor · Monto Máximo · Monto Ejecutado · Saldo · Órdenes Emitidas · Observaciones" },
  { title: "Riesgos", body: "Contrato · Riesgo · Probabilidad · Impacto · Mitigación · Responsable · Estado" },
  { title: "Modificaciones", body: "Contrato · Tipo · Fecha · Monto · Días · Justificación · Aprobación" },
  { title: "Pagos", body: "Contrato · Factura · Fecha · Monto · Entregable Asociado · Estado" },
  { title: "ESF Ambiental-Social", body: "Contrato · Requisito ESF · Cumple · Fecha Verificación · Observaciones" },
];
const SECTIONS_EN = [
  { title: "Goods", body: "Project · Contract · Vendor · Original Amount · Current Amount · Start · End · % Progress · Paid · Balance · Warranty · Notes" },
  { title: "Works", body: "Project · Contract · Contractor · Original · Current · Start · End · % Physical · % Financial · Change Orders · Extensions · Notes" },
  { title: "Non-Consultancy Services", body: "Project · Contract · Vendor · Service · Amount · Start · End · Paid · Incidents · Notes" },
  { title: "Individual Consultant", body: "Project · Consultant · Product · Scheduled · Delivery · % Pay · Status · Notes" },
  { title: "Consulting Firm", body: "Project · Firm · Deliverable · Scheduled · Delivery · % Pay · Key Staff · Status" },
  { title: "Framework Agreement", body: "Project · Vendor · Max Amount · Executed · Balance · Orders Issued · Notes" },
  { title: "Risks", body: "Contract · Risk · Probability · Impact · Mitigation · Responsible · Status" },
  { title: "Modifications", body: "Contract · Type · Date · Amount · Days · Justification · Approval" },
  { title: "Payments", body: "Contract · Invoice · Date · Amount · Linked Deliverable · Status" },
  { title: "Environmental-Social (ESF)", body: "Contract · ESF Requirement · Compliant · Verification Date · Notes" },
];

export default function Instructivo() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t, lang } = useT();
  const sections = lang === "en" ? SECTIONS_EN : SECTIONS_ES;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} testID="back-button"><Ionicons name="chevron-back" size={26} color={colors.onSurface} /></Pressable>
        <Text style={styles.headerTitle}>{t("instr.title")}</Text>
        <View style={{ width: 26 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 80 }} testID="instructivo-screen">
        <Text style={styles.intro}>{t("instr.intro")}</Text>
        <Text style={styles.sectionTitle}>{t("instr.cat.title")}</Text>
        {sections.map((s, i) => (
          <View key={i} style={styles.card}>
            <Text style={styles.cardTitle}>{s.title}</Text>
            <Text style={styles.cardBody}>{s.body}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.divider },
  headerTitle: { fontSize: 14, fontWeight: "700", color: colors.onSurfaceSecondary, letterSpacing: 1 },
  intro: { fontSize: 13, color: colors.onSurface, marginBottom: spacing.md, lineHeight: 18 },
  sectionTitle: { fontSize: 11, fontWeight: "800", color: colors.brandPrimary, letterSpacing: 1.2, marginBottom: spacing.sm, marginTop: spacing.md },
  card: { backgroundColor: colors.surfaceSecondary, padding: spacing.md, borderRadius: radius.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border, borderLeftWidth: 3, borderLeftColor: colors.brandPrimary },
  cardTitle: { fontSize: 14, fontWeight: "700", color: colors.onSurface },
  cardBody: { fontSize: 12, color: colors.onSurfaceSecondary, marginTop: 4, lineHeight: 17 },
});
