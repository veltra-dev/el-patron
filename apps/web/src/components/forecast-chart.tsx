"use client";

import { useState } from "react";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const short = (v: number) => {
  const a = Math.abs(v);
  const s = a >= 1000 ? `${(a / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}k` : Math.round(a).toLocaleString("pt-BR");
  return `${v < 0 ? "−" : ""}R$ ${s}`;
};
const day = (d: string) => `${Number(d.slice(8, 10))} ${["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"][Number(d.slice(5, 7)) - 1]}`;

/**
 * Saldo projetado dia a dia (uma série, linha de 2px) com linha do zero,
 * marcador onde o caixa zera e crosshair + tooltip no hover/toque.
 */
export function ForecastChart({ points, zeroOn, compact }: { points: { date: string; balance: number }[]; zeroOn: string | null; compact?: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  if (points.length === 0) return null;
  const W = 640;
  const H = compact ? 150 : 260;
  const padL = compact ? 8 : 64;
  const padR = 12;
  const padT = 14;
  const padB = 28;
  const vals = points.map((p) => p.balance);
  let max = Math.max(0, ...vals);
  let min = Math.min(0, ...vals);
  if (max === min) max = min + 100;
  const span = max - min;
  max += span * 0.06;
  min -= span * 0.06;
  const x = (i: number) => padL + (points.length === 1 ? 0 : (i / (points.length - 1)) * (W - padL - padR));
  const y = (v: number) => padT + ((max - v) / (max - min)) * (H - padT - padB);
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.balance).toFixed(1)}`).join(" ");
  const zi = zeroOn ? points.findIndex((p) => p.date === zeroOn) : -1;
  const last = points.length - 1;
  const h = hover !== null ? points[hover]! : null;

  const pick = (clientX: number, rect: DOMRect) => {
    const px = ((clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - padL) / (W - padL - padR)) * last);
    setHover(Math.max(0, Math.min(last, i)));
  };

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full touch-pan-y select-none"
        role="img"
        aria-label={`Saldo projetado: de ${brl.format(points[0]!.balance)} hoje para ${brl.format(points[last]!.balance)} em ${day(points[last]!.date)}${zeroOn ? `; fica negativo em ${day(zeroOn)}` : ""}.`}
        onPointerMove={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
        onPointerDown={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
        onPointerLeave={() => setHover(null)}
      >
        {/* grade recessiva: topo, zero e base */}
        {[max, 0, min].map((v, i) => (
          <g key={i}>
            <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke="var(--grid)" strokeDasharray={v === 0 ? "4 5" : undefined} strokeWidth={v === 0 ? 1.2 : 1} />
            {!compact && (
              <text x={padL - 10} y={y(v) + 4} textAnchor="end" fontSize="12" fill="var(--text-muted)" className="num">
                {short(v === max ? Math.max(...vals) : v === min ? Math.min(...vals) : 0)}
              </text>
            )}
          </g>
        ))}
        <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(0)} cy={y(points[0]!.balance)} r="4.5" fill="var(--accent)" stroke="var(--surface)" strokeWidth="2" />
        {zi >= 0 && <circle cx={x(zi)} cy={y(points[zi]!.balance)} r="5" fill="var(--bad)" stroke="var(--surface)" strokeWidth="2" />}
        {zi !== last && <circle cx={x(last)} cy={y(points[last]!.balance)} r="4.5" fill={points[last]!.balance < 0 ? "var(--bad)" : "var(--accent)"} stroke="var(--surface)" strokeWidth="2" />}
        {/* eixo X */}
        <text x={x(0)} y={H - 6} fontSize="12" fill="var(--text-muted)" textAnchor={compact ? "start" : "middle"}>
          {day(points[0]!.date)}
        </text>
        {zi > 0 && zi < last && (
          <text x={x(zi)} y={H - 6} fontSize="12" fill="var(--bad-soft)" textAnchor="middle">
            {Number(points[zi]!.date.slice(8))} · zera
          </text>
        )}
        <text x={x(last)} y={H - 6} fontSize="12" fill="var(--text-muted)" textAnchor="end">
          {day(points[last]!.date)}
        </text>
        {h && hover !== null && (
          <g pointerEvents="none">
            <line x1={x(hover)} x2={x(hover)} y1={padT} y2={H - padB} stroke="var(--border-strong)" />
            <circle cx={x(hover)} cy={y(h.balance)} r="5" fill="var(--surface)" stroke={h.balance < 0 ? "var(--bad)" : "var(--accent)"} strokeWidth="2.5" />
          </g>
        )}
      </svg>
      {h && hover !== null && (
        <div
          className="pointer-events-none absolute top-0 z-10 rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-xs shadow-lg"
          style={{
            left: `${(x(hover) / W) * 100}%`,
            transform: hover > last * 0.7 ? "translateX(calc(-100% - 8px))" : "translateX(8px)",
          }}
        >
          <div className="text-muted">{day(h.date)}</div>
          <div className={`num font-semibold ${h.balance < 0 ? "text-bad" : ""}`}>{brl.format(h.balance)}</div>
        </div>
      )}
    </div>
  );
}
