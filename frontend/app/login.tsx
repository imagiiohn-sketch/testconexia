import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Platform, ScrollView } from "react-native";
import { Image } from "expo-image";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { useAuth } from "@/src/auth";
import { api, saveToken } from "@/src/api";
import { colors, spacing, radius } from "@/src/theme";

export default function Login() {
  const { signInWithToken } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function googleLogin() {
    setErr(null);
    setBusy(true);
    try {
      const redirectUrl =
        Platform.OS === "web"
          ? window.location.origin + "/"
          : Linking.createURL("auth");

      const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;

      if (Platform.OS === "web") {
        window.location.href = authUrl;
        return;
      }

      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
      if (result.type !== "success" || !result.url) {
        setBusy(false);
        return;
      }
      const url = result.url;
      const hashIdx = url.indexOf("#");
      const fragment = hashIdx >= 0 ? url.slice(hashIdx + 1) : "";
      const params = new URLSearchParams(fragment || url.split("?")[1] || "");
      const sessionId = params.get("session_id");
      if (!sessionId) {
        setErr("No session ID returned");
        setBusy(false);
        return;
      }
      const { session_token } = await api.createSession(sessionId);
      await signInWithToken(session_token);
      router.replace("/(tabs)");
    } catch (e: any) {
      setErr(e?.message || "Login failed");
    } finally {
      setBusy(false);
    }
  }

  async function demoLogin() {
    setErr(null);
    setBusy(true);
    try {
      const { session_token } = await api.devLogin();
      await saveToken(session_token);
      await signInWithToken(session_token);
      router.replace("/(tabs)");
    } catch (e: any) {
      setErr(e?.message || "Demo login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
      testID="login-screen"
    >
      <View style={styles.brandWrap}>
        <Image
          source={require("../assets/images/conexia-logo.png")}
          style={styles.logo}
          contentFit="contain"
          testID="conexia-logo"
        />
        <Text style={styles.tagline}>Contract Lifecycle Management</Text>
        <Text style={styles.subtle}>Enterprise-grade. Auditable. Mobile.</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Inicia sesión</Text>
        <Text style={styles.cardSubtitle}>
          Accede a tu panel de contratos, evidencias y aprobaciones.
        </Text>

        <Pressable
          style={({ pressed }) => [styles.btnPrimary, pressed && { opacity: 0.85 }]}
          onPress={googleLogin}
          disabled={busy}
          testID="google-login-button"
        >
          {busy ? (
            <ActivityIndicator color={colors.onBrandPrimary} />
          ) : (
            <>
              <Ionicons name="logo-google" size={18} color={colors.onBrandPrimary} />
              <Text style={styles.btnPrimaryText}>Continuar con Google</Text>
            </>
          )}
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.btnGhost, pressed && { opacity: 0.7 }]}
          onPress={demoLogin}
          disabled={busy}
          testID="demo-login-button"
        >
          <Ionicons name="flash-outline" size={16} color={colors.brandPrimary} />
          <Text style={styles.btnGhostText}>Entrar en modo demo</Text>
        </Pressable>

        {err ? <Text style={styles.err} testID="login-error">{err}</Text> : null}
      </View>

      <Text style={styles.footer}>
        Software Engineering • Product Consulting
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxxl,
    paddingBottom: spacing.xl,
    justifyContent: "space-between",
  },
  brandWrap: { alignItems: "center", marginTop: spacing.xl },
  logo: { width: 200, height: 200 },
  tagline: { fontSize: 16, fontWeight: "600", color: colors.brandPrimary, letterSpacing: 1.5, marginTop: spacing.sm },
  subtle: { fontSize: 12, color: colors.onSurfaceSecondary, marginTop: spacing.xs, letterSpacing: 0.5 },
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTitle: { fontSize: 22, fontWeight: "700", color: colors.onSurface },
  cardSubtitle: { fontSize: 13, color: colors.onSurfaceSecondary, marginTop: spacing.xs, marginBottom: spacing.lg },
  btnPrimary: {
    backgroundColor: colors.brandPrimary,
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 14, borderRadius: radius.md, minHeight: 48,
  },
  btnPrimaryText: { color: colors.onBrandPrimary, fontWeight: "600", fontSize: 15 },
  btnGhost: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 12, marginTop: spacing.sm, minHeight: 44,
  },
  btnGhostText: { color: colors.brandPrimary, fontWeight: "500", fontSize: 13 },
  err: { color: colors.error, marginTop: spacing.sm, fontSize: 12, textAlign: "center" },
  footer: { textAlign: "center", color: colors.onSurfaceSecondary, fontSize: 10, letterSpacing: 1.5, marginTop: spacing.xl },
});
