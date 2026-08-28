"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { StatusChip } from "@/components/StatusChip";
import { ApplicationDTO } from "@/packages/shared/types";

export default function OfficerPage() {
  const [applications, setApplications] = useState<ApplicationDTO[]>([]);

  useEffect(() => {
    fetch("/api/v1/applications")
      .then((r) => r.json())
      .then((j) => setApplications(j.data))
      .catch(() => undefined);
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold">Officer queue</h1>
      <ul className="mt-4 flex flex-col gap-2">
        {applications.map((app) => (
          <li key={app.id} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
            <span className="font-mono">{app.instrumentId}</span>
            <span className="text-muted-foreground">{app.type} · {app.createdAt}</span>
            <StatusChip status={app.status} />
            <Link href={`/officer/job/${app.id}`} className="text-primary-600 underline">
              Inspect
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}