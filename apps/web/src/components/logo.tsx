/** Marca do ElPatrón: chapéu sobre quadrado âmbar. */
export function Logo({ className = "size-10" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} role="img" aria-label="ElPatrón">
      <rect width="40" height="40" rx="12" fill="var(--accent)" />
      <g transform="translate(8 8)" fill="none" stroke="var(--accent-ink)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 15.5c0-1.2 4.5-2.2 10-2.2s10 1 10 2.2-4.5 2.2-10 2.2-10-1-10-2.2Z" />
        <path d="M5.5 14V9.5C5.5 7 8 5.5 12 5.5s6.5 1.5 6.5 4V14" />
        <path d="M5.7 11.6c3.6.8 8.9.8 12.6 0" />
      </g>
    </svg>
  );
}
