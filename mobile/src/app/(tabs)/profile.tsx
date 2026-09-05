import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { authorizedRequest } from "@/lib/api";
import { useAuthStore } from "@/lib/auth";

export default function ProfileScreen() {
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const router = useRouter();

  async function onSignOut() {
    Alert.alert("Log out", "End this session on your device?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log out",
        style: "destructive",
        onPress: async () => {
          // best-effort server logout (revokes the refresh cookie family)
          try {
            await authorizedRequest("/api/v1/auth/logout", { method: "POST" });
          } catch {
            /* ignore — local sign-out is what matters */
          }
          await signOut();
          router.replace("/login");
        },
      },
    ]);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Profile</Text>
      <View style={styles.card}>
        <Row label="Name" value={user?.name ?? "—"} />
        <Row label="Email" value={user?.email ?? "—"} />
        <Row label="Role" value={user?.role ?? "—"} />
        {user?.orgName ? <Row label="Organisation" value={user.orgName} /> : null}
        {user?.district ? <Row label="District" value={user.district} /> : null}
      </View>
      <TouchableOpacity style={styles.btn} onPress={onSignOut}>
        <Text style={styles.btnText}>Log out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  content: { padding: 20, paddingTop: 60, gap: 16 },
  title: { fontSize: 24, fontWeight: "800", color: "#0f172a" },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 8, elevation: 2 },
  row: { flexDirection: "row", justifyContent: "space-between", padding: 14, gap: 12 },
  rowLabel: { color: "#64748b", fontSize: 14 },
  rowValue: { color: "#0f172a", fontSize: 14, fontWeight: "600", flexShrink: 2, textAlign: "right" },
  btn: {
    backgroundColor: "#dc2626",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
