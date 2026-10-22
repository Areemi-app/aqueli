import { describe, expect, it } from "vitest";
import { noteRecord } from "../import/lines";
import { markdownToDoc } from "../import/markdown";
import { docToMarkdown, docToText } from "./noteExport";
import { NOTE_LINK, type DocNode } from "./notes";

const t = (text: string, ...marks: string[]): DocNode => ({ type: "text", text, ...(marks.length ? { marks: marks.map((type) => ({ type })) } : {}) });
const p = (...content: DocNode[]): DocNode => ({ type: "paragraph", content });

const DOC: DocNode = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 2 }, content: [t("Courses")] },
    p(t("Acheter "), t("du pain", "bold"), t(" et "), t("du lait", "italic"), { type: "hardBreak" }, t("vite")),
    p(t("gras ", "bold"), t("et italique", "bold", "italic"), t(" puis "), t("barré", "strike"), t(", "), t("surligné", "highlight"), t(" et "), t("code", "code")),
    { type: "taskList", content: [{ type: "taskItem", attrs: { checked: true }, content: [p(t("fait"))] }, { type: "taskItem", attrs: { checked: false }, content: [p(t("à faire"))] }] },
    { type: "orderedList", attrs: { start: 3 }, content: [{ type: "listItem", content: [p(t("trois"))] }, { type: "listItem", content: [p(t("quatre"))] }] },
    { type: "bulletList", content: [{ type: "listItem", content: [p(t("puce"))] }] },
    { type: "blockquote", content: [p(t("cité"), { type: "hardBreak" }, t("suite"))] },
    { type: "horizontalRule" },
    { type: "codeBlock", attrs: { language: null }, content: [{ type: "text", text: "const a = 1;\nconst b = 2;" }] },
  ],
};

describe("export d'une note", () => {
  it("écrit un Markdown que l'import relit à l'identique", () => {
    const md = docToMarkdown(DOC, "Ma note");
    expect(md.startsWith("# Ma note\n\n## Courses\n\nAcheter **du pain** et *du lait*  \nvite\n\n")).toBe(true);
    expect(md).toContain("**gras *et italique*** puis ~~barré~~, ==surligné== et `code`");
    expect(md).toContain("- [x] fait\n- [ ] à faire\n\n3. trois\n4. quatre\n\n- puce\n\n> cité  \n> suite\n\n---\n\n```\nconst a = 1;\nconst b = 2;\n```\n");
    const record = noteRecord(md, "fichier");
    expect(record.fields.title).toBe("Ma note");
    expect(markdownToDoc(record.fields.text!)).toEqual(DOC);
  });

  it("garde les espaces hors des marques et ferme tout en fin de ligne", () => {
    const doc: DocNode = { type: "doc", content: [p(t("gras ", "bold"), t("normal")), p(t("tout", "bold"), { type: "hardBreak" }, t("ligne", "bold"))] };
    expect(docToMarkdown(doc, "T")).toBe("# T\n\n**gras** normal\n\n**tout**  \n**ligne**\n");
  });

  it("reprend liens entre notes, tableaux et images gardées dans la note", () => {
    const cell = (type: string, text: string): DocNode => ({ type, content: [p(t(text))] });
    const doc: DocNode = {
      type: "doc",
      content: [
        p(t("Voir "), { type: NOTE_LINK, attrs: { id: "n1", label: "Recettes" } }),
        {
          type: "table",
          content: [
            { type: "tableRow", content: [cell("tableHeader", "Jour"), cell("tableHeader", "Plat")] },
            { type: "tableRow", content: [cell("tableCell", "Lundi"), cell("tableCell", "Soupe | pain")] },
          ],
        },
        { type: "image", attrs: { src: "data:image/png;base64,AAAA", alt: "Photo" } },
        { type: "image", attrs: { src: "https://exemple.org/x.png", alt: "" } },
      ],
    };
    expect(docToMarkdown(doc, "Menu")).toBe(
      "# Menu\n\nVoir [[Recettes]]\n\n| Jour | Plat |\n| --- | --- |\n| Lundi | Soupe \\| pain |\n\n![Photo](data:image/png;base64,AAAA)\n",
    );
    expect(docToText(doc, "Menu")).toBe("Menu\r\n\r\nVoir Recettes\r\n\r\nJour\tPlat\r\nLundi\tSoupe | pain\r\n\r\n[Image : Photo]\r\n\r\n[Image]\r\n");
  });

  it("écrit un texte simple lisible, sans signes Markdown", () => {
    const text = docToText(DOC, "  ");
    expect(text.split("\r\n")).toEqual([
      "Sans titre",
      "",
      "Courses",
      "",
      "Acheter du pain et du lait",
      "vite",
      "",
      "gras et italique puis barré, surligné et code",
      "",
      "☑ fait",
      "☐ à faire",
      "",
      "3. trois",
      "4. quatre",
      "",
      "• puce",
      "",
      "    cité",
      "    suite",
      "",
      "————————",
      "",
      "    const a = 1;",
      "    const b = 2;",
      "",
    ]);
  });

  it("exporte une note vide avec son seul titre", () => {
    expect(docToMarkdown({ type: "doc", content: [{ type: "paragraph" }] }, "Vide")).toBe("# Vide\n");
    expect(docToText({ type: "doc", content: [{ type: "paragraph" }] }, "Vide")).toBe("Vide\r\n");
  });
});
