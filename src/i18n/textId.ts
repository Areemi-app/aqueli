/**
 * Identifiant court et stable d'un texte de l'interface, calculé à partir du texte français :
 * les dictionnaires des langues autres que le français et l'anglais (`locales/*.json`) en sont
 * indexés. Le même texte donne toujours le même identifiant ; un test vérifie qu'aucun texte
 * n'en partage un avec un autre.
 */
export function textId(fr: string): string {
  // FNV-1a sur 32 bits.
  let hash = 0x811c9dc5;
  for (let i = 0; i < fr.length; i++) {
    hash ^= fr.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36).padStart(7, "0");
}
