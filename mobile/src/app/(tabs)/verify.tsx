import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { publicApi } from "@/lib/api";
import type { LookupResult } from "@/lib/types";

const VERDICT_COLORS: Record<string, string> = {
  VALID: "#16a34a",
  EXPIRING_SOON: "#d97706",
  EXPIRED: "#dc2626",
  REVOKED: "#991b1b",
};

export default function VerifyScreen() {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LookupResult | null>(null);

  async function lookup() {
    const q = query.trim();
    if (!q) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const data = await publicApi<LookupResult>(
        `/api/v1/public/certificates/lookup?q=${encodeURIComponent(q)}`
      );
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lookup failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Verify a certificate</Text>
        <Text style={styles.subtitle}>
          Enter a certificate ID or instrument serial number. No login needed — anyone can verify.
        </Text>

        <TextInput
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          placeholder="e.g. PMC-2026-000123 or serial"
          autoCapitalize="characters"
          autoCorrect={false}
          onSubmitEditing={lookup}
        />

        <TouchableOpacity style={styles.btn} disabled={busy || !query.trim()} onPress={lookup}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Verify</Text>}
        </TouchableOpacity>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {result && !result.found && !result.ambiguous ? (
          <View style={[styles.resultCard, { borderLeftColor: "#d97706" }]}>
            <Text style={[styles.verdict, { color: "#d97706" }]}>NO MATCH</Text>
            <Text style={styles.body}>
              No certificate found for “{query.trim()}”. Treat with caution and cross-check the physical
              sticker.
            </Text>
          </View>
        ) : null}

        {result?.ambiguous && result.candidates ? (
          <View style={[styles.resultCard, { borderLeftColor: "#d97706" }]}>
            <Text style={[styles.verdict, { color: "#d97706" }]}>AMBIGUOUS SERIAL</Text>
            {result.candidates.map((c) => (
              <Text key={c.certId} style={styles.body}>
                {c.certId} — {c.district}
              </Text>
            ))}
          </View>
        ) : null}

        {result?.found && result.badge ? (
          <View style={[styles.resultCard, { borderLeftColor: VERDICT_COLORS[result.badge.verdict] }]}>
            <Text style={[styles.verdict, { color: VERDICT_COLORS[result.badge.verdict] }]}>
              {result.badge.verdict}
              {result.badge.signatureValid ? " ✓ signature" : " ⚠ signature"}
            </Text>
            {result.badge.anchors.map((a) => (
              <View key={a.label} style={styles.anchorRow}>
                <Text style={styles.anchorLabel}>{a.label}</Text>
                <Text style={styles.anchorValue}>{a.value}</Text>
              </View>
            ))}
            {result.badge.history.length > 0 ? (
              <>
                <Text style={styles.sectionLabel}>History</Text>
                {result.badge.history.map((h, i) => (
                  <Text key={i} style={styles.body}>
                    {new Date(h.at).toLocaleDateString()} — {h.what}
                  </Text>
                ))}
              </>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  content: { padding: 20, paddingTop: 60, gap: 12 },
  title: { fontSize: 24, fontWeight: "800", color: "#0f172a" },
  subtitle: { fontSize: 14, color: "#64748b", marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    backgroundColor: "#fff",
    color: "#0f172a",
  },
  btn: { backgroundColor: "#2563eb", borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  error: { color: "#dc2626", fontSize: 13 },
  resultCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderLeftWidth: 6,
    padding: 20,
    gap: 8,
    shadowColor: "#0f172a",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  verdict: { fontSize: 20, fontWeight: "800", letterSpacing: 0.5 },
  anchorRow: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  anchorLabel: { color: "#64748b", fontSize: 14, flexShrink: 1 },
  anchorValue: { color: "#0f172a", fontSize: 14, fontWeight: "600", flexShrink: 2, textAlign: "right" },
  sectionLabel: { marginTop: 8, fontWeight: "700", color: "#334155", fontSize: 14 },
  body: { color: "#334155", fontSize: 13 },
});
