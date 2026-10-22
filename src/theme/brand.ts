/**
 * Couleurs de marque, communes à tous les thèmes : l'arc-en-ciel de la coche cristal du logo.
 * Servent à l'anneau Focus et aux étincelles décoratives (maquettes Main et Verrouillage).
 */
export const RAINBOW = [
  { offset: 0, color: "#b6f03c" },
  { offset: 0.3, color: "#2fd6c9" },
  { offset: 0.55, color: "#3a7bff" },
  { offset: 0.8, color: "#b04cff" },
  { offset: 1, color: "#ff5fa8" },
] as const;

export const SPARKLE_COLORS = ["#b6f03c", "#ff5fa8", "#2fd6c9", "#b04cff"] as const;
