/**
 * Saisie d'un nombre entier, au plus naturel : seuls les chiffres comptent, aucun zéro n'est
 * imposé ni gardé en tête (« 05 » devient « 5 »), un champ vidé reprend sa valeur en le quittant.
 * Chiffres arabes et japonais pleine chasse compris.
 */

/** Chiffres arabes (٠…٩, ۰…۹) et pleine chasse (０…９) ramenés aux chiffres latins. */
function latinDigits(text: string): string {
  return text.replace(/[٠-٩۰-۹０-９]/g, (c) => {
    const code = c.charCodeAt(0);
    const base = code >= 0xff10 ? 0xff10 : code >= 0x06f0 ? 0x06f0 : 0x0660;
    return String(code - base);
  });
}

/** Texte du champ pendant la saisie : chiffres seuls, `maxLength` au plus, sans zéro en tête. */
export function cleanDigits(text: string, maxLength: number): string {
  return latinDigits(text)
    .replace(/\D/g, "")
    .replace(/^0+(?=\d)/, "")
    .slice(0, maxLength);
}

/** Valeur retenue en quittant le champ : celle saisie, ramenée entre `min` et `max` ; champ
 * vide : la valeur d'avant. */
export function settle(text: string, previous: number, min: number, max: number): number {
  if (text === "") return previous;
  return Math.min(max, Math.max(min, Number(text)));
}

/** Flèches haut et bas : un de plus ou de moins, sans sortir des bornes. */
export function stepped(value: number, delta: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value + delta));
}
