import React from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { useAuth } from "@/src/auth";
import { useT } from "@/src/i18n";
import { api } from "@/src/api";
import { colors, spacing, radius } from "@/src/theme";

export default function Profile() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { t, lang, setLang } = useT();

  async function changeLang(l: "es" | "en") {
    setLang(l);
    try { await api.setLocale(l); } catch { /* ignore */ }
  }

  async function logout() {
    await signOut();
    router.replace("/login");
  }

  return (
    <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing.md, paddingBottom: 140 }} style={styles.root} testID="profile-screen">
      <View style={styles.headRow}>
        <Image source={user?.picture ? { uri: user.picture } : require("../../assets/images/conexia-logo.png")} style={styles.avatar} contentFit={user?.picture ? "cover" : "contain"} />
        <View>
          <Text style={styles.name}>{user?.name || "—"}</Text>
          <Text style={styles.email}>{user?.email}</Text>
          <View style={styles.rolePill}><Text style={styles.roleText}>{(user?.role || "").toUpperCase()}</Text></View>
        </View>
      </View>

      <Section title={t("profile.language")}>
        <View style={styles.langRow}>
          <Pressable style={[styles.langBtn, lang === "es" && styles.langBtnActive]} onPress={() => changeLang("es")} testID="lang-es">
            <Text style={[styles.langTxt, lang === "es" && styles.langTxtActive]}>Español</Text>
          </Pressable>
          <Pressable style={[styles.langBtn, lang === "en" && styles.langBtnActive]} onPress={() => changeLang("en")} testID="lang-en">
            <Text style={[styles.langTxt, lang === "en" && styles.langTxtActive]}>English</Text>
          </Pressable>
        </View>
      </Section>

      <Section title={t("profile.account")}>
        <Row icon="briefcase-outline" label={t("profile.department")} value={user?.department || "—"} />
        <Row icon="shield-checkmark-outline" label={t("profile.role")} value={user?.role || "—"} />
        <Row icon="globe-outline" label={t("profile.region")} value="eIDAS/UETA" last />
      </Section>

      <Section title={t("profile.platform")}>
        <Row icon="notifications-outline" label={t("profile.notif")} value={t("profile.notif.value")} />
        <Row icon="document-lock-outline" label={t("profile.esign")} value={t("profile.esign.value")} />
        <Row icon="server-outline" label={t("profile.storage")} value={t("profile.storage.value")} last />
      </Section>

      <Section title={t("profile.help")}>
        <Pressable style={styles.row} onPress={() => router.push("/instructivo")} testID="open-instructivo">
          <Ionicons name="book-outline" size={18} color={colors.brandPrimary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.rowLabel}>{t("profile.help.value")}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceSecondary} />
        </Pressable>
      </Section>

      <Pressable style={styles.logoutBtn} onPress={logout} testID="logout-button">
        <Ionicons name="log-out-outline" size={18} color={colors.error} />
        <Text style={styles.logoutText}>{t("profile.logout")}</Text>
      </Pressable>

      <Text style={styles.footer}>{t("profile.footer")}</Text>
    </ScrollView>
  );
}

function Section({ title, children }: any) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}
function Row({ icon, label, value, last }: any) {
  return (
    <View style={[styles.row, !last && styles.rowDivider]}>
      <Ionicons name={icon} size={18} color={colors.brandPrimary} />
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowValue}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  headRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, marginBottom: spacing.xl },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  name: { fontSize: 18, fontWeight: "800", color: colors.onSurface },
  email: { fontSize: 12, color: colors.onSurfaceSecondary, marginTop: 2 },
  rolePill: { alignSelf: "flex-start", marginTop: 6, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: colors.brandTertiary },
  roleText: { color: colors.brandPrimary, fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  section: { paddingHorizontal: spacing.lg, marginBottom: spacing.lg },
  sectionTitle: { fontSize: 11, fontWeight: "700", color: colors.onSurfaceSecondary, letterSpacing: 1.2, marginBottom: spacing.sm },
  sectionCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  rowLabel: { fontSize: 11, color: colors.onSurfaceSecondary, fontWeight: "600" },
  rowValue: { fontSize: 14, color: colors.onSurface, fontWeight: "600", marginTop: 1 },
  langRow: { flexDirection: "row", padding: spacing.sm, gap: spacing.sm },
  langBtn: { flex: 1, paddingVertical: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: "center", backgroundColor: "#FFF" },
  langBtnActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  langTxt: { color: colors.onSurface, fontWeight: "700" },
  langTxtActive: { color: "#FFF" },
  logoutBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginHorizontal: spacing.lg, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.error, marginTop: spacing.md },
  logoutText: { color: colors.error, fontWeight: "700" },
  footer: { textAlign: "center", color: colors.onSurfaceSecondary, fontSize: 10, letterSpacing: 1.5, marginTop: spacing.xl },
});
