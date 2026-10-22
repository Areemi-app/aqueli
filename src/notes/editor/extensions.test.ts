import { generateHTML, generateJSON, getSchema } from "@tiptap/core";
import { Node } from "@tiptap/pm/model";
import { describe, expect, it } from "vitest";
import { linksIn, plainOf, type DocNode } from "../notes";
import { BUILTIN_TEMPLATES, fillDoc } from "../templates";
import { readOnlyExtensions } from "./extensions";

const extensions = readOnlyExtensions();

describe("éditeur de notes", () => {
  it("accepte les quatre modèles", () => {
    const schema = getSchema(extensions);
    for (const template of BUILTIN_TEMPLATES) {
      expect(() => Node.fromJSON(schema, fillDoc(template.doc, new Date(2026, 8, 29))).check(), template.name).not.toThrow();
    }
  });

  it("n'écrit aucun style dans le document : surlignage et liens passent par des attributs", () => {
    const doc: DocNode = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Important", marks: [{ type: "highlight", attrs: { color: "vert" } }] },
            { type: "text", text: " " },
            { type: "noteLink", attrs: { id: "abc123", label: "Crêpes" } },
          ],
        },
        { type: "table", content: [{ type: "tableRow", content: [{ type: "tableCell", content: [{ type: "paragraph" }] }] }] },
      ],
    };
    const html = generateHTML(doc, extensions);
    expect(html).toContain('<mark data-color="vert">Important</mark>');
    expect(html).toMatch(/<span[^>]*class="note-link"[^>]*data-id="abc123"[^>]*>Crêpes<\/span>/);
    expect(html.replace(/<table[^>]*>|<col[^>]*>/g, "")).not.toContain("style=");
  });

  it("ignore à la lecture les images venues d'Internet et les couleurs inconnues", () => {
    const json = generateJSON(
      '<p><mark style="background-color: red">a</mark> <mark data-color="bleu">b</mark></p><img src="https://exemple.org/x.png"><img src="data:image/png;base64,AAAA">',
      extensions,
    ) as DocNode;
    const marks = json.content?.[0]?.content?.filter((n) => n.marks).map((n) => n.marks?.[0]?.attrs?.color);
    expect(marks).toEqual([null, "bleu"]);
    const images = JSON.stringify(json).match(/"type":"image"/g) ?? [];
    expect(images).toHaveLength(1);
  });

  it("garde les liens « [[ » : identifiant, titre et texte brut", () => {
    const json = generateJSON('<p>Voir <span data-type="noteLink" data-id="n42" data-label="Budget">Budget</span></p>', extensions) as DocNode;
    expect(linksIn(json)).toEqual(["n42"]);
    expect(plainOf(json)).toBe("Voir Budget");
  });
});
