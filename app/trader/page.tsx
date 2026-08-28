"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { StatusChip } from "@/components/StatusChip";
import type { DashCounts, InstrumentDTO, ApplicationDTO } from "@/packages/shared/types";

const KPIS: { key: keyof DashCounts; label: string }[] = [
  { key: "pendingApplications", label: "Pending" },
  { key: "verifiedThisMonth", label: "Verified (month)" },
  { key: "expiringIn30d", label: "Expiring in 30d" },
  { key: "slaBreaches", label: "SLA breaches" },
];

export default function TraderPage() {
  const [dash, setDash] = useState<DashCounts | null>(null);
  const [instruments, setInstruments] = useState<InstrumentDTO[]>([]);
  const [applications, setApplications] = useState<ApplicationDTO[]>([]);

  useEffect(() => {
    Promise.all([
      fetch("/api/v1/dashboards/trader").then((r) => r.json()),
      fetch("/api/v1/instruments").then((r) => r.json()),
      fetch("/api/v1/applications").then((r) => r.json()),
    ])
      .then(([d, i, a]) => {
        setDash(d.data);
        setInstruments(i.data);
        setApplications(a.data);
      })
      .catch(() => undefined);
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Trader portal</h1>
        <Link href="/trader/instruments/new" className="rounded bg-foreground px-3 py-2 text-sm font-medium text-background">
          + New instrument
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {KPIS.map((k) => (
          <div key={k.key} className="rounded-lg border p-4">
            <div className="text-3xl font-bold">{dash ? dash[k.key] : "–"}</div>
            <div className="text-sm text-muted-foreground">{k.label}</div>
          </div>
        ))}
      </div>

      <div>
        <h2 className="text-lg font-semibold">Instruments</h2>
        <table className="mt-2 w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2">Serial</th>
              <th>Category</th>
              <th>Make / Model</th>
              <th>District</th>
              <th>Apply</th>
            </tr>
          </thead>
          <tbody>
            {instruments.map((ins) => (
              <tr key={ins.id} className="border-b">
                <td className="py-2 font-mono">{ins.serialNumber}</td>
                <td>{ins.category}</td>
                <td>{ins.make} {ins.model}</td>
                <td>{ins.district}</td>
                <td>
                  <Link href={`/trader/apply/${ins.id}`} className="text-blue-600 underline">
                    Apply
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <h2 className="text-lg font-semibold">Applications</h2>
        <ul className="mt-2 flex flex-col gap-2">
          {applications.map((app) => (
            <li key={app.id} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
              <span className="font-mono">{app.instrumentId}</span>
              <span className="text-muted-foreground">{app.type}</span>
              <StatusChip status={app.status} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}