"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/Badge";
import { BadgeDTO } from "@/packages/shared/types";

export default function VerifyPage() {
  const { certId } = useParams<{ certId: string }>();
  const [badge, setBadge] = useState<BadgeDTO | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch(`/api/v1/public/certificates/${certId}`)
      .then((r) => r.json())
      .then((j) => {
        if (j && j.ok && j.data) setBadge(j.data);
        else setNotFound(true);
      })
      .catch(() => setNotFound(true));
  }, [certId]);

  if (notFound) {
    return (
      <div className="max-w-md">
        <h1 className="text-2xl font-bold">Certificate not found</h1>
        <p className="mt-2 text-muted-foreground">
          We couldn&apos;t find a certificate matching{" "}
          <span className="font-mono text-foreground">{certId}</span>.
        </p>
        <p className="mt-4">
          <Link href="/verify/PRM-CERT-2026-00001" className="text-blue-600 underline">
            Try the demo certificate
          </Link>
        </p>
        <p className="mt-2">
          <Link href="/verify/offline" className="text-blue-600 underline">
            Verify offline by pasting the sticker payload
          </Link>
        </p>
      </div>
    );
  }

  if (!badge) return <h1 className="text-2xl font-bold">Loading…</h1>;

  return (
    <div className="max-w-md">
      <h1 className="text-2xl font-bold">{badge.certId}</h1>
      <Badge verdict={badge.verdict} />

      <ul className="mt-6 flex flex-col gap-2">
        {badge.anchors.map((a) => (
          <li key={a.label} className="flex justify-between rounded border px-3 py-2 text-sm">
            <span className="text-muted-foreground">{a.label}</span>
            <span className="font-medium">{a.value}</span>
          </li>
        ))}
      </ul>

      <details className="mt-6 rounded border">
        <summary className="cursor-pointer px-3 py-2 text-sm font-medium">History</summary>
        <ul className="flex flex-col gap-2 px-3 pb-3">
          {badge.history.map((h, i) => (
            <li key={i} className="text-sm">
              <span className="text-muted-foreground">{h.at}</span> — {h.what}
            </li>
          ))}
        </ul>
      </details>

      <p className="mt-6">
        <Link href="/verify/offline" className="text-blue-600 underline">
          Verify offline by pasting the sticker payload
        </Link>
      </p>
    </div>
  );
}