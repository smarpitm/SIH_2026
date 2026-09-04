import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-xl flex-col items-center justify-center px-4 text-center">
      <p className="text-6xl font-black tracking-tighter text-accent-600 dark:text-accent-400">404</p>
      <h1 className="mt-3 text-2xl font-bold tracking-tight text-zinc-950 dark:text-white">
        Page not found
      </h1>
      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
        The page you are looking for does not exist or has been moved.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="rounded-full bg-zinc-950 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-zinc-950/20 transition outline-none hover:bg-zinc-800 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 dark:bg-white dark:text-zinc-950 dark:shadow-black/20 dark:hover:bg-zinc-200"
        >
          Go home
        </Link>
        <Link
          href="/verify/PRM-CERT-2026-00001"
          className="rounded-full border border-zinc-200 px-5 py-2.5 text-sm font-semibold text-zinc-700 transition outline-none hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-accent dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Verify a certificate
        </Link>
      </div>
    </div>
  );
}
