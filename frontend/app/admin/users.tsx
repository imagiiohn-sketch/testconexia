import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, TextInput, ActivityIndicator, ScrollView, Modal, KeyboardAvoidingView, Platform } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, spacing, radius, font } from "@/src/theme";
import { useAuth } from "@/src/auth";

const ROLES = ["admin", "coordinador_general", "adquisiciones", "financiero", "monitoreo", "field"];
const ROLE_LABEL: Record<string, string> = {
  admin: "Administrador",
  coordinador_general: "Coordinador General",
  adquisiciones: "Adquisiciones",
  financiero: "Financiero",
  monitoreo: "Monitoreo",
  field: "Campo",
};

export default function AdminUsers() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("monitoreo");
  const [dept, setDept] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setUsers(await api.adminListUsers()); } catch (e: any) { setErr(e?.message || "error"); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  function openCreate() { setEditing(null); setEmail(""); setName(""); setPassword(""); setRole("monitoreo"); setDept(""); setErr(null); setShowForm(true); }
  function openEdit(u: any) { setEditing(u); setEmail(u.email); setName(u.name); setPassword(""); setRole(u.role); setDept(u.department || ""); setErr(null); setShowForm(true); }

  async function save() {
    setErr(null); setBusy(true);
    try {
      if (editing) {
        const body: any = { name, role, department: dept };
        if (password) body.password = password;
        await api.adminUpdateUser(editing.user_id, body);
      } else {
        await api.adminCreateUser({ email, name, password, role, department: dept });
      }
      setShowForm(false); await load();
    } catch (e: any) { setErr(e?.message || "error"); }
    finally { setBusy(false); }
  }
  async function remove(u: any) {
    if (u.user_id === user?.user_id) { setErr("No puedes eliminarte"); return; }
    try { await api.adminDeleteUser(u.user_id); await load(); } catch (e: any) { setErr(e?.message || "error"); }
  }

  if (user?.role !== "admin") {
    return (
      <View style={[styles.root, { paddingTop: insets.top, alignItems: "center", justifyContent: "center" }]}>
        <Ionicons name="lock-closed-outline" size={48} color={colors.borderStrong} />
        <Text style={styles.deny}>Requiere rol Administrador</Text>
        <Pressable style={styles.backBtn} onPress={() => router.back()}><Text style={styles.backTxt}>Volver</Text></Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="admin-users-screen">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}><Ionicons name="chevron-back" size={26} color={colors.onSurface} /></Pressable>
        <Text style={styles.headerTitle}>Administración</Text>
        <Pressable onPress={openCreate} testID="admin-new-user"><Ionicons name="person-add-outline" size={22} color={colors.brandPrimary} /></Pressable>
      </View>
      {err ? <Text style={styles.err}>{err}</Text> : null}
      {loading ? <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: 32 }} /> : (
        <FlatList
          data={users}
          keyExtractor={(u) => u.user_id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}
          renderItem={({ item }) => (
            <View style={styles.card} testID={`user-${item.email}`}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.email}>{item.email}</Text>
                <View style={styles.pillRow}>
                  <View style={styles.rolePill}><Text style={styles.roleText}>{ROLE_LABEL[item.role] || item.role}</Text></View>
                  {item.department ? <Text style={styles.dept}>· {item.department}</Text> : null}
                </View>
              </View>
              <Pressable onPress={() => openEdit(item)} style={styles.iconBtn}><Ionicons name="create-outline" size={20} color={colors.brandPrimary} /></Pressable>
              <Pressable onPress={() => remove(item)} style={styles.iconBtn}><Ionicons name="trash-outline" size={20} color={colors.error} /></Pressable>
            </View>
          )}
        />
      )}
      <Modal visible={showForm} animationType="slide" transparent onRequestClose={() => setShowForm(false)}>
        <Pressable style={styles.backdrop} onPress={() => setShowForm(false)} />
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.sheet}>
          <View style={styles.handle} />
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.formTitle}>{editing ? "Editar usuario" : "Nuevo usuario"}</Text>
            {!editing ? <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" /> : null}
            <Field label="Nombre" value={name} onChangeText={setName} />
            <Field label={editing ? "Nueva contraseña (opcional)" : "Contraseña"} value={password} onChangeText={setPassword} secureTextEntry />
            <Field label="Departamento" value={dept} onChangeText={setDept} />
            <Text style={styles.label}>Rol</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }} style={{ marginBottom: spacing.md }}>
              {ROLES.map((r) => (
                <Pressable key={r} onPress={() => setRole(r)} style={[styles.chip, role === r && styles.chipActive]} testID={`role-${r}`}>
                  <Text style={[styles.chipText, role === r && styles.chipTextActive]}>{ROLE_LABEL[r]}</Text>
                </Pressable>
              ))}
            </ScrollView>
            {err ? <Text style={styles.err}>{err}</Text> : null}
            <Pressable style={styles.submit} onPress={save} disabled={busy} testID="admin-save-user">
              {busy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.submitText}>{editing ? "Guardar cambios" : "Crear usuario"}</Text>}
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function Field({ label, ...rest }: any) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput style={styles.input} placeholderTextColor={colors.onSurfaceSecondary} {...rest} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider },
  headerTitle: { fontSize: 16, fontWeight: "700", color: colors.onSurface },
  card: { flexDirection: "row", alignItems: "center", gap: 8, padding: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border },
  name: { fontSize: 14, fontWeight: "700", color: colors.onSurface },
  email: { fontSize: 11, color: colors.onSurfaceSecondary, marginTop: 1, fontFamily: font.mono },
  pillRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  rolePill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: colors.brandTertiary },
  roleText: { color: colors.brandPrimary, fontSize: 10, fontWeight: "800", letterSpacing: 0.6 },
  dept: { fontSize: 10, color: colors.onSurfaceSecondary },
  iconBtn: { padding: 6 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(13,20,20,0.5)" },
  sheet: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "#FFF", padding: spacing.lg, paddingBottom: spacing.xl + 12, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "88%" },
  handle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, marginBottom: spacing.md },
  formTitle: { fontSize: 18, fontWeight: "800", color: colors.onSurface, marginBottom: spacing.md },
  label: { fontSize: 11, fontWeight: "700", color: colors.onSurfaceSecondary, letterSpacing: 0.6, marginBottom: 4 },
  input: { backgroundColor: colors.surfaceSecondary, paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, color: colors.onSurface, fontSize: 14 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  chipText: { fontSize: 11, fontWeight: "700", color: colors.onSurfaceSecondary },
  chipTextActive: { color: "#FFF" },
  submit: { backgroundColor: colors.brandPrimary, paddingVertical: 14, borderRadius: radius.md, alignItems: "center", marginTop: spacing.md },
  submitText: { color: "#FFF", fontWeight: "700", fontSize: 15 },
  err: { color: colors.error, fontSize: 12, textAlign: "center", padding: 8 },
  deny: { fontSize: 15, fontWeight: "700", color: colors.onSurface, marginTop: spacing.md },
  backBtn: { marginTop: spacing.md, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: colors.brandPrimary, borderRadius: radius.md },
  backTxt: { color: "#FFF", fontWeight: "700" },
});
