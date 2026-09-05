import { Text } from "react-native";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  index: "speedometer-outline",
  verify: "scan-outline",
  profile: "person-circle-outline",
};

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#2563eb",
        tabBarInactiveTintColor: "#64748b",
      }}
    >
      {["index", "verify", "profile"].map((name) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            title: name === "index" ? "Dashboard" : name === "verify" ? "Verify" : "Profile",
            tabBarIcon: ({ color, size }) => <Ionicons name={ICONS[name]} size={size} color={color} />,
          }}
        />
      ))}
    </Tabs>
  );
}
