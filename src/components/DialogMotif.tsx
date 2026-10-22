import { useId, type ReactNode } from "react";

/**
 * Décor des fenêtres (Dialog) : un motif naît du coin en bas à droite et s'étend vers le haut à
 * gauche sur près de la moitié de la fenêtre, où il se fond dans le fond (traînées de lumière, bout
 * de globe, bulles, vagues, rayons, constellation, ondes). Les couleurs suivent la même direction :
 * un dégradé de trois teintes du thème (ses pastilles d'identité, src/theme/dialogDecor.ts), du coin
 * vers le centre, sur un voile coloré. Les motifs proposés suivent l'univers du thème ; chaque
 * fenêtre garde toujours le même, tiré de son titre. Styles : `.dialog-motif` (src/styles/vault.css).
 */

export { DIALOG_MOTIFS, motifFor, type DialogMotifKind } from "../theme/dialogDecor";
import type { DialogMotifKind } from "../theme/dialogDecor";

// Cadre du dessin : le coin d'origine est en bas à droite (W, H).
const W = 600;
const H = 400;

/** Dégradés : « fil » suit la direction coin → centre ; « fil2 » croise les teintes dans l'autre ordre. */
type Paint = (g?: "fil" | "fil2") => string;

const delay = (ms: number) => ({ animationDelay: `${ms}ms` });

function Line({ d, paint, width, i, g = "fil" }: { d: string; paint: Paint; width: number; i: number; g?: "fil" | "fil2" }) {
  return <path d={d} className="dialog-motif-line" pathLength={1} stroke={paint(g)} strokeWidth={width} strokeLinecap="round" fill="none" style={delay(i * 45)} />;
}

/** Perle lumineuse ; sa teinte suit sa distance au coin (comme le dégradé des traits). */
function Pearl({ x, y, r, i }: { x: number; y: number; r: number; i: number }) {
  const far = Math.hypot(W - x, H - y) / Math.hypot(W, H);
  const tone = far < 0.33 ? "a" : far < 0.6 ? "b" : "c";
  return <circle cx={x} cy={y} r={r} className={`dialog-motif-pearl dialog-motif-pearl--${tone}`} style={delay(320 + i * 40)} />;
}

function traits(paint: Paint): ReactNode {
  // Comètes : elles partent du coin et filent vers le haut à gauche, perle en tête.
  const comets: [number, number, number, number, number][] = [
    [612, 300, 300, 40, 1.8], [612, 340, 250, 110, 1.2], [600, 380, 330, 120, 2.2], [560, 412, 220, 190, 1],
    [612, 250, 380, 30, 1], [520, 412, 300, 230, 1.5], [612, 210, 430, 60, 0.9], [470, 412, 180, 270, 1.1],
    [612, 392, 400, 180, 1.4], [600, 160, 470, 40, 0.8],
  ];
  return (
    <>
      <Line d="M640 360 C520 300 470 200 360 170 S200 120 120 40" paint={paint} width={1.6} i={0} g="fil2" />
      <Line d="M620 420 C500 360 420 300 330 280 S180 240 60 160" paint={paint} width={1.3} i={1} />
      {comets.map(([x1, y1, x2, y2, w], i) => (
        <g key={i}>
          <Line d={`M${x1} ${y1} L${x2} ${y2}`} paint={paint} width={w} i={i + 2} g={i % 3 === 1 ? "fil2" : "fil"} />
          <Pearl x={x2} y={y2} r={w + 1.4} i={i} />
        </g>
      ))}
    </>
  );
}

