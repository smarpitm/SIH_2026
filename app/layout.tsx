import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "PRAMANAM",
  description: "Online Verification System for Weighing & Measuring Instruments",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <header className="border-b">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
            <Link href="/" className="text-lg font-bold">
              PRAMANAM
            </Link>
            <nav className="flex gap-4 text-sm">
              <Link href="/login">Login</Link>
              <Link href="/register">Register</Link>
              <Link href="/verify/PRM-CERT-2026-00001">Verify</Link>
              <Link href="/trader">Trader</Link>
              <Link href="/officer">Officer</Link>
              <Link href="/admin">Admin</Link>
              <Link href="/docs">Docs</Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}