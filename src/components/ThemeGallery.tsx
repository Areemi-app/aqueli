import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { useItemMenu } from "./ContextMenu";
import { Icon } from "./Icon";
import { ModuleChip } from "./ModuleChip";
import { symbolPath } from "./symbols";
import { ICONS } from "./icons";
import { KEYS } from "../lib/itemKeys";
import type { CustomTheme } from "../theme/custom";
import { useCustomThemeActions } from "../theme/customActions";
import { themeStyle } from "../theme/applyTheme";
import { MOTIF_PATHS } from "../theme/motifs";
import { useTheme } from "../theme/ThemeProvider";
import { FAMILY_INFO, THEME_FAMILIES, type AnyThemeId, type ThemeDef, type ThemeFamily } from "../theme/themes";
import { bannerImage, hasBanner } from "../theme/banners";
import { useBannerEnabled } from "../theme/bannerPref";
import { tr } from "../i18n/i18n";

const MOTIF_SPOTS = [
  { x: 262, y: 100, s: 22 },
  { x: 222, y: 108, s: 14 },
  { x: 244, y: 136, s: 28 },
  { x: 200, y: 146, s: 14 },
  { x: 278, y: 150, s: 12 },
  { x: 150, y: 150, s: 16 },
];

/** Aperçu miniature d'un thème, peint avec ses propres couleurs (galerie Themes.dc.html). */
export function ThemePreview({ theme }: { theme: ThemeDef }) {
  const banner = useBannerEnabled() && hasBanner(theme.id) ? bannerImage(theme.id) : null;
  return (
    <div className="theme-preview" data-skin={theme.skin} style={themeStyle(theme)} aria-hidden="true">
      {MOTIF_SPOTS.map((m, i) => (
        <svg
          key={i}
          className={`tp-motif tp-motif--${theme.motif}`}
          data-stroke={theme.motifStroke || undefined}
          width={m.s}
          height={m.s}
          viewBox="0 0 24 24"
          style={{ left: m.x, top: m.y }}
        >
          <path d={MOTIF_PATHS[theme.motif]} />
        </svg>
      ))}
      <div className="tp-bar" data-banner={banner ? "" : undefined}>
        {banner && <span className="tp-banner" style={{ "--banner": banner } as CSSProperties} />}
        <span className="tp-dot" />
        <span>Aqueli</span>
      </div>
      <div className="tp-card tp-card--main">
        <div className="tp-title">{tr("Aujourd'hui")}</div>
        <div className="tp-row tp-row--done">
          <span className="tp-check tp-check--on" />
          <span>{tr("Arroser les plantes")}</span>
        </div>
        <div className="tp-row">
          <span className="tp-check" />
          <span>{tr("Appeler le garage")}</span>
        </div>
        <div className="tp-row">
          <span className="tp-check" />
          <span>{tr("Préparer la réunion")}</span>
        </div>
        <span className="tp-gel">{tr("Planifier")}</span>
      </div>
      <div className="tp-card tp-card--focus">
        <span className="tp-digits">25:00</span>
        <span className="tp-caption">{tr("Focus")}</span>
      </div>
    </div>
  );
}

/**
 * Carte d'un thème (bouton radio) : aperçu, nom, description, pastilles. Un thème personnel a
 * son clic droit (utiliser, modifier, exporter, supprimer).
 */
/** Centre une carte dans sa bande de thèmes (la page, elle, ne bouge pas). */
function centerInStrip(card: HTMLElement | null | undefined, smooth = true): void {
  const strip = card?.closest<HTMLElement>(".theme-strip-scroll");
  if (!card || !strip) return;
  const offset = card.getBoundingClientRect().left - strip.getBoundingClientRect().left;
  const left = strip.scrollLeft + offset - (strip.clientWidth - card.offsetWidth) / 2;
  const animate = smooth && document.documentElement.dataset.reduceMotion !== "true";
  strip.scrollTo({ left: Math.max(0, left), behavior: animate ? "smooth" : "auto" });
}

