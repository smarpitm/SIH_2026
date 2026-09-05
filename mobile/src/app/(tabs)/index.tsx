import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/auth";
import type { DashCounts } from "@/lib/types";

const LABELS: Record<keyof DashCounts, string> = {
  pendingApplications: "Pending applications",
  verifiedThisMonth: "Verified this month",
  expiringIn30d: "Expiring in 30 days",
  slaBreaches: "SLA breaches",
};

export default function DashboardScreen() {
  const user = useAuthStore((s) => s.user);
  const [counts, setCounts] = useState<DashCounts | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      const data = await api<DashCounts>(`/api/v1/dashboards/${user.role.toLowerCase()}`);
      setCounts(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load dashboard");
    } finally {
      setBusy(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={busy} onRefresh={load} />}
    >
      <Text style={styles.hello}>Hi, {user?.name ?? "there"} 👋</Text>
      <Text style={styles.role}>{user?.role} · {user?.district ?? user?.orgName ?? "Pramanam"}</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {!counts && busy ? (
        <ActivityIndicator style={{ marginTop: 40 }} size="large" color="#2563eb" />
      ) : null}

      {counts
        ? (Object.keys(LABELS) as (keyof DashCounts)[]).map((k) => (
            <View key={k} style={styles.card}>
              <Text style={styles.cardValue}>{counts[k]}</Text>
              <Text style={styles.cardLabel}>{LABELS[k]}</Text>
            </View>
          ))
        : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  content: { padding: 20, paddingTop: 60, gap: 12 },
  hello: { fontSize: 24, fontWeight: "800", color: "#0f172a" },
  role: { fontSize: 13, color: "#64748b", marginBottom: 12, textTransform: "uppercase" },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    shadowColor: "#0f172a",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardValue: { fontSize: 28, fontWeight: "800", color: "#2563eb" },
  cardLabel: { fontSize: 13, color: "#475569", marginTop: 4 },
  error: { color: "#dc2626", fontSize: 13 },
});
