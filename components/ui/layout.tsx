"use client";

// components/ui/layout.tsx — structural design-system pieces: EmptyState,
// FormSection, Stepper, Breadcrumbs. Spacing follows the 4/8px system.

/* EmptyState — never leave a blank white screen; always offer the next action. */
export function EmptyState({
  icon = "○",
  title,
  description,
  action,
}: {
  icon?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center justify-center px-6 py-12 text-center">
      <span
        aria-hidden="true"
        className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-xl text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500"
      >
        {icon}
      </span>
      <h3 className="mt-4 text-sm font-bold text-zinc-900 dark:text-white">{title}</h3>
      {description && (
        <p className="mt-1 max-w-sm text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/* FormSection — grouped form block ("INSTRUMENT INFORMATION", "LOCATION", …)
   with an optional step number, replacing one long intimidating form. */
export function FormSection({
  step,
  title,
  description,
  children,
}: {
  step?: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-5 sm:p-6">
      <div className="mb-4 flex items-start gap-3 border-b border-zinc-100 pb-3 dark:border-zinc-800">
        {step && (
          <span
            aria-hidden="true"
            className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-950 text-[11px] font-bold text-white dark:bg-white dark:text-zinc-950"
          >
            {step}
          </span>
        )}
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-900 dark:text-white">
            {title}
          </h2>
          {description && (
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{description}</p>
          )}
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

/* Stepper — horizontal progress for multi-step flows (apply, register). */
export function Stepper({
  steps,
  current,
  className = "",
}: {
  steps: { key: string; label: string }[];
  current: number;
  className?: string;
}) {
  return (
    <ol
      className={`flex flex-wrap items-center gap-y-2 ${className}`}
      aria-label="Progress"
    >
      {steps.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={s.key} className="flex items-center" aria-current={active ? "step" : undefined}>
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition ${
                done
                  ? "bg-emerald-600 text-white"
                  : active
                    ? "bg-zinc-950 text-white ring-2 ring-zinc-950 ring-offset-2 dark:bg-white dark:text-zinc-950 dark:ring-white dark:ring-offset-zinc-950"
                    : "border border-zinc-300 bg-white text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-500"
              }`}
              aria-hidden="true"
            >
              {done ? "✓" : i + 1}
            </span>
            <span
              className={`ml-1.5 whitespace-nowrap text-xs font-semibold ${
                active
                  ? "text-zinc-950 dark:text-white"
                  : done
                    ? "text-emerald-700 dark:text-emerald-400"
                    : "text-zinc-400 dark:text-zinc-500"
              }`}
            >
              {s.label}
            </span>
            {i < steps.length - 1 && (
              <span
                aria-hidden="true"
                className={`mx-2.5 hidden h-px w-6 sm:block ${done ? "bg-emerald-400" : "bg-zinc-200 dark:bg-zinc-700"}`}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

/* Breadcrumbs — "Dashboard / Applications / APP-7P8P3P" for deeper pages. */
export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-2">
      <ol className="flex flex-wrap items-center gap-1 text-[11px] text-zinc-500 dark:text-zinc-400">
        {items.map((it, i) => (
          <li key={i} className="flex items-center gap-1">
            {i > 0 && (
              <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-600">
                /
              </span>
            )}
            {it.href ? (
              <a
                href={it.href}
                className="font-medium transition-colors hover:text-accent-700 dark:hover:text-accent-300"
              >
                {it.label}
              </a>
            ) : (
              <span className="font-semibold text-zinc-700 dark:text-zinc-300">{it.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
