/**
 * Texte d'une note importée, en Markdown simple, converti en document de l'éditeur : titres,
 * listes, cases à cocher, citations, blocs de code, séparateurs, gras, italique, barré, surligné, code.
 * Le reste est gardé comme texte. Fonction pure.
 */
import type { DocNode } from "../notes/notes";

type Mark = { type: string };

const INLINE: [RegExp, string][] = [
  // « ***gras et italique*** » : le gras se ferme sur les deux dernières étoiles.
  [/\*\*(.+?)\*\*(?!\*)|__(.+?)__/, "bold"],
  [/~~(.+?)~~/, "strike"],
  [/==(.+?)==/, "highlight"],
  [/`([^`]+)`/, "code"],
  [/(?<![\p{L}\p{N}*])\*(?!\s)(.+?)(?<!\s)\*(?![\p{L}\p{N}*])|(?<![\p{L}\p{N}_])_(?!\s)(.+?)(?<!\s)_(?![\p{L}\p{N}_])/u, "italic"],
];

/** Texte avec ses marques (gras, italique…), découpé en morceaux. */
function inline(text: string, marks: Mark[] = []): DocNode[] {
  if (!text) return [];
  let best: { index: number; length: number; inner: string; mark: string } | null = null;
  for (const [re, mark] of INLINE) {
    const m = re.exec(text);
    if (m && (!best || m.index < best.index)) best = { index: m.index, length: m[0].length, inner: m[1] ?? m[2] ?? "", mark };
  }
  const node = (value: string): DocNode[] => (value ? [{ type: "text", text: value, ...(marks.length ? { marks } : {}) }] : []);
  if (!best) return node(text);
  // Le code ne porte pas d'autres marques à l'intérieur.
  const innerMarks = [...marks, { type: best.mark }];
  const inner = best.mark === "code" ? [{ type: "text", text: best.inner, marks: innerMarks }] : inline(best.inner, innerMarks);
  return [...node(text.slice(0, best.index)), ...inner, ...inline(text.slice(best.index + best.length), marks)];
}

const paragraph = (text: string): DocNode => {
  const content = inline(text);
  return content.length ? { type: "paragraph", content } : { type: "paragraph" };
};

/** Lignes d'un paragraphe, séparées par des retours à la ligne simples. */
function lines(texts: string[]): DocNode {
  const content: DocNode[] = [];
  texts.forEach((t, i) => {
    if (i > 0) content.push({ type: "hardBreak" });
    content.push(...inline(t));
  });
  return content.length ? { type: "paragraph", content } : { type: "paragraph" };
}

const TASK = /^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/;
const BULLET = /^\s*[-*+•]\s+(.*)$/;
const ORDERED = /^\s*(\d{1,9})[.)]\s+(.*)$/;
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const RULE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const FENCE = /^\s*```/;
const QUOTE = /^\s*>\s?(.*)$/;

const startsBlock = (line: string) =>
  HEADING.test(line) || RULE.test(line) || FENCE.test(line) || TASK.test(line) || BULLET.test(line) || ORDERED.test(line) || QUOTE.test(line);

export function markdownToDoc(markdown: string): DocNode {
  const source = markdown.replace(/\r\n?/g, "\n").split("\n");
  const blocks: DocNode[] = [];
  let i = 0;
  const collect = (re: RegExp) => {
    const found: RegExpExecArray[] = [];
    for (let m = re.exec(source[i] ?? ""); m && i < source.length; m = re.exec(source[i] ?? "")) {
      found.push(m);
      i++;
    }
    return found;
  };
  while (i < source.length) {
    const line = source[i]!;
    if (line.trim() === "") {
      i++;
      continue;
    }
    if (FENCE.test(line)) {
      const body: string[] = [];
      i++;
      while (i < source.length && !FENCE.test(source[i]!)) body.push(source[i++]!);
      i++;
      const text = body.join("\n");
      blocks.push({ type: "codeBlock", attrs: { language: null }, ...(text ? { content: [{ type: "text", text }] } : {}) });
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      const content = inline(heading[2]!);
      blocks.push({ type: "heading", attrs: { level: Math.min(3, heading[1]!.length) }, ...(content.length ? { content } : {}) });
      i++;
      continue;
    }
    if (RULE.test(line)) {
      blocks.push({ type: "horizontalRule" });
      i++;
      continue;
    }
    if (TASK.test(line)) {
      const items = collect(TASK).map((m) => ({ type: "taskItem", attrs: { checked: m[1] !== " " }, content: [paragraph(m[2]!)] }));
      blocks.push({ type: "taskList", content: items });
      continue;
    }
    if (ORDERED.test(line)) {
      const found = collect(ORDERED);
      blocks.push({
        type: "orderedList",
        attrs: { start: Number(found[0]![1]) },
        content: found.map((m) => ({ type: "listItem", content: [paragraph(m[2]!)] })),
      });
      continue;
    }
    if (BULLET.test(line)) {
      blocks.push({ type: "bulletList", content: collect(BULLET).map((m) => ({ type: "listItem", content: [paragraph(m[1]!)] })) });
      continue;
    }
    if (QUOTE.test(line)) {
      blocks.push({ type: "blockquote", content: [lines(collect(QUOTE).map((m) => m[1]!.trimEnd()))] });
      continue;
    }
    const texts: string[] = [];
    while (i < source.length && source[i]!.trim() !== "" && (texts.length === 0 || !startsBlock(source[i]!))) texts.push(source[i++]!.trim());
    blocks.push(lines(texts));
  }
  return { type: "doc", content: blocks.length ? blocks : [{ type: "paragraph" }] };
}
