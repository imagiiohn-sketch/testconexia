import { useEffect } from "react";
import { Redirect } from "expo-router";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { useAuth } from "@/src/auth";
import { api } from "@/src/api";
import { colors } from "@/src/theme";

export default function Index() {
  const { user, loading } = useAuth();

  // Auto-seed disabled — production mode. Re-enable manually via POST /api/seed if needed.
  useEffect(() => {}, []);

  if (loading) {
    return (
      <View style={styles.container} testID="splash-loading">
        <ActivityIndicator color={colors.brandPrimary} size="large" />
      </View>
    );
  }
  if (!user) return <Redirect href="/login" />;
  return <Redirect href="/(tabs)" />;
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
});
