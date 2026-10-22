/**
 * Découpe un texte d'aide en phrases, pour les afficher une par ligne : une bulle de trois lignes
 * se lit mieux en phrases séparées qu'en un seul paragraphe. Fonctionne dans toutes les langues
 * d'Aqueli : point suivi d'une espace puis d'une majuscule (ou d'une écriture sans majuscules),
 * et ponctuation finale des langues d'Asie (« 。 », « ！ », « ？ », « । »), sans espace.
 */
const BREAK = /(?<=[.!?…])\s+(?=[\p{Lu}\p{Lo}«“"¿¡])|(?<=[。！？।])\s*(?=\S)/u;

export function splitSentences(text: string): string[] {
  return text
    .split(BREAK)
    .map((s) => s.trim())
    .filter(Boolean);
}
