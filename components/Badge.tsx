const CONFIG: Record<string, { word: string; icon: string; cls: string }> = {
  VALID: { word: "VALID", icon: "✓", cls: "bg-green-100 text-green-800" },
  EXPIRING_SOON: { word: "EXPIRING SOON", icon: "⟳", cls: "bg-amber-100 text-amber-800" },
  EXPIRED: { word: "EXPIRED", icon: "✕", cls: "bg-red-100 text-red-800" },
  REVOKED: { word: "REVOKED", icon: "✕", cls: "bg-red-100 text-red-800" },
};

// a11y: aria-live announces the verdict; colour is never the only signal (icon + word always).
export function Badge({ verdict }: { verdict: string }) {
  const m = CONFIG[verdict] ?? { word: verdict, icon: "•", cls: "bg-gray-100 text-gray-800" };
  return (
    <span
      aria-live="polite"
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold ${m.cls}`}
    >
      <span aria-hidden>{m.icon}</span>
      {m.word}
    </span>
  );
}