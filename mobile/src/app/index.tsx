import { Redirect, useRootNavigationState } from "expo-router";
import { useAuthStore } from "@/lib/auth";

export default function Index() {
  const token = useAuthStore((s) => s.token);
  const navigationState = useRootNavigationState();

  if (!navigationState?.key) return null;
  return <Redirect href={token ? "/(tabs)" : "/login"} />;
}
