/**
 * Enregistrements à terminer avant de verrouiller le compte (texte d'une note en cours de
 * saisie) : le verrouillage attend qu'ils soient partis, puis ferme la base.
 */

type Flush = () => Promise<void>;
const flushes = new Set<Flush>();

/** Ajoute un enregistrement à terminer ; renvoie de quoi le retirer. */
export function onBeforeLock(flush: Flush): () => void {
  flushes.add(flush);
  return () => flushes.delete(flush);
}

/** Lance tous les enregistrements en attente et attend leur fin (2 secondes au plus). */
export async function flushBeforeLock(): Promise<void> {
  const all = Promise.allSettled([...flushes].map((flush) => flush()));
  await Promise.race([all, new Promise((resolve) => setTimeout(resolve, 2000))]);
}
