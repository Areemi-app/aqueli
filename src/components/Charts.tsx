/**
 * Graphiques vectoriels d'Aqueli (Budget, Bilan, Objectifs) : barres, courbe, anneau. Dessinés
 * en SVG avec les variables du thème, sans bibliothèque ; chacun porte aussi ses valeurs en texte
 * (tableau lu par le Narrateur).
 */
import { useId, type CSSProperties } from "react";
import { tr } from "../i18n/i18n";

export interface BarDatum {
  label: string;
  value: number;
  /** Seconde série (revenus face aux dépenses…). */
  second?: number;
  /** Mise en avant (mois en cours, aujourd'hui). */
  current?: boolean;
}

interface BarChartProps {
  data: readonly BarDatum[];
  format: (n: number) => string;
  /** Nom des séries, pour la légende et le Narrateur. */
  series: [first: string, second?: string];
  label: string;
  height?: number;
  /** Couleur de la première série (sinon l'accent du thème). */
  color?: string;
}

function SrTable({ caption, head, rows }: { caption: string; head: string[]; rows: string[][] }) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          {head.map((h) => (
            <th key={h} scope="col">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r[0]}>
            {r.map((c, i) => (i === 0 ? <th key={i} scope="row">{c}</th> : <td key={i}>{c}</td>))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Barres verticales, une ou deux séries. */
export function BarChart({ data, format, series, label, height = 160, color }: BarChartProps) {
  const id = useId();
  const max = Math.max(1, ...data.flatMap((d) => [d.value, d.second ?? 0]));
  const width = 100;
  const step = width / Math.max(1, data.length);
  const two = series[1] !== undefined;
  const bar = step * (two ? 0.32 : 0.56);
  return (
    <figure className="chart" style={{ "--chart-color": color ?? "var(--aq-accent)" } as CSSProperties}>
      <svg className="chart-svg" viewBox={`0 0 ${width} 100`} preserveAspectRatio="none" style={{ height }} aria-hidden="true">
        <defs>
          <linearGradient id={`${id}-a`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--chart-color)" stopOpacity="0.95" />
            <stop offset="1" stopColor="var(--chart-color)" stopOpacity="0.55" />
          </linearGradient>
        </defs>
        {[25, 50, 75].map((y) => (
          <line key={y} x1="0" x2={width} y1={y} y2={y} className="chart-grid" />
        ))}
        {data.map((d, i) => {
          const x = i * step + (step - (two ? bar * 2 + 1 : bar)) / 2;
          const h1 = (d.value / max) * 92;
          const h2 = ((d.second ?? 0) / max) * 92;
          return (
            <g key={d.label} data-current={d.current || undefined}>
              <rect x={x} y={100 - h1} width={bar} height={h1} rx={1.2} fill={`url(#${id}-a)`} className="chart-bar" />
              {two && <rect x={x + bar + 1} y={100 - h2} width={bar} height={h2} rx={1.2} className="chart-bar chart-bar--second" />}
            </g>
          );
        })}
      </svg>
      <div className="chart-labels" style={{ gridTemplateColumns: `repeat(${data.length}, 1fr)` }} aria-hidden="true">
        {data.map((d) => (
          <span key={d.label} data-current={d.current || undefined}>
            {d.label}
          </span>
        ))}
      </div>
      {two && (
        <figcaption className="chart-legend" aria-hidden="true">
          <span className="chart-key" />
          {series[0]}
          <span className="chart-key chart-key--second" />
          {series[1]}
        </figcaption>
      )}
      <SrTable caption={label} head={["", ...series.filter((s): s is string => !!s)]} rows={data.map((d) => [d.label, format(d.value), ...(two ? [format(d.second ?? 0)] : [])])} />
    </figure>
  );
}

export interface LinePoint {
  label: string;
  value: number | null;
}

/** Courbe (humeur, énergie) : les jours sans valeur laissent un trou. */
export function LineChart({ points, min, max, format, label, height = 140 }: { points: readonly LinePoint[]; min: number; max: number; format: (n: number) => string; label: string; height?: number }) {
  const id = useId();
  const span = Math.max(1, max - min);
  const step = 100 / Math.max(1, points.length - 1);
  const y = (v: number) => 92 - ((v - min) / span) * 84;
  const segments: string[] = [];
  let current = "";
  points.forEach((p, i) => {
    if (p.value === null) {
      if (current) segments.push(current);
      current = "";
      return;
    }
    current += `${current ? "L" : "M"}${(i * step).toFixed(2)} ${y(p.value).toFixed(2)} `;
  });
  if (current) segments.push(current);
  return (
    <figure className="chart">
      <svg className="chart-svg" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ height }} aria-hidden="true">
        <defs>
          <linearGradient id={`${id}-l`} x1="0" x2="1">
            <stop offset="0" stopColor="var(--aq-accent)" />
            <stop offset="1" stopColor="var(--aq-priority-low)" />
          </linearGradient>
        </defs>
        {[25, 50, 75].map((g) => (
          <line key={g} x1="0" x2="100" y1={g} y2={g} className="chart-grid" />
        ))}
        {segments.map((d, i) => (
          <path key={i} d={d} className="chart-line" stroke={`url(#${id}-l)`} />
        ))}
        {points.map((p, i) => (p.value === null ? null : <circle key={i} cx={i * step} cy={y(p.value)} r={1.6} className="chart-dot" />))}
      </svg>
      <div className="chart-labels" style={{ gridTemplateColumns: `repeat(${points.length}, 1fr)` }} aria-hidden="true">
        {points.map((p, i) => (
          <span key={i}>{points.length > 14 && i % Math.ceil(points.length / 10) !== 0 ? "" : p.label}</span>
        ))}
      </div>
      <SrTable caption={label} head={["", tr("Valeur")]} rows={points.map((p) => [p.label, p.value === null ? "—" : format(p.value)])} />
    </figure>
  );
}

export interface DonutPart {
  label: string;
  value: number;
  color: string;
}

/** Anneau des parts (dépenses par catégorie), avec un texte au centre. */
export function Donut({ parts, center, sub, label, size = 150 }: { parts: readonly DonutPart[]; center: string; sub?: string; label: string; size?: number }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  const r = 15.9155;
  let offset = 25;
  return (
    <figure className="chart chart-donut" style={{ width: size }}>
      <svg viewBox="0 0 42 42" width={size} height={size} aria-hidden="true">
        <circle cx="21" cy="21" r={r} className="chart-donut-track" />
        {total > 0 &&
          parts
            .filter((p) => p.value > 0)
            .map((p) => {
              const share = (p.value / total) * 100;
              const dash = `${Math.max(0, share - 0.6)} ${100 - Math.max(0, share - 0.6)}`;
              const el = <circle key={p.label} cx="21" cy="21" r={r} className="chart-donut-part" stroke={p.color} strokeDasharray={dash} strokeDashoffset={offset} />;
              offset -= share;
              return el;
            })}
      </svg>
      <figcaption className="chart-donut-center" aria-hidden="true">
        <strong>{center}</strong>
        {sub && <span>{sub}</span>}
      </figcaption>
      <SrTable caption={label} head={["", tr("Part")]} rows={parts.map((p) => [p.label, total ? `${Math.round((p.value / total) * 100)} %` : "0 %"])} />
    </figure>
  );
}