function globe(paint: Paint): ReactNode {
  // Globe centré sur le coin : on en voit un quart, ses méridiens et parallèles, une orbite.
  const cx = W, cy = H, r = 300;
  const meridians = [0.2, 0.45, 0.7, 0.92].map((k) => `M${cx} ${cy - r} A${r * k} ${r} 0 0 0 ${cx} ${cy + r}`);
  const parallels = [0.25, 0.5, 0.75].map((k) => {
    const y = cy - r * k;
    const half = Math.sqrt(r * r - (r * k) ** 2);
    return `M${cx - half} ${y} Q${cx - half * 0.4} ${y - 22} ${cx} ${y - 26}`;
  });
  return (
    <>
      <circle cx={cx} cy={cy} r={r} className="dialog-motif-fill" style={delay(0)} />
      <Line d={`M${cx - r} ${cy} A${r} ${r} 0 0 1 ${cx} ${cy - r}`} paint={paint} width={2} i={0} />
      {meridians.map((d, i) => (
        <Line key={d} d={d} paint={paint} width={1.1} i={i + 1} g={i % 2 ? "fil2" : "fil"} />
      ))}
      {parallels.map((d, i) => (
        <Line key={d} d={d} paint={paint} width={1} i={i + 4} g="fil2" />
      ))}
      <Line d="M640 250 C520 110 300 80 150 170 S40 330 90 420" paint={paint} width={1.4} i={7} g="fil2" />
      <Pearl x={198} y={127} r={4} i={0} />
      <Pearl x={420} y={190} r={2.6} i={1} />
      <Pearl x={500} y={140} r={2.2} i={2} />
      <Pearl x={370} y={290} r={2} i={3} />
    </>
  );
}

function bulles(): ReactNode {
  // Bulles qui montent du coin en s'éloignant, de plus en plus petites.
  const bubbles: [number, number, number][] = [
    [540, 340, 62], [430, 300, 38], [520, 210, 30], [350, 236, 24], [450, 150, 18], [280, 170, 14], [380, 100, 11], [230, 110, 8],
    [300, 60, 6], [170, 70, 5], [600, 120, 16], [250, 300, 10],
  ];
  return bubbles.map(([x, y, r], i) => {
    const far = Math.hypot(W - x, H - y) / Math.hypot(W, H);
    const tone = far < 0.3 ? "a" : far < 0.55 ? "b" : "c";
    return (
      <g key={i} className="dialog-motif-bubble" style={delay(i * 55)}>
        <circle cx={x} cy={y} r={r} className={`dialog-motif-bubble-body dialog-motif-bubble-body--${tone}`} />
        <ellipse cx={x - r * 0.35} cy={y - r * 0.42} rx={r * 0.4} ry={r * 0.22} className="dialog-motif-gloss" transform={`rotate(-30 ${x - r * 0.35} ${y - r * 0.42})`} />
      </g>
    );
  });
}

function vagues(paint: Paint): ReactNode {
  // Vagues qui roulent du coin vers le haut à gauche.
  return [0, 1, 2, 3, 4, 5, 6].map((k) => (
    <Line
      key={k}
      d={`M${640} ${300 - k * 34} C${520 - k * 6} ${330 - k * 40} ${440 - k * 10} ${200 - k * 30} ${330 - k * 14} ${190 - k * 28} S${170 - k * 10} ${120 - k * 22} ${40 - k * 6} ${150 - k * 30}`}
      paint={paint}
      width={k % 2 ? 1.1 : 2}
      i={k}
      g={k % 2 ? "fil2" : "fil"}
    />
  ));
}

function rayons(paint: Paint): ReactNode {
  // Soleil levant au coin : rayons en éventail vers le haut à gauche.
  const rays = Array.from({ length: 13 }, (_, i) => {
    const angle = (Math.PI / 2) * (0.03 + (i / 12) * 0.94);
    const len = 330 + ((i * 53) % 150);
    return [W - Math.cos(angle) * len, H - Math.sin(angle) * len] as const;
  });
  return (
    <>
      <circle cx={W} cy={H} r={86} className="dialog-motif-fill dialog-motif-fill--strong" style={delay(0)} />
      <circle cx={W} cy={H} r={130} className="dialog-motif-fill" style={delay(80)} />
      {rays.map(([x, y], i) => (
        <g key={i}>
          <Line d={`M${W - (W - x) * 0.3} ${H - (H - y) * 0.3} L${x} ${y}`} paint={paint} width={i % 2 ? 1.1 : 2.2} i={i} g={i % 3 ? "fil" : "fil2"} />
          {i % 2 === 0 && <Pearl x={x} y={y} r={2.4} i={i} />}
        </g>
      ))}
    </>
  );
}

