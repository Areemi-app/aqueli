/** Enregistre un export préparé par l'interface (commande du cœur `export_file`, après « Enregistrer sous »). */
import { invoke } from "@tauri-apps/api/core";
import { asDataError } from "./dataError";
import { inTauri } from "./windowControls";

export type ExportFormat = "csv" | "ics" | "vcf" | "md" | "txt";

/** Chemin du fichier écrit, ou `null` si la personne a annulé. */
export async function exportFile(name: string, format: ExportFormat, content: string): Promise<string | null> {
  if (!inTauri && import.meta.env.DEV) return `C:\\Users\\…\\Documents\\${name}.${format}`;
  try {
    return await invoke<string | null>("export_file", { name, format, content });
  } catch (e) {
    throw asDataError(e);
  }
}
