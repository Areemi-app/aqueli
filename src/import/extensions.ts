/** Formats importés : léger, pour reconnaître un fichier sans charger les lecteurs (chargés avec l'aperçu). */
export const IMPORT_EXTENSIONS = ["xlsx", "csv", "txt", "md", "ics", "vcf"] as const;

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}
