import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { API_URL, ApiError, publicApi } from "@/lib/api";
import { useAuthStore } from "@/lib/auth";
import type { UserDTO } from "@/lib/types";

const DEMO = { email: "ravi@demo.in", password: "Passw0rd!demo" };

export default function LoginScreen() {
  const signIn = useAuthStore((s) => s.signIn);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function doLogin(mail: string, pass: string) {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const data = await publicApi<{ accessToken: string; user: UserDTO }>(
        "/api/v1/auth/login",
        {
          method: "POST",
          body: JSON.stringify({ email: mail.trim(), password: pass }),
        }
      );
      await signIn(data.accessToken, data.user);
      router.replace("/(tabs)");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Cannot reach the server. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.hero}>
        <Text style={styles.title}>Pramanam</Text>
        <Text style={styles.subtitle}>Legal Metrology verification, in your pocket</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.in"
        />
        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          placeholder="••••••••"
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity style={styles.primaryBtn} disabled={busy} onPress={() => doLogin(email, password)}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Log in</Text>}
        </TouchableOpacity>

        <TouchableOpacity style={styles.ghostBtn} disabled={busy} onPress={() => doLogin(DEMO.email, DEMO.password)}>
          <Text style={styles.ghostBtnText}>Use demo trader account</Text>
        </TouchableOpacity>

        <Text style={styles.serverNote}>Server: {API_URL}</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc", justifyContent: "center", padding: 24 },
  hero: { alignItems: "center", marginBottom: 32 },
  title: { fontSize: 32, fontWeight: "800", color: "#0f172a", letterSpacing: 0.5 },
  subtitle: { marginTop: 6, fontSize: 14, color: "#64748b" },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 20, gap: 10 },
  label: { fontSize: 13, fontWeight: "600", color: "#334155", marginTop: 6 },
  input: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: "#0f172a",
    backgroundColor: "#f8fafc",
  },
  error: { color: "#dc2626", fontSize: 13 },
  primaryBtn: {
    marginTop: 12,
    backgroundColor: "#2563eb",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  ghostBtn: { paddingVertical: 10, alignItems: "center" },
  ghostBtnText: { color: "#2563eb", fontWeight: "600", fontSize: 14 },
  serverNote: { marginTop: 6, fontSize: 11, color: "#94a3b8", textAlign: "center" },
});
