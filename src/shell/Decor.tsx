import { memo, type CSSProperties } from "react";
import { useTheme } from "../theme/ThemeProvider";
import { SPARKLE_COLORS } from "../theme/brand";
import { ICONS } from "../components/icons";
import { hasShapes, MOTIF_PATHS } from "../theme/motifs";

/** Bulles de la maquette Accueil, placées en proportion de la fenêtre (1280 × 800). */
const BUBBLES = [
  { x: 89.8, y: 8.8, size: 110, delay: 0 },
  { x: 93.8, y: 76.3, size: 64, delay: -3 },
  { x: 54.7, y: 90, size: 44, delay: -6 },
  { x: 46.9, y: 8, size: 28, delay: -2 },
  { x: 72.7, y: 50, size: 70, delay: -8 },
];

/** Ciel étoilé pseudo-aléatoire mais toujours identique (même graine que la maquette Verrouillage). */
function makeStars(count: number) {
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  return Array.from({ length: count }, () => {
    const size = rnd() < 0.12 ? 3 : rnd() < 0.5 ? 2 : 1;
    return {
      x: rnd() * 99,
      y: rnd() * 80,
      size,
      opacity: 0.35 + rnd() * 0.6,
      delay: -rnd() * 6,
    };
  });
}

const STARS = makeStars(70);
const SPARKLES = [
  { x: 14, y: 19, size: 18 },
  { x: 81, y: 15, size: 16 },
  { x: 86.7, y: 65, size: 14 },
  { x: 19.5, y: 70, size: 12 },
].map((s, i) => ({ ...s, color: SPARKLE_COLORS[i % SPARKLE_COLORS.length] }));

/** Motifs du thème (feuilles, flocons, pétales…), en proportion de la fenêtre. */
const SHAPES = [
  { x: 7, y: 20, size: 30, turn: -20, delay: 0 },
  { x: 28, y: 80, size: 22, turn: 35, delay: -4 },
  { x: 60, y: 12, size: 26, turn: 10, delay: -7 },
  { x: 83, y: 38, size: 34, turn: -35, delay: -2 },
  { x: 91, y: 86, size: 20, turn: 60, delay: -9 },
  { x: 48, y: 64, size: 18, turn: -10, delay: -5 },
  { x: 16, y: 52, size: 16, turn: 25, delay: -11 },
  { x: 72, y: 72, size: 24, turn: -50, delay: -6 },
];

/** Thèmes d'eau, les seuls où des bulles flottent (les autres ont leurs propres dessins). */
const BUBBLE_THEMES: ReadonlySet<string> = new Set(["aqua", "frutiger", "lagon", "bulles-irisees", "abysses"]);

/** Décor de fond du thème : selon le thème, bulles, étoiles, feuilles, flocons, pétales… */
export const Decor = memo(function Decor() {
  const { theme, customThemes } = useTheme();
  // Thème personnel : comme son thème de départ.
  const base = customThemes.find((c) => c.id === theme.id)?.base ?? theme.id;
  return (
    <div className="decor" aria-hidden="true">
      {hasShapes(theme.motif) &&
        SHAPES.map((m, i) => (
          <svg
            key={`m${i}`}
            className="motif"
            data-stroke={theme.motifStroke || undefined}
            width={m.size}
            height={m.size}
            viewBox="0 0 24 24"
            style={{ left: `${m.x}%`, top: `${m.y}%`, animationDelay: `${m.delay}s` }}
          >
            <g transform={`rotate(${m.turn} 12 12)`}>
              <path d={MOTIF_PATHS[theme.motif]} />
            </g>
          </svg>
        ))}
      {theme.motif === "etoiles" && (
        <>
          {theme.dark &&
            STARS.map((s, i) => (
              <span
                key={`s${i}`}
                className="star"
                style={
                  {
                    left: `${s.x}%`,
                    top: `${s.y}%`,
                    width: s.size,
                    height: s.size,
                    "--star-opacity": s.opacity,
                    "--star-glow": `${s.size * 3}px`,
                    animationDelay: `${s.delay}s`,
                  } as CSSProperties
                }
              />
            ))}
          {SPARKLES.map((s, i) => (
            <svg
              key={`k${i}`}
              className="sparkle"
              width={s.size}
              height={s.size}
              viewBox="0 0 24 24"
              style={{ left: `${s.x}%`, top: `${s.y}%`, color: s.color, animationDelay: `${-i * 1.7}s` }}
            >
              <path d={ICONS.sparkle} fill="currentColor" />
            </svg>
          ))}
        </>
      )}
      {BUBBLE_THEMES.has(base) &&
        BUBBLES.map((b, i) => (
          <span
            key={`b${i}`}
            className="bubble"
            style={{ left: `${b.x}%`, top: `${b.y}%`, width: b.size, height: b.size, animationDelay: `${b.delay}s` }}
          />
        ))}
    </div>
  );
});