function constellation(paint: Paint): ReactNode {
  const stars: [number, number][] = [
    [560, 350], [500, 290], [540, 220], [430, 260], [400, 180], [470, 130], [330, 210], [300, 120], [370, 70], [220, 160], [240, 60], [150, 100],
  ];
  const links: [number, number][] = [[0, 1], [1, 2], [1, 3], [3, 4], [2, 5], [4, 5], [4, 6], [6, 7], [7, 8], [6, 9], [7, 10], [9, 11]];
  return (
    <>
      {links.map(([a, b], i) => (
        <Line key={i} d={`M${stars[a]![0]} ${stars[a]![1]} L${stars[b]![0]} ${stars[b]![1]}`} paint={paint} width={1.1} i={i} g={i % 2 ? "fil2" : "fil"} />
      ))}
      {stars.map(([x, y], i) => (
        <Pearl key={i} x={x} y={y} r={i % 3 === 0 ? 4 : 2.6} i={i} />
      ))}
      {[[460, 360], [280, 280], [180, 220], [560, 120], [110, 40]].map(([x, y], i) => (
        <path
          key={i}
          d={`M${x} ${y! - 8} L${x! + 2} ${y! - 2} L${x! + 8} ${y} L${x! + 2} ${y! + 2} L${x} ${y! + 8} L${x! - 2} ${y! + 2} L${x! - 8} ${y} L${x! - 2} ${y! - 2}Z`}
          className="dialog-motif-spark"
          style={delay(420 + i * 60)}
        />
      ))}
    </>
  );
}

function ondes(paint: Paint): ReactNode {
  // Ondes concentriques autour du coin, comme une goutte tombée dans l'eau.
  const radii = [70, 130, 190, 250, 310, 370, 430];
  return (
    <>
      {radii.map((r, i) => (
        <Line key={r} d={`M${W - r} ${H} A${r} ${r} 0 0 1 ${W} ${H - r}`} paint={paint} width={i % 2 ? 1.1 : 2.2} i={i} g={i % 2 ? "fil2" : "fil"} />
      ))}
      {[[190, 0.5], [310, 0.95], [130, 1.15], [370, 0.3], [250, 1.3]].map(([r, a], i) => (
        <Pearl key={i} x={W - r! * Math.cos(a!)} y={H - r! * Math.sin(a!)} r={3 - i * 0.3} i={i} />
      ))}
    </>
  );
}

export function DialogMotif({ kind }: { kind: DialogMotifKind }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const paint: Paint = (g = "fil") => `url(#${uid}-${g})`;
  const body = {
    traits: () => traits(paint),
    globe: () => globe(paint),
    bulles: () => bulles(),
    vagues: () => vagues(paint),
    rayons: () => rayons(paint),
    constellation: () => constellation(paint),
    ondes: () => ondes(paint),
  }[kind]();
  return (
    <svg className="dialog-motif" data-motif={kind} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMaxYMax slice" aria-hidden="true" focusable="false">
      <defs>
        {/* Couleurs le long de la trajectoire : du coin (teinte a) vers le centre (b, puis c), puis fondu. */}
        <linearGradient id={`${uid}-fil`} gradientUnits="userSpaceOnUse" x1={W} y1={H} x2={W * 0.12} y2={0}>
          <stop offset="0" className="dialog-motif-stop-a" />
          <stop offset="0.45" className="dialog-motif-stop-b" />
          <stop offset="0.8" className="dialog-motif-stop-c" />
          <stop offset="1" className="dialog-motif-stop-c" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${uid}-fil2`} gradientUnits="userSpaceOnUse" x1={W} y1={H} x2={W * 0.12} y2={0}>
          <stop offset="0" className="dialog-motif-stop-b" />
          <stop offset="0.45" className="dialog-motif-stop-c" />
          <stop offset="0.8" className="dialog-motif-stop-a" />
          <stop offset="1" className="dialog-motif-stop-a" stopOpacity="0" />
        </linearGradient>
        {/* Voile coloré qui part du coin et se fond dans toute la fenêtre. Densités plafonnées pour
            que tout texte posé dessus reste lisible (src/theme/dialogDecor.contrast.test.ts). */}
        <radialGradient id={`${uid}-voile`} gradientUnits="userSpaceOnUse" cx={W} cy={H} r={W * 0.95}>
          <stop offset="0" className="dialog-motif-stop-a" stopOpacity="0.2" />
          <stop offset="0.35" className="dialog-motif-stop-b" stopOpacity="0.16" />
          <stop offset="0.7" className="dialog-motif-stop-c" stopOpacity="0.07" />
          <stop offset="1" className="dialog-motif-stop-c" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width={W} height={H} fill={`url(#${uid}-voile)`} className="dialog-motif-veil" />
      {body}
    </svg>
  );
}
