import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Platform, ScrollView, TextInput, KeyboardAvoidingView } from "react-native";
import { Image } from "expo-image";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { useAuth } from "@/src/auth";
import { api, saveToken } from "@/src/api";
import { useT } from "@/src/i18n";
import { colors, spacing, radius } from "@/src/theme";

type Tab = "signin" | "signup";

export default function Login() {
  const { signInWithToken } = useAuth();
  const router = useRouter();
  const { t, lang, setLang } = useT();
  const [tab, setTab] = useState<Tab>("signin");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [department, setDepartment] = useState("");

  async function emailFlow() {
    setErr(null);
    if (!email.trim() || !password) { setErr(t("newc.err.required")); return; }
    setBusy(true);
    try {
      const res = tab === "signin"
        ? await api.loginEmail({ email: email.trim(), password })
        : await api.register({ email: email.trim(), password, name: name.trim() || email.split("@")[0], department });
      await saveToken(res.session_token);
      await signInWithToken(res.session_token);
      router.replace("/(tabs)");
    } catch (e: any) { setErr(e?.message || "Error"); }
    finally { setBusy(false); }
  }

  async function googleLogin() {
    setErr(null); setBusy(true);
    try {
      const redirectUrl = Platform.OS === "web" ? window.location.origin + "/" : Linking.createURL("auth");
      const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
      if (Platform.OS === "web") { window.location.href = authUrl; return; }
      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
      if (result.type !== "success" || !result.url) { setBusy(false); return; }
      const url = result.url;
      const hashIdx = url.indexOf("#");
      const fragment = hashIdx >= 0 ? url.slice(hashIdx + 1) : "";
      const params = new URLSearchParams(fragment || url.split("?")[1] || "");
      const sessionId = params.get("session_id");
      if (!sessionId) { setErr("No session"); setBusy(false); return; }
      const { session_token } = await api.createSession(sessionId);
      await signInWithToken(session_token);
      router.replace("/(tabs)");
    } catch (e: any) { setErr(e?.message || "Login failed"); }
    finally { setBusy(false); }
  }

  async function demoLogin() {
    setErr(null); setBusy(true);
    try {
      const { session_token } = await api.devLogin();
      await saveToken(session_token);
      await signInWithToken(session_token);
      router.replace("/(tabs)");
    } catch (e: any) { setErr(e?.message || "Demo failed"); }
    finally { setBusy(false); }
  }

  function comingSoon(provider: string) {
    setErr(`${provider}: ${t("login.provider.hint")}`);
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.surface }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled" testID="login-screen">
        <View style={styles.brandWrap}>
          <View style={styles.langSwitchWrap}>
            <Pressable onPress={() => setLang(lang === "es" ? "en" : "es")} style={styles.langSwitch} testID="lang-switch">
              <Ionicons name="language-outline" size={14} color={colors.brandPrimary} />
              <Text style={styles.langSwitchText}>{lang === "es" ? "EN" : "ES"}</Text>
            </Pressable>
          </View>
          <Image source={require("../assets/images/conexia-logo.png")} style={styles.logo} contentFit="contain" testID="conexia-logo" />
          <Text style={styles.tagline}>{t("app.tagline")}</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.tabRow}>
            <Pressable style={[styles.tab, tab === "signin" && styles.tabActive]} onPress={() => setTab("signin")} testID="tab-signin">
              <Text style={[styles.tabText, tab === "signin" && styles.tabTextActive]}>{t("login.tab.signin")}</Text>
            </Pressable>
            <Pressable style={[styles.tab, tab === "signup" && styles.tabActive]} onPress={() => setTab("signup")} testID="tab-signup">
              <Text style={[styles.tabText, tab === "signup" && styles.tabTextActive]}>{t("login.tab.signup")}</Text>
            </Pressable>
          </View>

          {tab === "signup" ? (
            <>
              <TextInput style={styles.input} placeholder={t("login.name")} placeholderTextColor={colors.onSurfaceSecondary} value={name} onChangeText={setName} autoCapitalize="words" testID="input-name" />
              <TextInput style={styles.input} placeholder={t("login.department")} placeholderTextColor={colors.onSurfaceSecondary} value={department} onChangeText={setDepartment} testID="input-department" />
            </>
          ) : null}
          <TextInput style={styles.input} placeholder={t("login.email")} placeholderTextColor={colors.onSurfaceSecondary} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} testID="input-email" />
          <TextInput style={styles.input} placeholder={t("login.password")} placeholderTextColor={colors.onSurfaceSecondary} value={password} onChangeText={setPassword} secureTextEntry testID="input-password" />
          {tab === "signup" ? <Text style={styles.hint}>{t("login.password.hint")}</Text> : null}

          <Pressable style={({ pressed }) => [styles.btnPrimary, pressed && { opacity: 0.85 }]} onPress={emailFlow} disabled={busy} testID="email-submit-button">
            {busy ? <ActivityIndicator color={colors.onBrandPrimary} /> : (
              <>
                <Ionicons name="mail-outline" size={16} color="#FFF" />
                <Text style={styles.btnPrimaryText}>{tab === "signin" ? t("login.submit.signin") : t("login.submit.signup")}</Text>
              </>
            )}
          </Pressable>

          <View style={styles.divider}><View style={styles.dividerLine} /><Text style={styles.dividerText}>{t("login.divider")}</Text><View style={styles.dividerLine} /></View>

          <View style={styles.providerRow}>
            <ProviderIcon icon="logo-google" label="Google" onPress={googleLogin} testID="google-login-button" />
            <ProviderIcon icon="logo-microsoft" label="Microsoft" onPress={() => comingSoon("Microsoft")} testID="microsoft-login-button" muted />
            <ProviderIcon icon="logo-apple" label="Apple" onPress={() => comingSoon("Apple")} testID="apple-login-button" muted />
            <ProviderIcon icon="logo-yahoo" label="Yahoo" onPress={() => comingSoon("Yahoo")} testID="yahoo-login-button" muted />
            <ProviderIcon icon="business-outline" label="SSO" onPress={() => comingSoon("SSO")} testID="sso-login-button" muted />
          </View>
          <Text style={styles.providerHint}>{t("login.provider.hint")}</Text>

          <Pressable style={styles.demoBtn} onPress={demoLogin} disabled={busy} testID="demo-login-button">
            <Ionicons name="flash-outline" size={14} color={colors.brandPrimary} />
            <Text style={styles.demoBtnText}>{t("login.demo")}</Text>
          </Pressable>

          {err ? <Text style={styles.err} testID="login-error">{err}</Text> : null}
        </View>

        <Text style={styles.footer}>Software Engineering • Product Consulting</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function ProviderIcon({ icon, label, onPress, testID, muted }: { icon: any; label: string; onPress: () => void; testID?: string; muted?: boolean }) {
  return (
    <Pressable style={({ pressed }) => [styles.providerCircle, muted && { backgroundColor: colors.surfaceTertiary, borderColor: colors.border }, pressed && { opacity: 0.7 }]} onPress={onPress} testID={testID} accessibilityLabel={label}>
      <Ionicons name={icon} size={20} color={muted ? colors.onSurfaceSecondary : colors.onSurface} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: colors.surface, paddingHorizontal: spacing.xl, paddingTop: spacing.xl, paddingBottom: spacing.xl },
  brandWrap: { alignItems: "center", marginTop: spacing.md, position: "relative" },
  langSwitchWrap: { position: "absolute", top: 0, right: 0 },
  langSwitch: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: colors.brandTertiary, borderRadius: radius.pill },
  langSwitchText: { color: colors.brandPrimary, fontSize: 12, fontWeight: "800", letterSpacing: 1 },
  logo: { width: 180, height: 180, alignSelf: "center" },
  tagline: { fontSize: 13, fontWeight: "700", color: colors.brandPrimary, letterSpacing: 1.5, marginTop: spacing.md, textAlign: "center", alignSelf: "center" },
  subtle: { fontSize: 11, color: colors.onSurfaceSecondary, marginTop: 2, letterSpacing: 0.5, textAlign: "center", alignSelf: "center" },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, marginTop: spacing.lg },
  tabRow: { flexDirection: "row", backgroundColor: colors.surfaceTertiary, borderRadius: radius.pill, padding: 3, marginBottom: spacing.md },
  tab: { flex: 1, paddingVertical: 8, borderRadius: radius.pill, alignItems: "center" },
  tabActive: { backgroundColor: colors.brandPrimary },
  tabText: { fontSize: 12, fontWeight: "700", color: colors.onSurfaceSecondary },
  tabTextActive: { color: "#FFF" },
  input: { backgroundColor: "#FFF", paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, color: colors.onSurface, fontSize: 14, marginBottom: 8 },
  hint: { color: colors.onSurfaceSecondary, fontSize: 10, marginBottom: 8, fontStyle: "italic" },
  btnPrimary: { backgroundColor: colors.brandPrimary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: radius.md, minHeight: 44 },
  btnPrimaryText: { color: colors.onBrandPrimary, fontWeight: "700", fontSize: 14 },
  divider: { flexDirection: "row", alignItems: "center", marginVertical: 12, gap: 8 },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { fontSize: 10, color: colors.onSurfaceSecondary, letterSpacing: 1, fontWeight: "700" },
  providerRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 4, gap: 8 },
  providerCircle: { flex: 1, aspectRatio: 1, maxWidth: 52, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#FFF", borderWidth: 1, borderColor: colors.border },
  providerHint: { color: colors.onSurfaceSecondary, fontSize: 10, fontStyle: "italic", textAlign: "center", marginTop: 6 },
  demoBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 10, marginTop: 8 },
  demoBtnText: { color: colors.brandPrimary, fontWeight: "600", fontSize: 12 },
  err: { color: colors.error, marginTop: 6, fontSize: 11, textAlign: "center" },
  footer: { textAlign: "center", color: colors.onSurfaceSecondary, fontSize: 10, letterSpacing: 1.5, marginTop: spacing.lg },
});
