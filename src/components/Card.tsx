import type { ReactNode } from "react";

/* ---------------------------------------------------------------------
   Shared card shell. Hairline border, sharp corners, mono eyebrow label
   on a ruled header, generous padding. Ported from PersonalHub.jsx.
   --------------------------------------------------------------------- */
export function Card({
  label,
  right,
  children,
  className = "",
}: {
  label: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`border border-gray-200 bg-white ${className}`}>
      <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
        <h2 className="font-mono text-xs uppercase tracking-widest text-gray-500">
          {label}
        </h2>
        {right != null && (
          <div className="font-mono text-xs text-gray-400">{right}</div>
        )}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

/* Small "sample" tag used where a module is showing placeholder data. */
export function Sample() {
  return (
    <span className="ml-2 border border-gray-300 px-1 py-0.5 align-middle font-mono text-[10px] uppercase tracking-wider text-gray-400">
      sample
    </span>
  );
}
