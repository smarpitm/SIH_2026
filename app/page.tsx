import Link from "next/link";

const cards = [
  { title: "Login", href: "/login", desc: "Sign in to your account" },
  { title: "Register", href: "/register", desc: "Create an account" },
  { title: "Verify a certificate", href: "/verify/PRM-CERT-2026-00001", desc: "Check a certificate badge" },
  { title: "Trader portal", href: "/trader", desc: "Manage applications & instruments" },
  { title: "Officer portal", href: "/officer", desc: "Inspection queue" },
  { title: "API docs", href: "/docs", desc: "OpenAPI spec" },
];

export default function Home() {
  return (
    <div className="flex flex-col items-start gap-6">
      <div>
        <h1 className="text-4xl font-bold">PRAMANAM</h1>
        <p className="mt-1 text-muted-foreground">
          Online Verification System for Weighing &amp; Measuring Instruments
        </p>
      </div>
      <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="rounded-lg border p-5 transition-colors hover:border-foreground"
          >
            <div className="font-semibold">{c.title}</div>
            <div className="mt-1 text-sm text-muted-foreground">{c.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}