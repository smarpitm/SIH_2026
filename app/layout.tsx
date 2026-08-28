import type { Metadata } from "next";
import { Header } from "@/components/Header";
import "./globals.css";

export const metadata: Metadata = {
  title: "PRAMANAM — Online Verification System for Weighing & Measuring Instruments",
  description: "Digital legal metrology verification, inspection lifecycle, and tamper-evident digital certificate platform under Legal Metrology Act 2009.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="flex min-h-full flex-col bg-zinc-50 font-sans text-zinc-900 antialiased dark:bg-zinc-950 dark:text-zinc-100">
        <Header />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
          {children}
        </main>
        <footer className="border-t border-zinc-200 bg-white py-6 text-center text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-zinc-800 dark:text-zinc-200">PRAMANAM</span>
              <span>—</span>
              <span>Online Verification Platform</span>
            </div>
            <div className="font-mono text-[11px] text-zinc-400 dark:text-zinc-500">
              Legal Metrology Act 2009 · demo build
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}