function useThemeCard(themes: readonly ThemeDef[], onEdit?: (theme: CustomTheme) => void) {
  const { settings, setThemeId, customThemes } = useTheme();
  const itemMenu = useItemMenu();
  const actions = useCustomThemeActions();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const currentId = settings.fixed;

  // Groupe de boutons radio : les flèches passent d'un thème à l'autre (et le montrent).
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const index = themes.findIndex((t) => t.id === currentId);
    let next = index;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (index + 1) % themes.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (index - 1 + themes.length) % themes.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = themes.length - 1;
    else return;
    e.preventDefault();
    const t = themes[next];
    if (t) {
      setThemeId(t.id);
      const el = refs.current[next];
      el?.focus({ preventScroll: true });
      centerInStrip(el);
    }
  };

  const card = (t: ThemeDef) => {
    const i = themes.indexOf(t);
    const selected = t.id === currentId;
    const custom = customThemes.find((c) => c.id === t.id);
    const menu = custom
      ? itemMenu(() => [
          { label: tr("Utiliser"), icon: ICONS.check, run: () => setThemeId(t.id) },
          ...(onEdit ? [{ label: tr("Modifier…"), icon: ICONS.pencil, shortcut: KEYS.rename, run: () => onEdit(custom) }] : []),
          { label: tr("Exporter…"), icon: ICONS.importFile, run: () => void actions.exportTheme(custom) },
          "separator" as const,
          { label: tr("Supprimer"), icon: ICONS.trash, shortcut: KEYS.remove, danger: true, run: () => void actions.removeTheme(custom) },
        ])
      : undefined;
    return (
      <button
        key={t.id}
        ref={(el) => {
          refs.current[i] = el;
        }}
        type="button"
        role="radio"
        aria-checked={selected}
        // Sans thème préféré dans la liste, le premier reçoit le focus au clavier.
        tabIndex={selected || (i === 0 && !themes.some((x) => x.id === currentId)) ? 0 : -1}
        className="theme-card"
        data-skin={t.skin}
        onClick={(e) => {
          setThemeId(t.id);
          centerInStrip(e.currentTarget);
        }}
        onContextMenu={menu?.onContextMenu}
        onKeyDownCapture={menu?.onKeyDown}
      >
        <ThemePreview theme={t} />
        <span className="theme-card-foot">
          <span className="theme-card-text">
            <span className="theme-card-name">
              {t.name}
              {t.dark && <span className="badge-dark">{tr("sombre")}</span>}
            </span>
            <span className="theme-card-desc">{t.description}</span>
          </span>
          <span className="swatches">
            {t.swatches.map((c) => (
              <span key={c} className="swatch" style={{ background: c }} />
            ))}
          </span>
        </span>
        {selected && (
          <span className="theme-card-check" aria-hidden="true">
            <Icon d={ICONS.check} size={14} stroke={3.4} />
          </span>
        )}
      </button>
    );
  };
  return { card, onKeyDown, refs };
}

/** Quelques thèmes côte à côte (premier lancement). */
export function ThemeGallery({ only }: { only: readonly AnyThemeId[] }) {
  const { themes: all } = useTheme();
  const themes = all.filter((t) => only.includes(t.id));
  const { card, onKeyDown } = useThemeCard(themes);
  return (
    <div className="theme-gallery" role="radiogroup" aria-label={tr("Thème")} onKeyDown={onKeyDown}>
      {themes.map(card)}
    </div>
  );
}

/**
 * Galerie des thèmes (Paramètres › Apparence), dans un seul panneau : à gauche les familles
 * (Signature Aqueli en premier), avec les pastilles de leurs thèmes et leur nombre, puis
 * `actions` (« Créer un thème », « Importer… ») ; à droite les thèmes de la famille choisie,
 * sur une bande qui défile (flèches, molette, clavier).
 */
