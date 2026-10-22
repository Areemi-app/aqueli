/**
 * Bannières des thèmes : une frise dessinée (SVG) propre à chaque thème, peinte dans la barre de
 * titre et limitée à elle (src/styles/shell.css, `.titlebar-banner`).
 *
 * La frise fait 2000 × 64, se cale sur la hauteur de la barre et se centre : la même abscisse tombe
 * toujours au même endroit par rapport à la recherche, quelle que soit la largeur de la fenêtre ;
 * l'image déborde de PAD de chaque côté pour les traits de lumière. Pas de bande de sol : la barre
 * est une capsule de verre et les dessins y flottent. Les dessins marquants se tiennent dans
 * les deux zones dégagées de part et d'autre de la recherche (LEFT, RIGHT, et FOCUS pour le
 * soleil ou la lune) ; derrière la recherche, seulement le sol (collines, vagues). Les éléments
 * semés (bulles, feuilles, flocons…) ne se touchent jamais (`scatter`). Une même graine donne
 * toujours la même scène.
 */
import type { ThemeId } from "./themes";

const W = 2000;
const H = 64;
const WHITE = "#ffffff";
/** Débord de l'image de chaque côté, et étendue dessinée. */
const PAD = 700;
const X0 = -PAD;
const X1 = W + PAD;
const SPAN = X1 - X0;

/**
 * Zones où semer, à gauche et à droite de la recherche (cachées en partie par les boutons quand la
 * fenêtre est étroite). La recherche, centrée, ne dépasse pas 440 px : juste à côté d'elle, la
 * place est toujours libre, d'où FOCUS (soleil, lune) et SIDE (l'autre dessin principal).
 */
const LEFT = [430, 790] as const;
const RIGHT = [1250, 1690] as const;
const FOCUS = 1270;
const SIDE = 730;

const f = (n: number) => Math.round(n * 10) / 10;

