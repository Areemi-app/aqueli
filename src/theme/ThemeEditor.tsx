/**
 * Éditeur de thème (cahier des charges § 6) : un thème de départ, une couleur d'accent, un fond
 * d'écran personnel, le flou et l'opacité des panneaux, les sons. Toute la fenêtre montre le
 * résultat en direct ; « Annuler » revient au thème d'avant.
 */
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { useToast } from "../app/ToastProvider";
import { Dialog } from "../components/Dialog";
import { Icon } from "../components/Icon";
import { ICONS } from "../components/icons";
import { Select } from "../components/SelectRow";
import { dataErrorMessage, type DataError } from "../lib/dataError";
import { useSound } from "../sound/SoundProvider";
import { paletteFor, PALETTES } from "../sound/sounds";
import { TASK_COLORS } from "../tasks/colors";
import { readabilityProblems } from "./contrast";
import { backdropsOf, BLUR_RANGE, buildCustomTheme, DIM_RANGE, MAX_NAME_CHARS, OPACITY_RANGE, type CustomTheme } from "./custom";
import { useTheme } from "./ThemeProvider";
import { getTheme, THEMES, type ThemeId } from "./themes";
import { blobUrlOf, hideWallpaper, prepareWallpaper, showWallpaper, wallpapersApi, wallpaperUrls } from "./wallpapers";
import { tr } from "../i18n/i18n";
import { Sentences } from "../components/Sentences";

interface Slider {
  label: string;
  value: number;
  range: readonly [number, number];
  unit: string;
  onChange: (n: number) => void;
}

function SliderRow({ label, value, range, unit, onChange }: Slider) {
  const id = useId();
  const fill = ((value - range[0]) / (range[1] - range[0])) * 100;
  return (
    <div className="field theme-slider">
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <div className="theme-slider-row">
        <input
          id={id}
          type="range"
          className="range"
          min={range[0]}
          max={range[1]}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ "--range-fill": `${fill}%` } as CSSProperties}
          aria-valuetext={`${value} ${unit}`}
          data-sans-son
        />
        <span className="range-value">
          {value} {unit}
        </span>
      </div>
    </div>
  );
}

/** Image du fond d'écran : nouvelle (à enregistrer), ou celle déjà rangée dans la base. */
interface Picture {
  /** Image à enregistrer ; nulle si elle est déjà dans la base (ou s'il n'y en a pas). */
  data: string | null;
  url: string | null;
}

