"use client";

import { useEffect, useState } from "react";
import { DashCounts } from "@/packages/shared/types";

const KPIS: { key: keyof DashCounts; label: string }[] = [
  { key: "pendingApplications", label: "Pending" },
  { key: "verifiedThisMonth", label: "Verified (month)" },
  { key: "expiringIn30d", label: "Expiring in 30d" },
  { key: "slaBreaches", label: "SLA breaches" },
];

export default function AdminPage() {
  const [dash, setDash] = useState<DashCounts | null>(null);

  useEffect(() => {
    fetch("/api/v1/dashboards/admin")
      .then((r) => r.json())
      .then((j) => setDash(j.data))
      .catch(() => undefined);
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold">Admin</h1>
      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {KPIS.map((k) => (
          <div key={k.key} className="rounded-lg border p-4">
            <div className="text-3xl font-bold">{dash ? dash[k.key] : "–"}</div>
            <div className="text-sm text-muted-foreground">{k.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}