/** Suite pseudo-aléatoire reproductible. */
function rng(seed: number): () => number {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

const fill = (c: string, o = 1) => `fill="${c}"${o < 1 ? ` fill-opacity="${o}"` : ""}`;
const line = (c: string, w: number, o = 1) =>
  `fill="none" stroke="${c}" stroke-width="${f(w)}" stroke-linecap="round" stroke-linejoin="round"${o < 1 ? ` stroke-opacity="${o}"` : ""}`;

/** Rectangle où semer : x de début et de fin, y de début et de fin. */
type Box = readonly [number, number, number, number];
type Spot = { x: number; y: number; r: number };

const left = (y0: number, y1: number): Box => [LEFT[0], LEFT[1], y0, y1];
const right = (y0: number, y1: number): Box => [RIGHT[0], RIGHT[1], y0, y1];

/** `n` emplacements au plus dans `box`, de rayon entre `r0` et `r1`, séparés d'au moins `gap` (et des `avoid`). */
export function scatter(n: number, box: Box, [r0, r1]: readonly [number, number], seed: number, gap = 5, avoid: Spot[] = []): Spot[] {
  const [x0, x1, y0, y1] = box;
  const r = rng(seed);
  const out: Spot[] = [];
  for (let k = 0; out.length < n && k < n * 80; k++) {
    const rad = r0 + r() * (r1 - r0);
    const s = { x: x0 + rad + r() * Math.max(0, x1 - x0 - 2 * rad), y: y0 + rad + r() * Math.max(0, y1 - y0 - 2 * rad), r: rad };
    if ([...avoid, ...out].every((o) => Math.hypot(o.x - s.x, o.y - s.y) > o.r + s.r + gap)) out.push(s);
  }
  return out;
}

// ——— Sols ———

/** Groupe de `n` montagnes de x0 à x1, posé sur le bas, avec neige au sommet si `snow`. */
function peaks(x0: number, x1: number, y: number, amp: number, n: number, c: string, o: number, seed: number, snow?: string): string {
  const r = rng(seed);
  const pts: [number, number][] = [[x0, H]];
  for (let i = 1; i < n * 2; i++) pts.push([x0 + (i * (x1 - x0)) / (n * 2), i % 2 ? y - amp * (0.55 + r() * 0.45) : y - r() * amp * 0.25]);
  pts.push([x1, H]);
  let s = `<path d="M${pts.map(([x, yy]) => `${f(x)} ${f(yy)}`).join("L")}Z" ${fill(c, o)}/>`;
  if (snow) {
    for (let i = 1; i < pts.length - 1; i += 2) {
      const [px, py] = pts[i]!;
      const [lx, ly] = pts[i - 1]!;
      const [rx, ry] = pts[i + 1]!;
      const a = 0.28;
      s += `<path d="M${f(px)} ${f(py)}L${f(px + (rx - px) * a)} ${f(py + (ry - py) * a)}L${f(px + (rx - px) * 0.12)} ${f(py + (ry - py) * 0.2)}L${f(px)} ${f(py + (ly - py) * 0.22)}L${f(px + (lx - px) * 0.14)} ${f(py + (ly - py) * 0.18)}L${f(px + (lx - px) * a)} ${f(py + (ly - py) * a)}Z" ${fill(snow, 0.9)}/>`;
    }
  }
  return s;
}

// ——— Arbres et plantes ———

const pine = (x: number, by: number, h: number, c: string, o = 1) =>
  `<path d="M${x} ${by - h}L${f(x + h * 0.24)} ${f(by - h * 0.55)}L${f(x + h * 0.12)} ${f(by - h * 0.55)}L${f(x + h * 0.34)} ${f(by - h * 0.18)}L${f(x + h * 0.06)} ${f(by - h * 0.18)}L${f(x + h * 0.06)} ${by}L${f(x - h * 0.06)} ${by}L${f(x - h * 0.06)} ${f(by - h * 0.18)}L${f(x - h * 0.34)} ${f(by - h * 0.18)}L${f(x - h * 0.12)} ${f(by - h * 0.55)}L${f(x - h * 0.24)} ${f(by - h * 0.55)}Z" ${fill(c, o)}/>`;

const pines = (xs: number[], by: number, h: number, c: string, o = 1) => xs.map((x, i) => pine(x, by, h * (0.75 + ((i * 37) % 10) / 30), c, o)).join("");

/** Arbre rond (sucette), pour les collines d'automne et de prairie. */
const roundTree = (x: number, by: number, h: number, crown: string, trunk: string, o = 1) =>
  `<path d="M${x} ${by}L${x} ${f(by - h * 0.55)}" ${line(trunk, h * 0.07, o)}/><circle cx="${x}" cy="${f(by - h * 0.7)}" r="${f(h * 0.3)}" ${fill(crown, o)}/>`;

/** Cyprès (flamme sombre). */
const cypress = (x: number, by: number, h: number, c: string, o = 0.85) =>
  `<path d="M${x} ${by}Q${f(x - h * 0.17)} ${f(by - h * 0.55)} ${x} ${f(by - h)}Q${f(x + h * 0.17)} ${f(by - h * 0.55)} ${x} ${by}Z" ${fill(c, o)}/>`;

function palm(x: number, by: number, h: number, c: string, o = 1): string {
  const tx = x + h * 0.18;
  const ty = by - h;
  let s = `<path d="M${x} ${by}Q${f(x + h * 0.02)} ${f(by - h * 0.55)} ${f(tx)} ${f(ty)}" ${line(c, h * 0.055, o)}/>`;
  for (const a of [-170, -130, -95, -55, -15]) {
    const rad = (a * Math.PI) / 180;
    const ex = tx + Math.cos(rad) * h * 0.6;
    const ey = ty + Math.sin(rad) * h * 0.35 + h * 0.3;
    s += `<path d="M${f(tx)} ${f(ty)}Q${f((tx + ex) / 2)} ${f(ty - h * 0.22)} ${f(ex)} ${f(ey)}" ${line(c, h * 0.045, o)}/>`;
  }
  return s;
}

/** Fleur à cinq pétales, sur sa tige (sans tige : fleur de branche). */
function flower(x: number, y: number, s: number, petal: string, heart: string, stem: string | null): string {
  let p = stem ? `<path d="M${f(x)} ${H}Q${f(x - s * 0.8)} ${f((y + H) / 2)} ${f(x)} ${f(y)}" ${line(stem, Math.max(0.6, s * 0.2), 0.7)}/>` : "";
  for (let k = 0; k < 5; k++) p += `<ellipse cx="${f(x)}" cy="${f(y - s * 0.55)}" rx="${f(s * 0.36)}" ry="${f(s * 0.6)}" transform="rotate(${k * 72} ${f(x)} ${f(y)})" ${fill(petal)}/>`;
  return `${p}<circle cx="${f(x)}" cy="${f(y)}" r="${f(s * 0.32)}" ${fill(heart)}/>`;
}

function flowers(n: number, box: Box, size: readonly [number, number], colors: string[], heart: string, stem: string | null, seed: number, avoid: Spot[] = []): string {
  return scatter(n, box, size, seed, 2, avoid)
    .map((s, i) => flower(s.x, s.y, s.r, colors[i % colors.length]!, heart, stem))
    .join("");
}

const leaf = (x: number, y: number, s: number, turn: number, c: string, vein: string, o = 1) =>
  `<g transform="translate(${f(x)} ${f(y)}) rotate(${f(turn)})" opacity="${o}"><path d="M0 ${f(-s)}Q${f(s * 0.75)} 0 0 ${f(s)}Q${f(-s * 0.75)} 0 0 ${f(-s)}Z" ${fill(c)}/><path d="M0 ${f(-s * 0.8)}L0 ${f(s * 0.85)}" ${line(vein, Math.max(0.5, s * 0.08), 0.6)}/></g>`;

function leaves(n: number, box: Box, colors: string[], vein: string, seed: number, size: number, avoid: Spot[] = []): string {
  const turn = rng(seed + 7);
  return scatter(n, box, [size * 0.7, size * 1.3], seed, 4, avoid)
    .map((s, i) => leaf(s.x, s.y, s.r, turn() * 360, colors[i % colors.length]!, vein, 0.85))
    .join("");
}

function bamboo(x: number, by: number, h: number, c: string, o = 1): string {
  const w = Math.max(2, h * 0.05);
  let s = `<path d="M${x} ${by}L${x} ${f(by - h)}" ${line(c, w, o)}/>`;
  for (let y = by - h * 0.2; y > by - h; y -= h * 0.2) s += `<path d="M${f(x - w * 0.8)} ${f(y)}L${f(x + w * 0.8)} ${f(y)}" ${line(WHITE, Math.max(0.5, w * 0.25), o * 0.7)}/>`;
  const k = h * 0.09;
  return (
    s +
    leaf(x + k * 1.2, by - h + k * 2.2, k, 60, c, WHITE, o) +
    leaf(x - k * 1.15, by - h + k * 4.2, k * 0.92, -60, c, WHITE, o) +
    leaf(x + k * 1.1, by - h + k * 6.4, k * 0.85, 70, c, WHITE, o)
  );
}

/** Brin de lavande. */
function lavender(x: number, by: number, h: number, flowerC: string, stem: string): string {
  let s = `<path d="M${x} ${by}L${x} ${by - h}" ${line(stem, 0.8, 0.8)}/>`;
  for (let k = 0; k < 6; k++) s += `<ellipse cx="${f(x + (k % 2 ? h * 0.07 : -h * 0.07))}" cy="${f(by - h + k * h * 0.13)}" rx="${f(h * 0.08)}" ry="${f(h * 0.11)}" ${fill(flowerC, 0.95)}/>`;
  return s;
}

/** Grappe de glycine suspendue. */
function wisteria(x: number, y: number, len: number, c: string, c2: string): string {
  let s = "";
  for (let k = 0; k < 9; k++) {
    const w = (len / 3) * (1 - k / 10);
    const rad = len * 0.075 * (1 - k * 0.07);
    for (const dx of [-w / 2, 0, w / 2]) s += `<circle cx="${f(x + dx * (k % 2 ? 0.8 : 1))}" cy="${f(y + k * (len / 9))}" r="${f(rad)}" ${fill(k % 3 === 0 ? c2 : c, 0.85)}/>`;
  }
  return s;
}

/** Rameau d'olivier. */
function oliveBranch(x: number, y: number, len: number, c: string, fruit: string): string {
  let s = `<path d="M${x} ${y}q${f(len * 0.5)} ${f(-len * 0.06)} ${len} ${f(len * 0.02)}" ${line(c, Math.max(1, len * 0.008), 0.9)}/>`;
  for (let k = 1; k < 8; k++) {
    const px = x + (len * k) / 8;
    const py = y - len * 0.02 * Math.sin((k / 8) * Math.PI);
    s += leaf(px, py + (k % 2 ? -len * 0.03 : len * 0.03), len * 0.035, k % 2 ? -35 : 35, c, WHITE, 0.9);
  }
  return s + `<ellipse cx="${f(x + len * 0.45)}" cy="${f(y + len * 0.02)}" rx="${f(len * 0.016)}" ry="${f(len * 0.022)}" ${fill(fruit)}/><ellipse cx="${f(x + len * 0.72)}" cy="${f(y + len * 0.01)}" rx="${f(len * 0.016)}" ry="${f(len * 0.022)}" ${fill(fruit)}/>`;
}

// ——— Ciel ———

function glow(x: number, y: number, r: number, c: string, o: number, id: string): string {
  return `<defs><radialGradient id="${id}"><stop offset="0" stop-color="${c}" stop-opacity="${o}"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient></defs><circle cx="${x}" cy="${y}" r="${r}" fill="url(#${id})"/>`;
}

function sun(x: number, y: number, r: number, c: string, rays = true): string {
  let s = glow(x, y, r * 2.8, c, 0.55, `sun${x}`) + `<circle cx="${x}" cy="${y}" r="${r}" ${fill(c)}/>`;
  if (rays) {
    for (let k = 0; k < 12; k++) {
      const a = (k * Math.PI) / 6;
      s += `<path d="M${f(x + Math.cos(a) * r * 1.35)} ${f(y + Math.sin(a) * r * 1.35)}L${f(x + Math.cos(a) * r * 1.75)} ${f(y + Math.sin(a) * r * 1.75)}" ${line(c, Math.max(1, r * 0.13), 0.75)}/>`;
    }
  }
  return s;
}

const moon = (x: number, y: number, r: number, c: string) =>
  glow(x, y, r * 2.4, c, 0.35, `moon${x}`) + `<path d="M${x} ${y - r}A${r} ${r} 0 1 0 ${x} ${y + r}A${f(r * 0.72)} ${r} 0 1 1 ${x} ${y - r}Z" ${fill(c)}/>`;

const sparkle = (x: number, y: number, s: number, c: string, o = 1) =>
  `<path d="M${f(x)} ${f(y - s)}Q${f(x)} ${f(y)} ${f(x + s)} ${f(y)}Q${f(x)} ${f(y)} ${f(x)} ${f(y + s)}Q${f(x)} ${f(y)} ${f(x - s)} ${f(y)}Q${f(x)} ${f(y)} ${f(x)} ${f(y - s)}Z" ${fill(c, o)}/>`;

/** Étoiles : petits points, et quelques étincelles pour les plus grandes. */
function stars(n: number, box: Box, c: string, seed: number, avoid: Spot[] = []): string {
  const o = rng(seed + 3);
  return scatter(n, box, [0.7, 2.8], seed, 3, avoid)
    .map((s) => (s.r > 2.2 ? sparkle(s.x, s.y, s.r * 1.4, c, 0.9) : `<circle cx="${f(s.x)}" cy="${f(s.y)}" r="${f(s.r * 0.6)}" ${fill(c, f(0.5 + o() * 0.5))}/>`))
    .join("");
}

const cloud = (x: number, y: number, s: number, c: string, o = 1) =>
  `<g ${fill(c, o)}><ellipse cx="${x}" cy="${y}" rx="${f(62 * s)}" ry="${f(15 * s)}"/><circle cx="${f(x - 26 * s)}" cy="${f(y - 9 * s)}" r="${f(19 * s)}"/><circle cx="${f(x + 6 * s)}" cy="${f(y - 18 * s)}" r="${f(25 * s)}"/><circle cx="${f(x + 34 * s)}" cy="${f(y - 6 * s)}" r="${f(15 * s)}"/></g>`;

/** Place qu'occupe un nuage, pour que rien ne s'y pose. */
const cloudSpot = (x: number, y: number, s: number): Spot => ({ x: x + 4 * s, y: y - 12 * s, r: 58 * s });

const birds = (pts: [number, number, number][], c: string) =>
  pts.map(([x, y, s]) => `<path d="M${x} ${y}q${f(5 * s)} ${f(-6 * s)} ${f(10 * s)} 0q${f(5 * s)} ${f(-6 * s)} ${f(10 * s)} 0" ${line(c, 1.2, 0.8)}/>`).join("");

const bubble = (x: number, y: number, r: number, c: string, o = 1) =>
  `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${c}" fill-opacity="${f(o * 0.18)}" stroke="${c}" stroke-opacity="${f(o)}" stroke-width="${f(Math.max(0.7, r * 0.11))}"/><path d="M${f(x - r * 0.55)} ${f(y - r * 0.15)}A${f(r * 0.6)} ${f(r * 0.6)} 0 0 1 ${f(x - r * 0.1)} ${f(y - r * 0.6)}" ${line(WHITE, Math.max(0.7, r * 0.15), o)}/>`;

function bubbles(n: number, box: Box, c: string, seed: number, size: readonly [number, number], avoid: Spot[] = []): string {
  const o = rng(seed + 5);
  return scatter(n, box, size, seed, 6, avoid)
    .map((s) => bubble(s.x, s.y, s.r, c, 0.6 + o() * 0.35))
    .join("");
}

/** Bulle irisée (dégradé arc-en-ciel discret). */
function iridescent(x: number, y: number, r: number, i: number): string {
  return `<defs><linearGradient id="iri${i}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffd1f0"/><stop offset=".35" stop-color="#c9f0ff"/><stop offset=".7" stop-color="#e2ffd6"/><stop offset="1" stop-color="#fff1c2"/></linearGradient></defs><circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="url(#iri${i})" fill-opacity=".7" stroke="#a99cf0" stroke-opacity=".75" stroke-width="${f(Math.max(0.9, r * 0.1))}"/><path d="M${f(x - r * 0.55)} ${f(y - r * 0.2)}A${f(r * 0.6)} ${f(r * 0.6)} 0 0 1 ${f(x - r * 0.15)} ${f(y - r * 0.6)}" ${line(WHITE, Math.max(0.8, r * 0.16), 0.9)}/>`;
}

const flake = (x: number, y: number, s: number, c: string, o = 1) => {
  let p = "";
  for (let k = 0; k < 3; k++) {
    const a = (k * Math.PI) / 3;
    p += `M${f(x - Math.cos(a) * s)} ${f(y - Math.sin(a) * s)}L${f(x + Math.cos(a) * s)} ${f(y + Math.sin(a) * s)}`;
  }
  return `<path d="${p}" ${line(c, Math.max(0.7, s * 0.22), o)}/>`;
};

function flakes(n: number, box: Box, c: string, seed: number, avoid: Spot[] = []): string {
  const o = rng(seed + 9);
  return scatter(n, box, [1.6, 3.8], seed, 4, avoid)
    .map((s) => flake(s.x, s.y, s.r, c, f(0.6 + o() * 0.4)))
    .join("");
}

const heart = (x: number, y: number, s: number, c: string, o = 1) =>
  `<path d="M${f(x)} ${f(y + s * 0.35)}C${f(x - s)} ${f(y - s * 0.25)} ${f(x - s * 0.5)} ${f(y - s)} ${f(x)} ${f(y - s * 0.45)}C${f(x + s * 0.5)} ${f(y - s)} ${f(x + s)} ${f(y - s * 0.25)} ${f(x)} ${f(y + s * 0.35)}Z" ${fill(c, o)}/>`;

function hearts(n: number, box: Box, colors: string[], seed: number, avoid: Spot[] = []): string {
  const o = rng(seed + 11);
  return scatter(n, box, [3.6, 7.5], seed, 6, avoid)
    .map((s, i) => heart(s.x, s.y + s.r * 0.3, s.r * 1.4, colors[i % colors.length]!, f(0.6 + o() * 0.35)))
    .join("");
}

function firework(x: number, y: number, r: number, c: string): string {
  let s = "";
  for (let k = 0; k < 14; k++) {
    const a = (k * Math.PI * 2) / 14;
    s += `<path d="M${f(x + Math.cos(a) * r * 0.3)} ${f(y + Math.sin(a) * r * 0.3)}L${f(x + Math.cos(a) * r)} ${f(y + Math.sin(a) * r)}" ${line(c, Math.max(0.8, r * 0.08), 0.85)}/><circle cx="${f(x + Math.cos(a) * r * 1.15)}" cy="${f(y + Math.sin(a) * r * 1.15)}" r="${f(Math.max(0.7, r * 0.08))}" ${fill(c)}/>`;
  }
  return s;
}

function confetti(n: number, box: Box, colors: string[], seed: number, avoid: Spot[] = []): string {
  const t = rng(seed + 13);
  return scatter(n, box, [2, 2.6], seed, 4, avoid)
    .map((s, i) => `<rect x="${f(s.x - 2.5)}" y="${f(s.y - 1)}" width="5" height="2" rx=".6" transform="rotate(${f(t() * 180)} ${f(s.x)} ${f(s.y)})" ${fill(colors[i % colors.length]!, 0.85)}/>`)
    .join("");
}

/** Rubans d'aurore boréale. */
function aurora(y: number, h: number, c1: string, c2: string): string {
  const band = (yy: number, amp: number, c: string, id: string) =>
    `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c}" stop-opacity="0"/><stop offset=".6" stop-color="${c}" stop-opacity=".55"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></linearGradient></defs><path d="M180 ${yy}C700 ${yy - amp} 900 ${yy + amp} 1100 ${yy}S1500 ${yy - amp} 1860 ${yy + 3}L1860 ${f(yy + h)}C1500 ${f(yy + h * 0.7)} 1300 ${f(yy + h * 1.2)} 1100 ${f(yy + h * 0.85)}S700 ${f(yy + h * 0.45)} 180 ${f(yy + h)}Z" fill="url(#${id})"/>`;
  return band(y, h * 0.6, c1, "au1") + band(y + h * 0.4, h * 0.45, c2, "au2");
}

function jellyfish(x: number, y: number, s: number, c: string): string {
  let t = "";
  for (let k = 0; k < 4; k++) t += `<path d="M${f(x - s * 0.6 + k * s * 0.4)} ${f(y)}q${f(s * 0.2)} ${f(s * 0.5)} 0 ${f(s)}t0 ${f(s)}" ${line(c, Math.max(0.7, s * 0.1), 0.7)}/>`;
  return `<path d="M${f(x - s)} ${y}Q${f(x - s)} ${f(y - s * 1.2)} ${x} ${f(y - s * 1.2)}Q${f(x + s)} ${f(y - s * 1.2)} ${f(x + s)} ${y}Q${x} ${f(y + s * 0.3)} ${f(x - s)} ${y}Z" ${fill(c, 0.55)}/>${t}`;
}

function coral(x: number, by: number, h: number, c: string): string {
  return `<path d="M${x} ${by}L${x} ${by - h}M${x} ${f(by - h * 0.45)}Q${f(x - h * 0.35)} ${f(by - h * 0.55)} ${f(x - h * 0.35)} ${f(by - h * 0.85)}M${x} ${f(by - h * 0.6)}Q${f(x + h * 0.35)} ${f(by - h * 0.65)} ${f(x + h * 0.32)} ${f(by - h * 0.95)}M${f(x - h * 0.2)} ${f(by - h * 0.6)}L${f(x - h * 0.08)} ${f(by - h * 0.78)}" ${line(c, Math.max(1.4, h * 0.11), 0.85)}/>`;
}

const fish = (x: number, y: number, s: number, c: string, o = 1) =>
  `<path d="M${f(x - s)} ${y}Q${x} ${f(y - s * 0.6)} ${f(x + s)} ${y}Q${x} ${f(y + s * 0.6)} ${f(x - s)} ${y}ZM${f(x + s)} ${y}L${f(x + s * 1.5)} ${f(y - s * 0.4)}L${f(x + s * 1.5)} ${f(y + s * 0.4)}Z" ${fill(c, o)}/>`;

function rainbow(x: number, y: number, r: number, o: number, w: number): string {
  return ["#ff6b6b", "#ffb347", "#ffe66d", "#7ed957", "#4fc3f7", "#9575cd"]
    .map((c, i) => `<path d="M${f(x - r + i * w)} ${y}A${f(r - i * w)} ${f(r - i * w)} 0 0 1 ${f(x + r - i * w)} ${y}" ${line(c, w, o)}/>`)
    .join("");
}

function balloon(x: number, y: number, s: number, c1: string, c2: string): string {
  return `<path d="M${x} ${f(y + s)}C${f(x - s * 1.1)} ${f(y + s * 0.2)} ${f(x - s * 0.9)} ${f(y - s * 1.1)} ${x} ${f(y - s * 1.1)}C${f(x + s * 0.9)} ${f(y - s * 1.1)} ${f(x + s * 1.1)} ${f(y + s * 0.2)} ${x} ${f(y + s)}Z" ${fill(c1)}/><path d="M${x} ${f(y + s)}C${f(x - s * 0.4)} ${f(y + s * 0.2)} ${f(x - s * 0.35)} ${f(y - s * 1.1)} ${x} ${f(y - s * 1.1)}C${f(x + s * 0.35)} ${f(y - s * 1.1)} ${f(x + s * 0.4)} ${f(y + s * 0.2)} ${x} ${f(y + s)}Z" ${fill(c2)}/><path d="M${f(x - s * 0.35)} ${f(y + s * 0.85)}L${f(x - s * 0.2)} ${f(y + s * 1.35)}M${f(x + s * 0.35)} ${f(y + s * 0.85)}L${f(x + s * 0.2)} ${f(y + s * 1.35)}" ${line("#7a5a3a", 0.7)}/><rect x="${f(x - s * 0.22)}" y="${f(y + s * 1.35)}" width="${f(s * 0.44)}" height="${f(s * 0.3)}" rx="${f(s * 0.08)}" ${fill("#9a6b3f")}/>`;
}

/** Boule de Noël suspendue au haut de la barre. */
function ornament(x: number, len: number, r: number, c: string): string {
  return `<path d="M${x} 0L${x} ${len}" ${line(WHITE, 0.7, 0.7)}/><circle cx="${x}" cy="${f(len + r)}" r="${r}" ${fill(c)}/><rect x="${f(x - r * 0.3)}" y="${f(len - r * 0.25)}" width="${f(r * 0.6)}" height="${f(r * 0.45)}" rx="${f(r * 0.1)}" ${fill("#ffd36b")}/><path d="M${f(x - r * 0.45)} ${f(len + r * 0.65)}A${f(r * 0.55)} ${f(r * 0.55)} 0 0 1 ${f(x - r * 0.05)} ${f(len + r * 0.3)}" ${line(WHITE, Math.max(0.7, r * 0.18), 0.8)}/>`;
}

function egg(x: number, y: number, s: number, c: string, band: string): string {
  const step = s * 0.23;
  const z = s * 0.3;
  return `<ellipse cx="${x}" cy="${y}" rx="${f(s * 0.72)}" ry="${s}" ${fill(c)}/><path d="M${f(x - s * 0.62)} ${y}l${f(step)} ${f(-z)}l${f(step)} ${f(z)}l${f(step)} ${f(-z)}l${f(step)} ${f(z)}l${f(step)} ${f(-z)}" ${line(band, Math.max(0.7, s * 0.14))}/>`;
}

function pumpkin(x: number, by: number, s: number): string {
  return `<g ${fill("#ff8c1a")}><ellipse cx="${f(x - s * 0.4)}" cy="${f(by - s * 0.7)}" rx="${f(s * 0.55)}" ry="${f(s * 0.7)}"/><ellipse cx="${f(x + s * 0.4)}" cy="${f(by - s * 0.7)}" rx="${f(s * 0.55)}" ry="${f(s * 0.7)}"/></g><ellipse cx="${x}" cy="${f(by - s * 0.7)}" rx="${f(s * 0.5)}" ry="${f(s * 0.72)}" ${fill("#ffa53d")}/><path d="M${x} ${f(by - s * 1.35)}q${f(s * 0.14)} ${f(-s * 0.36)} ${f(s * 0.4)} ${f(-s * 0.4)}" ${line("#3a6a2a", Math.max(0.8, s * 0.14))}/>`;
}

const bat = (x: number, y: number, s: number, c: string) =>
  `<path d="M${x} ${y}q${f(-s * 0.5)} ${f(-s * 0.6)} ${f(-s * 1.4)} ${f(-s * 0.4)}q${f(s * 0.3)} ${f(s * 0.3)} ${f(s * 0.1)} ${f(s * 0.6)}q${f(s * 0.4)} ${f(-s * 0.2)} ${f(s * 0.6)} ${f(s * 0.1)}q${f(s * 0.3)} ${f(-s * 0.4)} ${f(s * 0.7)} ${f(-s * 0.3)}q${f(s * 0.4)} ${f(-s * 0.1)} ${f(s * 0.7)} ${f(s * 0.3)}q${f(s * 0.2)} ${f(-s * 0.3)} ${f(s * 0.6)} ${f(-s * 0.1)}q${f(-s * 0.2)} ${f(-s * 0.3)} ${f(s * 0.1)} ${f(-s * 0.6)}q${f(-s * 0.9)} ${f(-s * 0.2)} ${f(-s * 1.4)} ${f(s * 0.4)}Z" ${fill(c)}/>`;

/** Dessin fait à l'échelle 1, posé en (x, by) et réduit de `k`. */
const placed = (x: number, by: number, k: number, svg: string) => `<g transform="translate(${x} ${by}) scale(${k})">${svg}</g>`;

const zenStones = (x: number, by: number, k: number, c1: string, c2: string) =>
  placed(x, by, k, `<ellipse cx="0" cy="-10" rx="34" ry="12" ${fill(c1)}/><ellipse cx="3" cy="-31" rx="25" ry="10" ${fill(c2)}/><ellipse cx="-2" cy="-48" rx="17" ry="8" ${fill(c1)}/><ellipse cx="1" cy="-61" rx="10" ry="6" ${fill(c2)}/>`);

const ripples = (x: number, by: number, k: number, c: string) =>
  placed(x, by, k, [60, 100, 145].map((r, i) => `<ellipse cx="0" cy="-4" rx="${r}" ry="${f(r * 0.16)}" ${line(c, 3, 0.6 - i * 0.15)}/>`).join(""));

const mug = (x: number, by: number, k: number, c: string, steam: string) =>
  placed(x, by, k, `<path d="M-22 -44L22 -44L18 0L-18 0Z" ${fill(c)}/><path d="M21 -34q15 0 13 12q-2 10 -15 9" ${line(c, 4)}/><path d="M-8 -52q-7 -10 0 -20t0 -20M6 -52q-7 -10 0 -20t0 -18" ${line(steam, 3, 0.75)}/>`);

const bolt = (x: number, y: number, s: number, c: string) =>
  `<path d="M${x} ${y}L${f(x - s * 0.55)} ${f(y + s * 1.1)}L${f(x - s * 0.05)} ${f(y + s * 1.1)}L${f(x - s * 0.4)} ${f(y + s * 2.1)}L${f(x + s * 0.6)} ${f(y + s * 0.75)}L${f(x + s * 0.1)} ${f(y + s * 0.75)}L${f(x + s * 0.45)} ${y}Z" ${fill(c)} stroke="${WHITE}" stroke-width="1" stroke-opacity=".7" stroke-linejoin="round"/>`;

/** Trait de lumière ondulé d'un bout à l'autre de la frise. */
function swoosh(y: number, c: string, o: number, amp: number, w: number): string {
  const [x0, x1] = [-200, W + 200];
  const d = x1 - x0;
  return `<path d="M${x0} ${y}C${f(x0 + d * 0.33)} ${y - amp} ${f(x0 + d * 0.66)} ${y + amp} ${x1} ${f(y - amp * 0.4)}" ${line(c, w, o)}/>`;
}

/** Facettes géométriques (thèmes minéraux). */
function facets(n: number, box: Box, c: string, seed: number): string {
  const o = rng(seed + 17);
  return scatter(n, box, [4, 10], seed, 4)
    .map(({ x, y, r: k }) => `<path d="M${f(x)} ${f(y - k)}L${f(x + k * 0.9)} ${f(y + k * 0.4)}L${f(x - k * 0.7)} ${f(y + k * 0.6)}Z" ${line(c, 0.9, f(0.3 + o() * 0.45))}/>`)
    .join("");
}

/** Drapés de velours accrochés au haut de la barre, avec leurs glands. */
function swags(x0: number, x1: number, n: number, sag: number, c: string, edge: string): string {
  const step = (x1 - x0) / n;
  let s = "";
  for (let i = 0; i < n; i++) {
    const a = x0 + i * step;
    const b = a + step;
    const m = a + step / 2;
    s += `<path d="M${f(a)} 0Q${f(m)} ${sag * 2} ${f(b)} 0Q${f(m)} ${f(sag * 1.1)} ${f(a)} 0Z" ${fill(c, 0.85)}/><path d="M${f(a)} 0Q${f(m)} ${sag * 2} ${f(b)} 0" ${line(edge, 1, 0.8)}/>`;
    if (i < n - 1) s += `<path d="M${f(b)} 0L${f(b)} ${f(sag * 0.9)}" ${line(edge, 0.8, 0.8)}/><path d="M${f(b - 2.2)} ${f(sag * 0.9)}L${f(b + 2.2)} ${f(sag * 0.9)}L${f(b + 1.4)} ${f(sag * 1.6)}L${f(b - 1.4)} ${f(sag * 1.6)}Z" ${fill(edge, 0.9)}/>`;
  }
  return s;
}

// ——— Scènes ———

type Scene = () => string;

const SCENES: Record<ThemeId, Scene> = {
  aqua: () =>
    glow(FOCUS, 10, 110, "#ffe9a8", 0.4, "g1") +
    swoosh(30, WHITE, 0.35, 9, 1.4) +
    swoosh(37, "#bff4ff", 0.3, 7, 0.9) +
    bubbles(3, [SIDE - 100, SIDE + 50, 8, 50], WHITE, 3, [4, 10]) +
    bubbles(2, [LEFT[0], SIDE - 110, 8, 50], WHITE, 6, [3, 7]) +
    bubbles(3, [FOCUS - 30, FOCUS + 130, 8, 50], WHITE, 5, [4, 11]) +
    bubbles(2, [FOCUS + 140, RIGHT[1], 8, 50], WHITE, 8, [3, 7]),
  jade: () =>
    glow(FOCUS, 10, 90, "#d8ffd0", 0.4, "g1") +
    bamboo(1430, 64, 58, "#2f9a5e", 0.8) +
    bamboo(1456, 64, 44, "#3fb46a", 0.75) +
    bamboo(SIDE, 64, 46, "#3fb46a", 0.7) +
    leaves(5, [LEFT[0], 700, 8, 46], ["#9fe0b0", "#5cc489", WHITE], "#2f9a5e", 11, 5.5) +
    leaves(4, [1480, RIGHT[1], 8, 46], ["#9fe0b0", "#5cc489", WHITE], "#2f9a5e", 12, 5.5),
  glycine: () =>
    `<path d="M${LEFT[0]} 4Q610 12 ${LEFT[1]} 5M${RIGHT[0]} 5Q1470 12 ${RIGHT[1]} 4" ${line("#6b4a8f", 1.6, 0.6)}/>` +
    [450, 530, 610, 690, 760, 1270, 1350, 1430, 1510, 1590, 1660].map((x, i) => wisteria(x, 7 + (i % 3) * 1.5, 22 + (i % 3) * 7, "#b9a2f2", "#e6dcff")).join(""),
  ambre: () =>
    sun(FOCUS, 44, 12, "#ffd27a", false) +
    birds([[560, 22, 0.55], [588, 30, 0.42], [1500, 18, 0.48]], "#7a3410"),
  nuage: () =>
    cloud(560, 40, 0.42, WHITE, 0.85) +
    cloud(720, 50, 0.3, WHITE, 0.7) +
    cloud(1440, 32, 0.36, WHITE, 0.9) +
    cloud(1610, 48, 0.32, WHITE, 0.75) +
    balloon(1300, 24, 8, "#ffb3cc", "#ffe08a") +
    birds([[640, 16, 0.45], [662, 22, 0.35]], "#5f89b5"),
  minuit: () =>
    moon(FOCUS, 26, 10, "#eaf3ff") +
    stars(18, left(4, 46), "#cfe4ff", 21, [cloudSpot(600, 46, 0.4)]) +
    stars(18, right(4, 46), "#cfe4ff", 22, [{ x: FOCUS, y: 26, r: 18 }]) +
    cloud(600, 46, 0.4, "#8fb8ff", 0.18),
  frutiger: () =>
    sun(FOCUS, 22, 9, "#ffe066") +
    rainbow(SIDE - 10, 66, 46, 0.5, 2.6) +
    cloud(540, 38, 0.32, WHITE, 0.85) +
    cloud(1540, 36, 0.3, WHITE, 0.8) +
    bubbles(4, [1400, RIGHT[1], 8, 46], WHITE, 14, [2, 6], [cloudSpot(1540, 36, 0.3)]),
  "nuit-etoilee": () => {
    const sign: [number, number][] = [[560, 22], [590, 14], [620, 26], [650, 18], [680, 32]];
    return (
      stars(16, left(4, 44), "#e9f1ff", 31, sign.map(([x, y]) => ({ x, y, r: 3 }))) +
      stars(20, right(4, 44), "#e9f1ff", 33, [{ x: FOCUS, y: 24, r: 18 }]) +
      `<path d="M${sign.map(([x, y]) => `${x} ${y}`).join("L")}" ${line("#bcd6ff", 0.8, 0.6)}/>` +
      sign.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.5" ${fill("#e9f1ff")}/>`).join("") +
      moon(FOCUS, 24, 9, "#fff6d6") +
      pines([440, 462, 1540, 1565, 1588], 64, 26, "#0b1640", 0.8)
    );
  },
  prairie: () =>
    sun(FOCUS, 20, 9, "#ffe680") +
    cloud(580, 30, 0.34, WHITE, 0.8) +
    cloud(1560, 26, 0.28, WHITE, 0.75) +
    roundTree(1440, 58, 34, "#4fae32", "#6b4a2a", 0.9) +
    roundTree(SIDE, 60, 26, "#5cbf3a", "#6b4a2a", 0.85) +
    flowers(12, [LEFT[0], SIDE - 16, 50, 60], [2.2, 3.4], ["#ff7aa8", "#ffd84d", WHITE, "#b388ff"], "#ffcc33", "#3f8f2a", 43) +
    flowers(12, [1470, RIGHT[1], 50, 60], [2.2, 3.4], ["#ff7aa8", "#ffd84d", WHITE, "#b388ff"], "#ffcc33", "#3f8f2a", 44),
  lagon: () =>
    sun(FOCUS, 18, 8, "#fff2b3") +
    palm(1380, 60, 44, "#1d7d77", 0.8) +
    palm(1412, 62, 34, "#26928a", 0.75) +
    coral(SIDE - 14, 64, 22, "#ff8a65") +
    coral(SIDE + 14, 64, 15, "#ffb199") +
    fish(620, 44, 6, "#ff9f80", 0.85) +
    fish(654, 52, 4.5, "#ffc2ad", 0.85),
  tropiques: () =>
    sun(FOCUS, 24, 10, "#ffd34d") +
    leaf(440, 8, 16, 120, "#1fa27a", WHITE, 0.85) +
    leaf(480, 4, 11, 150, "#8ee07a", WHITE, 0.8) +
    leaf(1660, 10, 18, 230, "#1fa27a", WHITE, 0.85) +
    leaf(1622, 26, 12, 200, "#8ee07a", WHITE, 0.8) +
    flower(570, 40, 6, "#ff6b8a", "#ffd34d", null) +
    flower(1560, 46, 5, "#ff9f6b", "#ffe08a", null) +
    palm(SIDE - 8, 64, 46, "#0f7a5a", 0.75) +
    palm(1470, 64, 38, "#13886a", 0.7),
  "aurore-boreale": () =>
    stars(12, left(4, 28), "#dffff0", 61) +
    stars(12, right(4, 28), "#dffff0", 63) +
    aurora(10, 18, "#50ffaa", "#aa5aff") +
    peaks(SIDE - 210, SIDE + 50, 62, 24, 3, "#0e2a4a", 0.85, 62, "#e6f6ff") +
    peaks(FOCUS + 40, FOCUS + 390, 62, 22, 3, "#0e2a4a", 0.85, 64, "#e6f6ff") +
    pines([440, 458, 1560, 1580, 1600, 1622], 64, 22, "#061a2e", 0.95),
  printemps: () =>
    `<path d="M400 0Q520 16 640 12Q700 10 760 20" ${line("#7a4a3a", 2, 0.7)}/>` +
    [[440, 7, 4.6], [480, 13, 3.8], [524, 9, 5], [568, 16, 3.6], [612, 9, 4.4], [662, 16, 3.8], [712, 10, 4.6], [752, 22, 3.6]]
      .map(([x, y, s], i) => flower(x!, y!, s!, ["#ffc2d6", "#fde2ec", "#f07aab"][i % 3]!, "#ffe08a", null))
      .join("") +
    leaves(6, right(8, 44), ["#ffc2d6", "#f07aab", "#fde2ec"], WHITE, 72, 3.8) +
    flowers(10, [RIGHT[0], RIGHT[1], 52, 60], [2.2, 3.4], ["#f07aab", WHITE, "#ffd84d"], "#ffcc33", "#7fbf6a", 74),
  ete: () =>
    sun(FOCUS, 22, 11, "#ffd34d") +
    birds([[560, 20, 0.5], [585, 28, 0.38], [1540, 16, 0.42]], "#2a5f8a") +
    `<path d="M719 62L727 32" ${line("#8a5a2a", 1.4, 0.9)}/><path d="M705 34Q727 18 749 34Z" ${fill("#ff6b6b")}/><path d="M717 34Q727 18 737 34Z" ${fill("#fff2e0")}/>`,
  automne: () =>
    glow(FOCUS, 10, 90, "#ffd28a", 0.45, "g1") +
    leaves(7, left(6, 46), ["#efa059", "#a8452a", "#f7cd7a", "#983b0c"], WHITE, 91, 5) +
    leaves(6, right(6, 40), ["#efa059", "#a8452a", "#f7cd7a", "#983b0c"], WHITE, 92, 5, [{ x: 1452, y: 36, r: 16 }]) +
    roundTree(1440, 60, 36, "#e07a2a", "#6b3a1a", 0.9) +
    roundTree(1468, 62, 28, "#a8452a", "#6b3a1a", 0.9),
  hiver: () =>
    flakes(12, left(4, 44), WHITE, 101) +
    flakes(12, right(4, 40), WHITE, 104) +
    peaks(SIDE - 200, SIDE + 60, 60, 22, 3, "#bcdcf2", 0.75, 102, WHITE) +
    peaks(FOCUS + 60, FOCUS + 340, 60, 20, 3, "#bcdcf2", 0.75, 105, WHITE) +
    pines([1430, 1450, 1472, SIDE - 10, SIDE + 10], 64, 26, "#2462a8", 0.7),
  noel: () => {
    const balls = [[480, 14, "#e8403a"], [SIDE, 22, "#ffd36b"], [FOCUS, 18, "#2f9a5e"], [1500, 12, "#e8403a"], [1640, 24, "#ffd36b"]] as const;
    const avoid: Spot[] = [...balls.map(([x, len]) => ({ x, y: len + 5, r: 9 })), { x: 1410, y: 24, r: 8 }];
    return (
      balls.map(([x, len, c]) => ornament(x, len, 5, c)).join("") +
      sparkle(1410, 24, 6, "#ffd36b") +
      flakes(8, left(6, 44), WHITE, 111, avoid) +
      flakes(8, right(6, 34), WHITE, 112, avoid) +
      pines([1560, 1582, 1604, 440, 460], 64, 30, "#145c3f", 0.85)
    );
  },
  "nouvel-an": () => {
    const fw: Spot[] = [{ x: SIDE - 10, y: 26, r: 18 }, { x: FOCUS, y: 22, r: 16 }, { x: 1520, y: 34, r: 13 }];
    const colors = ["#ffd36b", "#ff8ac5", "#8fd0ff", WHITE];
    return (
      firework(SIDE - 10, 26, 15, "#ffd36b") +
      firework(FOCUS, 22, 13, "#ff8ac5") +
      firework(1520, 34, 10, "#8fd0ff") +
      confetti(12, left(4, 60), colors, 121, fw) +
      confetti(12, right(4, 60), colors, 122, fw) +
      stars(8, left(4, 50), "#fffaf0", 123, fw) +
      stars(8, right(4, 50), "#fffaf0", 124, fw)
    );
  },
  "saint-valentin": () => {
    const colors = ["#ff5a8a", "#ffb3c7", "#c2185b", WHITE];
    return (
      cloud(SIDE - 10, 44, 0.36, WHITE, 0.6) +
      cloud(1480, 36, 0.3, WHITE, 0.6) +
      hearts(6, left(6, 46), colors, 131, [cloudSpot(SIDE - 10, 44, 0.36)]) +
      hearts(6, right(6, 46), colors, 132, [cloudSpot(1480, 36, 0.3)])
    );
  },
  paques: () => {
    const eggs = [[SIDE - 12, 54, "#f3e8ff", "#9b8cff"], [SIDE + 12, 57, "#cdeeff", "#ff8ac5"], [1440, 54, "#fff6cc", "#7fbf6a"], [1464, 57, "#ffd1e3", "#4fc3f7"]] as const;
    const avoid: Spot[] = eggs.map(([x, y]) => ({ x, y, r: 8 }));
    return (
      sun(FOCUS, 20, 9, "#fff0a0") +
      flowers(9, left(50, 60), [2.2, 3.4], ["#ffd84d", WHITE, "#ff9ec4"], "#ffb300", "#5fae4a", 142, avoid) +
      flowers(9, right(50, 60), [2.2, 3.4], ["#ffd84d", WHITE, "#ff9ec4"], "#ffb300", "#5fae4a", 143, avoid) +
      eggs.map(([x, y, c, b]) => egg(x, y, 7, c, b)).join("")
    );
  },
  halloween: () =>
    moon(FOCUS, 24, 11, "#ffd98a") +
    stars(7, left(4, 40), "#ffe9b0", 152, [{ x: 560, y: 20, r: 10 }, { x: 600, y: 13, r: 8 }]) +
    stars(7, right(4, 40), "#ffe9b0", 153, [{ x: FOCUS, y: 24, r: 20 }, { x: 1520, y: 28, r: 9 }]) +
    bat(560, 22, 8, "#a58bd6") +
    bat(602, 13, 6, "#a58bd6") +
    bat(1520, 30, 7, "#a58bd6") +
    pumpkin(SIDE, 64, 9) +
    pumpkin(1440, 64, 7),
  zen: () =>
    `<circle cx="${FOCUS}" cy="28" r="15" ${line("#3a6a4e", 2.4, 0.55)}/>` +
    ripples(SIDE, 62, 0.32, "#3a6a4e") +
    zenStones(SIDE, 60, 0.38, "#77a888", "#9fc4ab") +
    bamboo(1490, 64, 60, "#5f9474", 0.8) +
    bamboo(1516, 64, 44, "#77a888", 0.75) +
    leaves(4, [RIGHT[0], 1460, 8, 44], ["#77a888", "#9fc4ab"], WHITE, 161, 4.8, [{ x: FOCUS, y: 28, r: 18 }]),
  energie: () =>
    glow(1000, 30, 200, "#fff2a8", 0.45, "g1") +
    swoosh(22, WHITE, 0.7, 10, 2.2) +
    swoosh(36, "#fff1a0", 0.8, 8, 2.2) +
    swoosh(47, WHITE, 0.45, 6, 1.4) +
    bolt(SIDE, 8, 14, "#ffdf4f") +
    bolt(FOCUS, 12, 11, "#fff4c2") +
    sparkle(560, 20, 6, WHITE) +
    sparkle(620, 44, 4, WHITE) +
    sparkle(1480, 18, 6, WHITE) +
    sparkle(1600, 42, 4.5, WHITE),
  cocon: () =>
    moon(FOCUS, 24, 10, "#b48be0") +
    stars(12, right(6, 40), "#c39be6", 171, [{ x: FOCUS, y: 24, r: 20 }]) +
    cloud(560, 44, 0.4, WHITE, 0.55) +
    mug(SIDE, 62, 0.42, "#c09af0", WHITE),
  "bulles-irisees": () => {
    const spark: Spot = { x: FOCUS, y: 30, r: 6 };
    return (
      sparkle(FOCUS, 30, 5, "#a99cf0") +
      scatter(5, left(4, 60), [6, 15], 181, 7)
        .map((s, i) => iridescent(s.x, s.y, s.r, i))
        .join("") +
      scatter(5, right(4, 60), [6, 16], 182, 7, [spark])
        .map((s, i) => iridescent(s.x, s.y, s.r, i + 5))
        .join("")
    );
  },
  abysses: () =>
    `<path d="M900 0L860 64M1000 0L990 64M1100 0L1130 64" ${line("#5ff0ff", 14, 0.06)}/>` +
    jellyfish(SIDE - 10, 28, 10, "#5ff0ff") +
    jellyfish(FOCUS, 22, 8, "#b98cff") +
    bubbles(5, left(6, 50), "#9ff6ff", 183, [1.5, 3.5], [{ x: SIDE - 10, y: 32, r: 14 }, { x: 520, y: 56, r: 10 }]) +
    bubbles(5, right(6, 50), "#9ff6ff", 184, [1.5, 3.5], [{ x: FOCUS, y: 28, r: 12 }, { x: 1460, y: 54, r: 12 }]) +
    coral(1460, 64, 18, "#17c5dc") +
    coral(520, 64, 14, "#1fa2c0"),
  lavande: () =>
    sun(FOCUS, 20, 9, "#fff1b8") +
    [LEFT, RIGHT]
      .flatMap(([a, b]) => Array.from({ length: Math.floor((b - a) / 14) }, (_, i) => a + i * 14))
      .map((x, i) => lavender(x, 64, 14 + ((i * 7) % 6), i % 3 ? "#7a5ce0" : "#9b87e0", "#5f8a4a"))
      .join(""),
  terracotta: () =>
    sun(FOCUS, 32, 12, "#ffdcb8", false) +
    oliveBranch(430, 16, 170, "#7b8c4a", "#4a5a2a") +
    cypress(1480, 62, 40, "#5f6f3a") +
    cypress(1504, 62, 30, "#7b8c4a"),
  ardoise: () =>
    facets(9, left(8, 42), "#f3f6f8", 211) +
    facets(9, right(8, 42), "#f3f6f8", 214) +
    peaks(SIDE - 240, SIDE + 60, 62, 20, 3, "#9fb0c1", 0.6, 212) +
    peaks(FOCUS - 10, FOCUS + 370, 62, 18, 4, "#9fb0c1", 0.6, 213),
  velours: () =>
    swags(LEFT[0] - 20, LEFT[1], 3, 9, "#6b1a30", "#ffb3a1") +
    swags(RIGHT[0], RIGHT[1] + 20, 3, 9, "#6b1a30", "#ffb3a1") +
    stars(8, left(28, 50), "#ffd9c4", 221) +
    stars(8, right(28, 50), "#ffd9c4", 222),
  onyx: () =>
    facets(8, left(8, 50), "#b8d4ff", 231) +
    facets(8, right(8, 50), "#b8d4ff", 232) +
    sparkle(FOCUS, 34, 4, "#e6f0ff") +
    sparkle(SIDE, 22, 3, "#e6f0ff"),
};

/**
 * Fondu des bords : les dessins s'effacent doucement vers l'extérieur des deux zones, au lieu de
 * s'arrêter net (rangée de lavande, branche, montagnes, traits de lumière).
 */
const EDGE_FADE = (() => {
  const a = LEFT[0] - 40;
  const b = RIGHT[1] + 40;
  const ramp = (170 / (b - a)).toFixed(3);
  const end = (1 - 170 / (b - a)).toFixed(3);
  return `<defs><linearGradient id="bords" gradientUnits="userSpaceOnUse" x1="${a}" y1="0" x2="${b}" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="${ramp}" stop-color="#fff"/><stop offset="${end}" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><mask id="fondu"><rect x="${X0}" y="0" width="${SPAN}" height="${H}" fill="url(#bords)"/></mask></defs>`;
})();

const cache = new Map<string, string>();

/** Image de la bannière du thème (adresse « data: » pour un fond CSS), ou `null`. */
export function bannerImage(id: ThemeId): string | null {
  const scene = SCENES[id];
  if (!scene) return null;
  let url = cache.get(id);
  if (!url) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${X0} 0 ${SPAN} ${H}">${EDGE_FADE}<g mask="url(#fondu)">${scene()}</g></svg>`;
    url = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
    cache.set(id, url);
  }
  return url;
}

/** Thèmes qui ont une bannière (tous les thèmes fournis). */
export const hasBanner = (id: string): id is ThemeId => id in SCENES;
