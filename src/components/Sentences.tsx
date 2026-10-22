import { splitSentences } from "../lib/sentences";

/**
 * Texte d'aide affiché une phrase par ligne (bulles d'information, états vides, avertissements) :
 * plus lisible qu'un paragraphe dès qu'il dépasse deux lignes. Une phrase seule reste un texte simple.
 */
export function Sentences({ text }: { text: string }) {
  const parts = splitSentences(text);
  if (parts.length < 2) return <>{text}</>;
  // Une seule boîte : dans un conteneur en ligne (avertissement avec pictogramme), les phrases
  // restent l'une sous l'autre.
  return (
    <span className="text-lines">
      {parts.map((part, i) => (
        <span key={i} className="text-line">
          {part}
        </span>
      ))}
    </span>
  );
}
