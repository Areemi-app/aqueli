import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { cleanDigits, settle, stepped } from "../lib/numberInput";

interface NumberFieldProps {
  id?: string;
  className?: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  "aria-label"?: string;
}

/**
 * Champ de nombre entier d'Aqueli, à la place de celui de Windows : ce qu'on tape s'affiche tel
 * quel (jamais de « 0 » imposé ni de « 05 »), le contenu est sélectionné à l'arrivée pour être
 * remplacé d'un coup, ↑ et ↓ ajoutent ou retirent un. Une valeur valable est transmise aussitôt ;
 * en quittant le champ, il reprend une valeur dans ses bornes (la précédente s'il est vide).
 */
export function NumberField({ value, min, max, onChange, className = "field-input", ...rest }: NumberFieldProps) {
  const [text, setText] = useState(String(value));
  const editing = useRef(false);
  /** Le clic qui donne le focus ne doit pas défaire la sélection de tout le contenu. */
  const keepSelection = useRef(false);

  useEffect(() => {
    if (!editing.current) setText(String(value));
  }, [value]);

  const commit = () => {
    const next = settle(text, value, min, max);
    setText(String(next));
    if (next !== value) onChange(next);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const next = stepped(settle(text, value, min, max), e.key === "ArrowUp" ? 1 : -1, min, max);
      setText(String(next));
      if (next !== value) onChange(next);
    } else if (e.key === "Enter") {
      commit();
    }
  };

  return (
    <input
      {...rest}
      className={className}
      inputMode="numeric"
      autoComplete="off"
      value={text}
      onFocus={(e) => {
        editing.current = true;
        keepSelection.current = true;
        e.currentTarget.select();
      }}
      onMouseUp={(e) => {
        if (keepSelection.current) e.preventDefault();
        keepSelection.current = false;
      }}
      onChange={(e) => {
        keepSelection.current = false;
        const next = cleanDigits(e.target.value, String(max).length);
        setText(next);
        const n = Number(next);
        if (next !== "" && n >= min && n <= max && n !== value) onChange(n);
      }}
      onBlur={() => {
        editing.current = false;
        commit();
      }}
      onKeyDown={onKeyDown}
    />
  );
}