export function ThemeEditor({ initial, isNew, onClose }: { initial: CustomTheme; isNew: boolean; onClose: () => void }) {
  const { saveCustomTheme, previewTheme, setThemeId } = useTheme();
  const { preview: listen } = useSound();
  const notify = useToast();
  const [draft, setDraft] = useState<CustomTheme>(initial);
  const [picture, setPicture] = useState<Picture>(() => ({ data: null, url: initial.wallpaper ? (wallpaperUrls().get(initial.id) ?? null) : null }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const ids = useId();
  const set = (changes: Partial<CustomTheme>) => setDraft((d) => ({ ...d, ...changes }));

  const theme = useMemo(() => buildCustomTheme(draft, picture.url), [draft, picture.url]);
  const problems = readabilityProblems(theme.tokens, backdropsOf(draft, getTheme(draft.base)));

  // Aperçu en direct sur toute la fenêtre ; à la fermeture, le thème choisi revient.
  useEffect(() => previewTheme(theme), [theme, previewTheme]);
  useEffect(() => () => previewTheme(null), [previewTheme]);
  // Une image choisie ici (pas encore enregistrée) est libérée en partant.
  const ownUrl = useRef<string | null>(null);
  useEffect(() => () => void (ownUrl.current && URL.revokeObjectURL(ownUrl.current)), []);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      setError(tr("Choisissez une image PNG, JPEG ou WebP."));
      return;
    }
    try {
      const { data, tones } = await prepareWallpaper(file);
      if (ownUrl.current) URL.revokeObjectURL(ownUrl.current);
      const url = blobUrlOf(data);
      ownUrl.current = url;
      setPicture({ data, url });
      set({ wallpaper: true, tones });
      setError(null);
    } catch {
      setError(tr("Image illisible."));
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const name = draft.name.trim();
    if (!name) {
      setError(tr("Saisissez un nom."));
      return;
    }
    if (problems.length > 0) return;
    setBusy(true);
    try {
      if (draft.wallpaper && picture.data) {
        await wallpapersApi.set(draft.id, picture.data);
        showWallpaper(draft.id, picture.data);
      } else if (!draft.wallpaper && initial.wallpaper) {
        await wallpapersApi.remove(draft.id);
        hideWallpaper(draft.id);
      }
      saveCustomTheme({ ...draft, name });
      setThemeId(draft.id);
      notify(isNew ? tr("Thème « {name} » créé.", { name }) : tr("Thème « {name} » enregistré.", { name }));
      onClose();
    } catch (err) {
      setError(dataErrorMessage(err as DataError));
      setBusy(false);
    }
  };

  const baseOptions = THEMES.map((t) => ({ value: t.id, label: t.dark ? `${t.name} (sombre)` : t.name }));
  const soundOptions = THEMES.map((t) => ({ value: t.id, label: `${paletteFor(t.id).label} · ${t.name}` }));

  return (
    <Dialog title={isNew ? tr("Nouveau thème") : tr("Thème personnel")} onClose={onClose} className="theme-editor" closeOnOutside={false}>
      <form className="settings-form theme-editor-form" onSubmit={(e) => void submit(e)} noValidate>
        <div className="field">
          <label htmlFor={`${ids}-nom`} className="field-label">
            {tr("Nom")}
          </label>
          <div className="field-box">
            <input id={`${ids}-nom`} className="field-input" value={draft.name} maxLength={MAX_NAME_CHARS} autoComplete="off" onChange={(e) => set({ name: e.target.value })} data-autofocus />
          </div>
        </div>
        <div className="field">
          <label htmlFor={`${ids}-base`} className="field-label">
            {tr("Thème de départ")}
          </label>
          <Select id={`${ids}-base`} value={draft.base} options={baseOptions} onChange={(base) => set({ base: base as ThemeId })} />
        </div>

        <div className="field">
          <span className="field-label">{tr("Couleur d'accent")}</span>
          <div className="color-choices" role="radiogroup" aria-label={tr("Couleur d'accent")}>
            <button type="button" role="radio" aria-checked={draft.accent === null} className="color-choice color-choice--theme" title={tr("Couleur du thème de départ")} aria-label={tr("Couleur du thème de départ")} onClick={() => set({ accent: null })} />
            {TASK_COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                role="radio"
                aria-checked={draft.accent === c.value}
                className="color-choice"
                title={c.label}
                aria-label={c.label}
                style={{ "--swatch": c.value } as CSSProperties}
                onClick={() => set({ accent: c.value })}
              />
            ))}
          </div>
        </div>

        <div className="field">
          <span className="field-label">{tr("Fond d'écran")}</span>
          <div className="theme-wallpaper">
            <span className="theme-wallpaper-thumb" style={picture.url && draft.wallpaper ? ({ backgroundImage: `url("${picture.url}")` } as CSSProperties) : undefined} aria-hidden="true">
              {!(picture.url && draft.wallpaper) && <Icon d={ICONS.image} size={20} stroke={2} />}
            </span>
            <span className="theme-wallpaper-actions">
              <button type="button" className="btn-glass btn-glass--sm" onClick={() => fileRef.current?.click()}>
                <Icon d={ICONS.image} size={14} stroke={2.2} />
                {draft.wallpaper ? tr("Changer d'image…") : tr("Choisir une image…")}
              </button>
              {draft.wallpaper && (
                <button
                  type="button"
                  className="btn-glass btn-glass--sm"
                  onClick={() => {
                    set({ wallpaper: false, tones: null });
                    setPicture({ data: null, url: null });
                  }}
                >
                  {tr("Retirer")}
                </button>
              )}
            </span>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => void pick(e.target.files?.[0]).finally(() => (e.target.value = ""))} />
          </div>
          <p className="settings-hint"><Sentences text={tr("L'image est chiffrée avec le compte. Elle s'affiche une fois Aqueli déverrouillée.")} /></p>
        </div>
        {draft.wallpaper && <SliderRow label={tr("Voile sur le fond d'écran")} value={draft.dim} range={DIM_RANGE} unit="%" onChange={(dim) => set({ dim })} />}
        <SliderRow label={tr("Flou du verre")} value={draft.blur} range={BLUR_RANGE} unit="px" onChange={(blur) => set({ blur })} />
        <SliderRow label={tr("Opacité des panneaux")} value={draft.opacity} range={OPACITY_RANGE} unit="%" onChange={(opacity) => set({ opacity })} />

        <div className="field">
          <label htmlFor={`${ids}-sons`} className="field-label">
            {tr("Sons")}
          </label>
          <div className="theme-sounds">
            <Select id={`${ids}-sons`} value={draft.sounds} options={soundOptions} onChange={(sounds) => set({ sounds: sounds as ThemeId })} />
            <button
              type="button"
              className="btn-glass btn-glass--sm"
              data-sans-son
              onClick={() => {
                listen("bulle");
                window.setTimeout(() => listen("carillon"), 380);
              }}
              title={tr("Écouter : {x}", { x: PALETTES[draft.sounds]?.label ?? "" })}
            >
              <Icon d={ICONS.speaker} size={14} />
              {tr("Écouter")}
            </button>
          </div>
        </div>

        {problems.length > 0 && (
          <p className="form-error" role="alert">
            {draft.wallpaper
              ? tr("Texte peu lisible sur ce fond. Augmentez l'opacité des panneaux ou le voile.")
              : tr("Texte peu lisible sur ce fond. Augmentez l'opacité des panneaux.")}
          </p>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="onb-actions">
          <button type="button" className="btn-glass" onClick={onClose}>
            {tr("Annuler")}
          </button>
          <button type="submit" className="btn-gel" disabled={busy || problems.length > 0}>
            {isNew ? tr("Créer") : tr("Enregistrer")}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
