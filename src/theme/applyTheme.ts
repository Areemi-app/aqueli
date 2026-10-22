import { decorColors, dialogMotifsFor } from "./dialogDecor";
import type { ThemeDef, ThemeTokens } from "./themes";

/** « bubbleEdge » → « --aq-bubble-edge ». */
export function cssVarName(token: keyof ThemeTokens | string): string {
  return "--aq-" + token.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
}

/** Variables CSS d'un thème, utilisables comme style d'un élément (aperçus de la galerie). */
export function themeStyle(theme: ThemeDef): Record<string, string> {
  const style: Record<string, string> = {};
  for (const [key, value] of Object.entries(theme.tokens)) {
    style[cssVarName(key)] = value;
  }
  // Texte secondaire d'origine, que les fenêtres renforcent un peu (src/styles/vault.css, .dialog).
  style["--aq-soft-base"] = theme.tokens.soft;
  // Teintes du décor des fenêtres, tirées des pastilles d'identité du thème.
  decorColors(theme.swatches, theme.tokens.accent).forEach((color, i) => {
    style[`--aq-decor-${i + 1}`] = color;
  });
  return style;
}

/** Applique un thème à toute la fenêtre. */
export function applyTheme(theme: ThemeDef, root: HTMLElement = document.documentElement): void {
  for (const [name, value] of Object.entries(themeStyle(theme))) {
    root.style.setProperty(name, value);
  }
  root.dataset.theme = theme.id;
  root.dataset.dark = String(theme.dark);
  // Style de la fenêtre (src/styles/signature.css pour la famille Signature Aqueli).
  root.dataset.skin = theme.skin ?? "classique";
  // Motifs des fenêtres propres à l'univers du thème (src/components/DialogMotif.tsx).
  root.dataset.decor = dialogMotifsFor(theme).join(" ");
  root.style.colorScheme = theme.dark ? "dark" : "light";
}
