import type { Metadata } from "next";
import localFont from "next/font/local";
import { Header } from "@/components/Header";
import "./globals.css";

// Figtree variable font (weight axis 300–900, display:block so bold text never
// synthesizes/swap-flickers). Local woff2 — no runtime dependency on Google Fonts.
const figtree = localFont({
  src: "./fonts/FigtreeVF.woff2",
  weight: "300 900",
  style: "normal",
  display: "block",
  variable: "--font-figtree",
});

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
    <html lang="en" className={`${figtree.variable} h-full`}>
      <body className="flex min-h-full flex-col bg-zinc-50 font-sans text-zinc-900 antialiased dark:bg-zinc-950 dark:text-zinc-100">
        <Header />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
          {children}
        </main>
        <footer className="border-t border-zinc-200/80 bg-white/80 py-6 text-center text-xs text-zinc-500 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
          <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 sm:flex-row sm:px-6 lg:px-8">
            <div className="flex items-center gap-2">
              <span className="font-semibold tracking-tight text-zinc-800 dark:text-zinc-200">PRAMANAM</span>
              <span>—</span>
              <span>Online Verification Platform</span>
              <span aria-hidden="true" className="h-1 w-1 rounded-full bg-accent" />
            </div>
            <div className="font-mono text-[11px] tracking-tight text-zinc-400 dark:text-zinc-500">
              Legal Metrology Act 2009 · demo build
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}