export function ThemeBrowser({ onEdit, actions, onCreate }: { onEdit: (theme: CustomTheme) => void; actions: ReactNode; onCreate: () => void }) {
  const { settings, themes: all } = useTheme();
  const familyOf = (id: string): ThemeFamily => all.find((t) => t.id === id)?.family ?? "Signature";
  const [family, setFamily] = useState<ThemeFamily>(() => familyOf(settings.fixed));
  const themes = all.filter((t) => t.family === family);
  const { card, onKeyDown, refs } = useThemeCard(themes, onEdit);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });

  // Familles : leur pastille (symbole et couleur) et leur nombre de thèmes.
  const items = THEME_FAMILIES.map((f) => ({ id: f, ...FAMILY_INFO[f], count: all.filter((t) => t.family === f).length }));
  const familyRefs = useRef<(HTMLButtonElement | null)[]>([]);
  // Liste des familles : flèches haut et bas, Début, Fin.
  const onFamilyKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const index = THEME_FAMILIES.indexOf(family);
    let next = index;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") next = (index + 1) % THEME_FAMILIES.length;
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft") next = (index - 1 + THEME_FAMILIES.length) % THEME_FAMILIES.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = THEME_FAMILIES.length - 1;
    else return;
    e.preventDefault();
    setFamily(THEME_FAMILIES[next]!);
    familyRefs.current[next]?.focus();
  };

  // Flèches : visibles seulement quand il reste des thèmes de ce côté.
  const measure = () => {
    const el = scrollRef.current;
    if (!el) return;
    setEdges({ start: el.scrollLeft <= 2, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 2 });
  };
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Le thème préféré se montre, centré, à l'ouverture de sa famille.
    const index = themes.findIndex((t) => t.id === settings.fixed);
    const selected = index >= 0 ? refs.current[index] : null;
    if (selected) centerInStrip(selected, false);
    else el.scrollLeft = 0;
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [family, themes.length]);

  // Molette : la bande défile de côté tant qu'il reste des thèmes ; au bout, la page reprend.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      const max = el.scrollWidth - el.clientWidth;
      if ((e.deltaY > 0 && el.scrollLeft >= max - 1) || (e.deltaY < 0 && el.scrollLeft <= 1)) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const page = (direction: -1 | 1) => {
    const el = scrollRef.current;
    if (el) el.scrollBy({ left: direction * Math.max(240, el.clientWidth * 0.8), behavior: "smooth" });
  };

  return (
    <div className="theme-browser settings-card glass">
      <div className="theme-families-col">
        <div className="theme-families" role="tablist" aria-label={tr("Familles de thèmes")} aria-orientation="vertical" onKeyDown={onFamilyKey}>
          {items.map((f, i) => (
            <button
              key={f.id}
              ref={(el) => {
                familyRefs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`themes-tab-${f.id}`}
              aria-selected={f.id === family}
              aria-controls={`themes-panel-${f.id}`}
              tabIndex={f.id === family ? 0 : -1}
              className="theme-family"
              data-signature={f.id === "Signature" || undefined}
              onClick={() => setFamily(f.id)}
            >
              <ModuleChip color={f.color} icon={symbolPath(f.symbol, ICONS.palette)} size={24} />
              <span className="theme-family-label">{f.label}</span>
              <span className="segment-count">{f.count}</span>
            </button>
          ))}
        </div>
        <div className="theme-families-actions">{actions}</div>
      </div>
      <div className="theme-browser-main">
        <div className="theme-browser-head">
          <h3 className="theme-browser-title">
            <ModuleChip color={FAMILY_INFO[family].color} icon={symbolPath(FAMILY_INFO[family].symbol, ICONS.palette)} size={28} />
            {FAMILY_INFO[family].label}
          </h3>
          <p className="theme-browser-hint">{FAMILY_INFO[family].hint}</p>
        </div>
        <div className="theme-strip" role="tabpanel" id={`themes-panel-${family}`} aria-labelledby={`themes-tab-${family}`} data-start={edges.start || undefined} data-end={edges.end || undefined}>
          <button type="button" className="icon-btn theme-strip-arrow" data-side="avant" aria-label={tr("Thèmes précédents")} hidden={edges.start} tabIndex={-1} onClick={() => page(-1)}>
            <Icon d={ICONS.arrowLeft} size={18} stroke={2.4} />
          </button>
          <div ref={scrollRef} className="theme-strip-scroll" role="radiogroup" aria-label={FAMILY_INFO[family].label} onKeyDown={onKeyDown} onScroll={measure}>
            {themes.map(card)}
            {family === "Mes thèmes" && (
              <button type="button" className="theme-card theme-card--new" onClick={onCreate}>
                <span className="theme-card-new-orb" aria-hidden="true">
                  <Icon d={ICONS.plus} size={30} stroke={2.6} />
                </span>
                <span className="theme-card-name">{tr("Créer un thème")}</span>
                <span className="theme-card-desc">{tr("Couleur d'accent, fond d'écran, flou, transparence et sons.")}</span>
              </button>
            )}
          </div>
          <button type="button" className="icon-btn theme-strip-arrow" data-side="apres" aria-label={tr("Thèmes suivants")} hidden={edges.end} tabIndex={-1} onClick={() => page(1)}>
            <Icon d={ICONS.arrowRight} size={18} stroke={2.4} />
          </button>
        </div>
      </div>
    </div>
  );
}
