import { describe, expect, it } from "vitest";
import { splitSentences } from "./sentences";

describe("splitSentences", () => {
  it("sépare les phrases françaises et anglaises", () => {
    expect(splitSentences("Une par jour. Dernière sauvegarde : 22 oct.")).toEqual(["Une par jour.", "Dernière sauvegarde : 22 oct."]);
    expect(splitSentences("Keep it safe. It will not be shown again.")).toEqual(["Keep it safe.", "It will not be shown again."]);
  });

  it("ne coupe ni les extensions de fichier, ni les abréviations suivies d'une minuscule", () => {
    expect(splitSentences("Un fichier texte (.txt, .md). Les agendas (.ics) aussi.")).toEqual([
      "Un fichier texte (.txt, .md).",
      "Les agendas (.ics) aussi.",
    ]);
    expect(splitSentences("Réessayez dans 30 s. puis encore")).toEqual(["Réessayez dans 30 s. puis encore"]);
  });

  it("garde une phrase qui commence par des guillemets", () => {
    expect(splitSentences("Le minuteur compte. « Pause » termine la séance.")).toEqual(["Le minuteur compte.", "« Pause » termine la séance."]);
  });

  it("sépare les phrases des langues d'Asie, avec ou sans espace", () => {
    expect(splitSentences("このキーを保管してください。再表示されません。")).toEqual(["このキーを保管してください。", "再表示されません。"]);
    expect(splitSentences("请妥善保管。 不会再次显示。")).toEqual(["请妥善保管。", "不会再次显示。"]);
    expect(splitSentences("안전하게 보관하세요. 다시 표시되지 않습니다.")).toEqual(["안전하게 보관하세요.", "다시 표시되지 않습니다."]);
    expect(splitSentences("इसे सुरक्षित रखें। यह फिर नहीं दिखेगी।")).toEqual(["इसे सुरक्षित रखें।", "यह फिर नहीं दिखेगी।"]);
  });

  it("rend une phrase seule telle quelle", () => {
    expect(splitSentences("Aucune note épinglée.")).toEqual(["Aucune note épinglée."]);
    expect(splitSentences("")).toEqual([]);
  });
});
