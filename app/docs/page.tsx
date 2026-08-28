import Link from "next/link";

export default function DocsPage() {
  return (
    <div className="max-w-md">
      <h1 className="text-2xl font-bold">API Docs</h1>
      <p className="mt-2">
        <Link href="/api/v1/openapi.json" className="underline">
          View OpenAPI spec (/api/v1/openapi.json)
        </Link>
      </p>
    </div>
  );
}