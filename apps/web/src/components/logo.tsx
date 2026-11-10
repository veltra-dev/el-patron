/** Marca do ElPatrón: um chapéu sobre um balão de conversa. */
export function Logo({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <rect width="48" height="48" rx="12" fill="var(--brand)" />
      <path
        d="M12 30.5c0-5.8 5.4-9.5 12-9.5s12 3.7 12 9.5c0 4.7-4.6 7.5-10.4 7.5-1.4 0-2.7-.1-3.9-.4L15 40l1.6-4.6C13.7 34.1 12 32.5 12 30.5Z"
        fill="var(--brand-ink)"
      />
      <path
        d="M8 21.5c4.6 1.8 9.9 2.7 16 2.7s11.4-.9 16-2.7c-.8 1-2.6 2.6-5.3 3.4l-1.4-7.6C32.8 14.6 28.8 12 24 12s-8.8 2.6-9.3 5.3l-1.4 7.6C10.6 24.1 8.8 22.5 8 21.5Z"
        fill="var(--brand-ink)"
        opacity="0.92"
      />
      <path d="M15.4 22.6c5.6 1 11.6 1 17.2 0" stroke="var(--brand)" strokeWidth="1.6" fill="none" strokeLinecap="round" />
    </svg>
  );
}
