import Link from "next/link";

export default function DocsPage() {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl dark:text-white">
          API &amp; Contract Documentation
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          PRAMANAM REST API specification and cryptographic public key endpoints.
        </p>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 space-y-4">
        <h2 className="text-base font-bold text-zinc-900 dark:text-white">
          OpenAPI 3.0 Specification
        </h2>
        <p className="text-xs text-zinc-500">
          The OpenAPI schema defines all 30 REST endpoints covering authentication, applications, scheduling, inspections, certificates, and public verification.
        </p>

        <div className="pt-2 flex flex-col sm:flex-row gap-3">
          <Link
            href="/api/v1/openapi.json"
            target="_blank"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900"
          >
            <span>📜 View OpenAPI JSON (`/api/v1/openapi.json`)</span>
            <span>↗</span>
          </Link>
          <Link
            href="/api/v1/.well-known/pramanam-public-key"
            target="_blank"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-zinc-200 px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300"
          >
            <span>🔑 Public Key JWK</span>
            <span>↗</span>
          </Link>
        </div>
      </div>
    </div>
  );
}