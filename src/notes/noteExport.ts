/**
 * Export d'une note : document de l'éditeur converti en Markdown (.md) ou en texte simple (.txt).
 * Le Markdown produit se réimporte dans Aqueli (titre en tête, puis le texte). Fonctions pures.
 */
import { NOTE_LINK, type DocNode } from "./notes";
import { tr } from "../i18n/i18n";

export type NoteFormat = "md" | "txt";

/** Marques reprises en Markdown, de l'extérieur vers l'intérieur (le code en dernier). */
const MARKS: readonly [string, string][] = [
  ["bold", "**"],
  ["italic", "*"],
  ["strike", "~~"],
  ["highlight", "=="],
  ["code", "`"],
];

const label = (node: DocNode) => String(node.attrs?.label ?? "");

/** Texte d'une suite de nœuds en ligne ; en Markdown, avec ses marques ouvertes et fermées au plus juste. */
function inlineOf(nodes: readonly DocNode[] | undefined, md: boolean): string {
  let out = "";
  const open: string[] = [];
  // Les espaces restent hors des marques (« **gras** suite », jamais « **gras **suite »).
  const closeTo = (depth: number) => {
    if (open.length <= depth) return;
    const trail = /\s*$/.exec(out)![0];
    out = out.slice(0, out.length - trail.length);
    while (open.length > depth) {
      const mark = open.pop();
      out += MARKS.find(([m]) => m === mark)![1];
    }
    out += trail;
  };
  for (const node of nodes ?? []) {
    if (node.type === "hardBreak") {
      closeTo(0);
      out += md ? "  \n" : "\n";
      continue;
    }
    let text = "";
    if (node.type === "text") text = node.text ?? "";
    else if (node.type === NOTE_LINK) text = md ? `[[${label(node)}]]` : label(node);
    else if (node.type === "image") text = imageOf(node, md);
    if (!md) {
      out += text;
      continue;
    }
    const marks = MARKS.map(([m]) => m).filter((m) => node.type === "text" && node.marks?.some((x) => x.type === m));
    let same = 0;
    while (same < open.length && same < marks.length && open[same] === marks[same]) same++;
    closeTo(same);
    const lead = /^\s*/.exec(text)![0];
    const body = text.slice(lead.length);
    out += lead;
    if (body) {
      for (const m of marks.slice(same)) {
        out += MARKS.find(([x]) => x === m)![1];
        open.push(m);
      }
    }
    out += body;
  }
  closeTo(0);
  return out;
}

function imageOf(node: DocNode, md: boolean): string {
  const alt = String(node.attrs?.alt ?? "").trim();
  if (!md) return alt ? tr("[Image : {alt}]", { alt }) : tr("[Image]");
  const src = String(node.attrs?.src ?? "");
  // Seules les images gardées dans la note sont reprises (jamais d'adresse extérieure).
  return src.startsWith("data:image/") ? `![${alt.replace(/[[\]]/g, "")}](${src})` : alt;
}

/** Ajoute `prefix` à la première ligne et `indent` aux suivantes (lignes vides laissées vides). */
function hang(text: string, prefix: string, indent: string): string {
  return text
    .split("\n")
    .map((line, i) => (i === 0 ? prefix + line : line ? indent + line : line))
    .join("\n");
}

function itemOf(item: DocNode, md: boolean): string {
  return (item.content ?? [])
    .map((b) => blockOf(b, md))
    .filter((s) => s !== "")
    .join("\n");
}

function tableOf(node: DocNode, md: boolean): string {
  const rows = (node.content ?? []).map((row) =>
    (row.content ?? []).map((cell) =>
      (cell.content ?? [])
        .map((b) => inlineOf(b.content, md))
        .join(" ")
        .replace(/\s*\n\s*/g, " ")
        .trim(),
    ),
  );
  if (rows.length === 0) return "";
  if (!md) return rows.map((cells) => cells.join("\t")).join("\n");
  const width = Math.max(...rows.map((r) => r.length));
  const line = (cells: string[]) =>
    `| ${Array.from({ length: width }, (_, i) => (cells[i] ?? "").replace(/\|/g, "\\|")).join(" | ")} |`;
  return [line(rows[0]!), line(Array(width).fill("---")), ...rows.slice(1).map(line)].join("\n");
}

function blockOf(node: DocNode, md: boolean): string {
  switch (node.type) {
    case "paragraph":
      return inlineOf(node.content, md).trimEnd();
    case "heading": {
      const text = inlineOf(node.content, md).trim();
      return md ? `${"#".repeat(Number(node.attrs?.level ?? 1))} ${text}` : text;
    }
    case "horizontalRule":
      return md ? "---" : "————————";
    case "codeBlock": {
      const code = (node.content ?? []).map((t) => t.text ?? "").join("");
      if (!md) return hang(code, "    ", "    ");
      const fence = code.includes("```") ? "~~~" : "```";
      return `${fence}${String(node.attrs?.language ?? "")}\n${code}\n${fence}`;
    }
    case "blockquote": {
      const inner = blocksOf(node.content, md);
      return inner
        .split("\n")
        .map((line) => (md ? (line ? `> ${line}` : ">") : `    ${line}`.trimEnd()))
        .join("\n");
    }
    case "bulletList":
      return (node.content ?? []).map((item) => hang(itemOf(item, md), md ? "- " : "• ", "  ")).join("\n");
    case "orderedList": {
      const start = Number(node.attrs?.start ?? 1);
      return (node.content ?? [])
        .map((item, i) => {
          const marker = `${start + i}. `;
          return hang(itemOf(item, md), marker, " ".repeat(marker.length));
        })
        .join("\n");
    }
    case "taskList":
      return (node.content ?? [])
        .map((item) => {
          const checked = item.attrs?.checked === true;
          const marker = md ? (checked ? "- [x] " : "- [ ] ") : checked ? "☑ " : "☐ ";
          return hang(itemOf(item, md), marker, "  ");
        })
        .join("\n");
    case "table":
      return tableOf(node, md);
    case "image":
      return imageOf(node, md);
    default:
      return node.content ? blocksOf(node.content, md) : inlineOf([node], md);
  }
}

function blocksOf(blocks: readonly DocNode[] | undefined, md: boolean): string {
  return (blocks ?? [])
    .map((b) => blockOf(b, md))
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Note en Markdown : le titre en tête (titre de niveau 1), puis le texte. */
export function docToMarkdown(doc: DocNode, title: string): string {
  const body = blocksOf(doc.content, true);
  return `# ${title.trim() || tr("Sans titre")}\n\n${body}\n`.replace(/\n{3,}$/, "\n");
}

/** Note en texte simple : le titre, une ligne vide, puis le texte (listes et cases à cocher gardées). */
export function docToText(doc: DocNode, title: string): string {
  const body = blocksOf(doc.content, false);
  return `${title.trim() || tr("Sans titre")}\n\n${body}\n`.replace(/\n{3,}$/, "\n").replace(/\n/g, "\r\n");
}

export function noteExport(doc: DocNode, title: string, format: NoteFormat): string {
  return format === "md" ? docToMarkdown(doc, title) : docToText(doc, title);
}
