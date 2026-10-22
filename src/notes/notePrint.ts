/**
 * Impression d'une note, ou PDF avec l'imprimante « Microsoft Print to PDF » : une feuille en
 * clair (titre, puis le texte mis en forme comme dans l'éditeur) est ajoutée le temps de
 * l'impression ; seule elle s'imprime (voir `.print-sheet`, version3.css).
 * Chargé à la demande : l'éditeur (TipTap) reste hors du démarrage de l'application.
 */
import { generateHTML } from "@tiptap/core";
import { readOnlyExtensions } from "./editor/extensions";
import type { DocNode } from "./notes";
import { tr } from "../i18n/i18n";

export function printNote(title: string, doc: DocNode): void {
  document.querySelector(".note-print")?.remove();
  const sheet = document.createElement("section");
  sheet.className = "print-sheet note-print";
  sheet.setAttribute("aria-hidden", "true");
  const heading = document.createElement("h1");
  heading.className = "note-print-title";
  heading.textContent = title.trim() || tr("Sans titre");
  const body = document.createElement("div");
  body.className = "note-content";
  // Texte produit par le schéma de l'éditeur : seuls ses nœuds et attributs, échappés.
  body.innerHTML = generateHTML(doc as Parameters<typeof generateHTML>[0], readOnlyExtensions());
  sheet.append(heading, body);
  document.body.append(sheet);
  const done = () => sheet.remove();
  window.addEventListener("afterprint", done, { once: true });
  window.print();
}
