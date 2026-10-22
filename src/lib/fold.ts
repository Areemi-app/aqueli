/**
 * Comparaison de textes pour la recherche, pensée pour le français : sans majuscules ni
 * accents (« peche » trouve « pêche » et « péché »), « oe » et « ae » valent « œ » et « æ ».
 * Quand la saisie porte des accents, ce qui est écrit exactement ainsi passe en tête.
 */

const ligatures = (text: string) => text.replace(/œ/g, "oe").replace(/Œ/g, "OE").replace(/æ/g, "ae").replace(/Æ/g, "AE");

/** Minuscules et ligatures développées, accents gardés. */
export function lowerExact(text: string): string {
  return ligatures(text).toLowerCase();
}

/** Minuscules, ligatures développées, sans accents : « Œuvre Été » → « oeuvre ete ». */
export function fold(text: string): string {
  return lowerExact(text)
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

/** Vrai si la saisie porte des accents (« pêche », non « peche »). */
export function hasAccents(text: string): boolean {
  return fold(text) !== lowerExact(text).normalize("NFC");
}

/** Vrai si `text` contient `query` écrit exactement ainsi (accents compris, majuscules non). */
export function containsExactly(text: string, query: string): boolean {
  return lowerExact(text).normalize("NFC").includes(lowerExact(query).normalize("NFC"));
}
