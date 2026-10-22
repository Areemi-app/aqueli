import { useRef, useState } from "react";
import { Checkbox } from "../components/Checkbox";
import { Icon } from "../components/Icon";
import { ICONS } from "../components/icons";
import { Select, SelectRow, type SelectOption } from "../components/SelectRow";
import { SwitchRow } from "../components/Switch";
import { ThemeBrowser, ThemePreview } from "../components/ThemeGallery";
import { dateKey, reasonLabel, type RotationFrequency, type RotationPool, type ThemePeriod } from "../theme/engine";
import { draftFrom, newCustomId, type CustomTheme } from "../theme/custom";
import { useCustomThemeActions } from "../theme/customActions";
import { ThemeEditor } from "../theme/ThemeEditor";
import { useTheme } from "../theme/ThemeProvider";
import { FAMILY_INFO, getTheme, isThemeId, THEMES } from "../theme/themes";
import { setBannerEnabled, useBannerEnabled } from "../theme/bannerPref";
import { DateField } from "../components/DateField";
import { locale, tr } from "../i18n/i18n";
import { capitalize, weekdayNames } from "../i18n/calendarNames";

// Du lundi au dimanche, dans la langue de l'interface.
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0].map((d) => capitalize(weekdayNames("long")[d] ?? ""));

const FREQUENCIES: readonly SelectOption<RotationFrequency>[] = [
  { value: "ouverture", label: tr("À chaque ouverture") },
  { value: "jour", label: tr("Chaque jour") },
  { value: "semaine", label: tr("Chaque semaine") },
  { value: "mois", label: tr("Chaque mois") },
];

const POOLS: readonly SelectOption<RotationPool>[] = [
  { value: "tous", label: tr("Tous les thèmes") },
  { value: "clairs", label: tr("Thèmes clairs") },
  { value: "sombres", label: tr("Thèmes sombres") },
  { value: "selection", label: tr("Sélection") },
];

const SHORT_DATE = new Intl.DateTimeFormat(locale(), { day: "numeric", month: "short" });

/** Nom d'un thème, personnel compris (un thème personnel supprimé n'a plus de nom). */
/** Petite pastille aux couleurs d'un thème (gris pour un thème personnel supprimé). */
function themeDot(id: string): string {
  const s = isThemeId(id) ? getTheme(id).swatches : [];
  return s.length > 1 ? `linear-gradient(135deg, ${s[0]}, ${s[s.length - 1]})` : "var(--aq-chip-neutral)";
}

function themeName(id: string, custom: readonly CustomTheme[] = []): string {
  if (isThemeId(id)) return getTheme(id).name;
  return custom.find((c) => c.id === id)?.name ?? tr("Thème supprimé");
}

function CurrentTheme() {
  const { theme, reason, settings, keepToday, backToPreferred, surpriseMe, customThemes } = useTheme();
  const forced = reason === "aujourdhui";
  const banner = useBannerEnabled();
  return (
    <div className="settings-section">
      <h2 className="settings-heading">{tr("Thème actuel")}</h2>
      <div className="settings-card settings-card--padded glass current-theme">
        <ThemePreview theme={theme} />
        <div className="current-theme-text">
          <span className="current-theme-family">{FAMILY_INFO[theme.family].label}</span>
          <span className="current-theme-name">
            {theme.name}
            {theme.dark && <span className="badge-dark">{tr("sombre")}</span>}
          </span>
          <span className="current-theme-desc">{theme.description}</span>
          <span className="current-theme-meta">
            <span className="swatches">
              {theme.swatches.map((c) => (
                <span key={c} className="swatch" style={{ background: c }} />
              ))}
            </span>
            <span className="pill">{reasonLabel(reason)}</span>
          </span>
        </div>
        <div className="current-theme-actions">
          {!forced && (
            <button type="button" className="btn-glass btn-glass--sm" onClick={keepToday}>
              <Icon d={ICONS.pin} size={15} />
              {tr("Garder aujourd'hui")}
            </button>
          )}
          {theme.id !== settings.fixed && (
            <button type="button" className="btn-glass btn-glass--sm" onClick={backToPreferred}>
              {tr("Revenir à {theme}", { theme: themeName(settings.fixed, customThemes) })}
            </button>
          )}
          <button type="button" className="btn-glass btn-glass--sm" onClick={surpriseMe}>
            <Icon d={ICONS.sparkle} size={14} filled stroke={0} />
            {tr("Surprends-moi")}
          </button>
        </div>
      </div>
      <div className="settings-card glass">
        <SwitchRow
          label={tr("Bannière illustrée")}
          description={tr("Frise propre à chaque thème, dans la barre de titre.")}
          checked={banner}
          onChange={setBannerEnabled}
        />
      </div>
    </div>
  );
}

function AutomaticSettings() {
  const { settings, updateSettings } = useTheme();
  const auto = settings.auto;
  const set = (key: keyof typeof auto, value: boolean) =>
    updateSettings((s) => {
      s.auto[key] = value;
      return s;
    });
  return (
    <div className="settings-section">
      <h2 className="settings-heading">{tr("Changement automatique")}</h2>
      <div className="settings-card glass">
        <SwitchRow
          label={tr("Changer de thème automatiquement")}
          description={tr("Ordre de priorité : fêtes › humeur › nuit › mode sombre de Windows › saisons.")}
          checked={auto.enabled}
          onChange={(v) => set("enabled", v)}
        />
        <SwitchRow
          label={tr("Fêtes")}
          description={tr("Noël, Nouvel An, Saint-Valentin, Pâques, Halloween.")}
          checked={auto.holidays}
          onChange={(v) => set("holidays", v)}
          disabled={!auto.enabled}
        />
        <SwitchRow
          label={tr("Humeur du Journal")}
          description={tr("Cocon quand l'humeur ou l'énergie du jour est basse, Énergie quand l'énergie est haute, Zen sinon.")}
          checked={auto.mood}
          onChange={(v) => set("mood", v)}
          disabled={!auto.enabled}
        />
        <SwitchRow
          label={tr("Nuit")}
          description={tr("Nuit étoilée de 21 h à 7 h (Minuit pour les thèmes Signature).")}
          checked={auto.night}
          onChange={(v) => set("night", v)}
          disabled={!auto.enabled}
        />
        <SwitchRow
          label={tr("Mode sombre de Windows")}
          description={tr("Nuit étoilée (ou Minuit pour les thèmes Signature) quand Windows est en mode sombre.")}
          checked={auto.windowsDark}
          onChange={(v) => set("windowsDark", v)}
          disabled={!auto.enabled}
        />
        <SwitchRow
          label={tr("Saisons")}
          description={tr("Printemps, Été, Automne, Hiver, quand la rotation est désactivée.")}
          checked={auto.seasons}
          onChange={(v) => set("seasons", v)}
          disabled={!auto.enabled}
        />
      </div>
    </div>
  );
}

function RotationSettings() {
  const { themes, settings, updateSettings, rotationHistory } = useTheme();
  const rotation = settings.rotation;
  const off = !rotation.enabled;
  return (
    <div className="settings-section">
      <h2 className="settings-heading">{tr("Rotation aléatoire")}</h2>
      <div className="settings-card glass">
        <SwitchRow
          label={tr("Rotation aléatoire")}
          description={tr("Un thème tiré au hasard, jamais deux fois de suite.")}
          checked={rotation.enabled}
          onChange={(v) =>
            updateSettings((s) => {
              s.rotation.enabled = v;
              return s;
            })
          }
        />
        <SelectRow
          label={tr("Fréquence")}
          value={rotation.frequency}
          options={FREQUENCIES}
          disabled={off}
          onChange={(v) =>
            updateSettings((s) => {
              s.rotation.frequency = v;
              return s;
            })
          }
        />
        <SelectRow
          label={tr("Thèmes concernés")}
          value={rotation.pool}
          options={POOLS}
          disabled={off}
          onChange={(v) =>
            updateSettings((s) => {
              s.rotation.pool = v;
              return s;
            })
          }
        />
        {rotation.pool === "selection" && (
          <div className="setting-row setting-row--wrap">
            {themes.map((t) => (
              <Checkbox
                key={t.id}
                label={t.name}
                checked={rotation.selection.includes(t.id)}
                onChange={(checked) =>
                  updateSettings((s) => {
                    s.rotation.selection = checked
                      ? [...s.rotation.selection, t.id]
                      : s.rotation.selection.filter((id) => id !== t.id);
                    return s;
                  })
                }
              />
            ))}
          </div>
        )}
        {rotationHistory.length > 0 && (
          <div className="setting-row setting-row--column">
            <span className="setting-label">{tr("Derniers thèmes")}</span>
            <ol className="theme-history">
              {rotationHistory.map((h, i) => (
                <li key={`${h.date}-${i}`} className="theme-history-item">
                  <span className="theme-history-dot" style={{ background: themeDot(h.theme) }} aria-hidden="true" />
                  <span className="theme-history-name">{themeName(h.theme)}</span>
                  <span className="theme-history-date">{SHORT_DATE.format(new Date(`${h.date}T12:00:00`))}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}

function PlanningSettings() {
  const { themes, settings, updateSettings } = useTheme();
  const planning = settings.planning;
  const off = !planning.enabled;
  const themeOptions: SelectOption<string>[] = [
    { value: "", label: tr("Aucun") },
    ...themes.map((t) => ({ value: t.id, label: t.name })),
  ];
  const periodOptions = themeOptions.slice(1);

  const setPeriod = (id: string, change: Partial<ThemePeriod>) =>
    updateSettings((s) => {
      s.planning.periods = s.planning.periods.map((p) => (p.id === id ? { ...p, ...change } : p));
      return s;
    });

  const addPeriod = () =>
    updateSettings((s) => {
      const today = dateKey(new Date());
      s.planning.periods = [
        ...s.planning.periods,
        { id: Date.now().toString(36), start: today, end: today, theme: themes[0]!.id },
      ];
      return s;
    });

  return (
    <div className="settings-section">
      <h2 className="settings-heading">{tr("Planning")}</h2>
      <div className="settings-card glass">
        <SwitchRow
          label={tr("Planning des thèmes")}
          description={tr("Un thème par jour de la semaine, ou pour une période datée.")}
          checked={planning.enabled}
          onChange={(v) =>
            updateSettings((s) => {
              s.planning.enabled = v;
              return s;
            })
          }
        />
        {WEEKDAYS.map((day, i) => (
          <SelectRow
            key={day}
            label={day}
            value={planning.weekdays[i] ?? ""}
            options={themeOptions}
            disabled={off}
            onChange={(v) =>
              updateSettings((s) => {
                s.planning.weekdays[i] = v === "" ? null : v;
                return s;
              })
            }
          />
        ))}
        {planning.periods.map((p, i) => (
          <div key={p.id} className="setting-row period-row" data-disabled={off || undefined}>
            <span className="setting-label">{tr("Période {n}", { n: i + 1 })}</span>
            <label className="period-field">
              <span className="setting-desc">{tr("du")}</span>
              <DateField className="date-input" label={tr("Début de la période {x}", { x: i + 1 })} value={p.start} disabled={off} onChange={(v) => v && setPeriod(p.id, { start: v })} />
            </label>
            <label className="period-field">
              <span className="setting-desc">{tr("au")}</span>
              <DateField className="date-input" label={tr("Fin de la période {x}", { x: i + 1 })} value={p.end} min={p.start} disabled={off} onChange={(v) => v && setPeriod(p.id, { end: v })} />
            </label>
            <Select
              value={p.theme}
              options={periodOptions}
              disabled={off}
              label={tr("Thème de la période {x}", { x: i + 1 })}
              onChange={(v) => setPeriod(p.id, { theme: v })}
            />
            <button
              type="button"
              className="icon-btn icon-btn--sm"
              aria-label={tr("Supprimer la période {x}", { x: i + 1 })}
              title={tr("Supprimer")}
              onClick={() =>
                updateSettings((s) => {
                  s.planning.periods = s.planning.periods.filter((x) => x.id !== p.id);
                  return s;
                })
              }
            >
              <Icon d={ICONS.trash} size={15} stroke={2.2} />
            </button>
          </div>
        ))}
      </div>
      <div>
        <button type="button" className="btn-glass" onClick={addPeriod} disabled={off}>
          <Icon d={ICONS.plus} size={16} stroke={2.6} />
          {tr("Ajouter une période")}
        </button>
      </div>
    </div>
  );
}

/** Création d'un thème personnel, au départ du thème affiché (ou de celui d'un thème personnel). */
function useCreateTheme(onEdit: (theme: CustomTheme, isNew: boolean) => void): () => void {
  const { theme, customThemes } = useTheme();
  return () => {
    const custom = customThemes.find((c) => c.id === theme.id);
    const base = custom ? getTheme(custom.base) : (THEMES.find((t) => t.id === theme.id) ?? getTheme("aqua"));
    onEdit(draftFrom(base, newCustomId(), tr("Mon thème")), true);
  };
}

/** « Créer un thème » et « Importer un thème… », à droite des onglets de la galerie. */
function MyThemesBar({ onEdit }: { onEdit: (theme: CustomTheme, isNew: boolean) => void }) {
  const { importFile, full } = useCustomThemeActions();
  const fileRef = useRef<HTMLInputElement>(null);
  const create = useCreateTheme(onEdit);
  return (
    <div className="my-themes-bar">
      <button type="button" className="btn-glass btn-glass--sm" onClick={create} disabled={full} title={full ? tr("12 thèmes personnels au plus") : tr("Accent, fond d'écran, flou, transparence et sons")}>
        <Icon d={ICONS.palette} size={15} stroke={2.2} />
        {tr("Créer un thème")}
      </button>
      <button type="button" className="btn-glass btn-glass--sm" onClick={() => fileRef.current?.click()} disabled={full}>
        <Icon d={ICONS.importFile} size={15} stroke={2.2} />
        {tr("Importer…")}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".aqtheme"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void importFile(file);
        }}
      />
    </div>
  );
}

export function AppearancePanel() {
  const [editing, setEditing] = useState<{ theme: CustomTheme; isNew: boolean } | null>(null);
  const edit = (theme: CustomTheme, isNew: boolean) => setEditing({ theme, isNew });
  const create = useCreateTheme(edit);
  return (
    <>
      <CurrentTheme />
      <div className="settings-section">
        <h2 className="settings-heading">{tr("Thème préféré")}</h2>
        <ThemeBrowser onEdit={(theme) => edit(theme, false)} onCreate={create} actions={<MyThemesBar onEdit={edit} />} />
      </div>
      {editing && <ThemeEditor key={editing.theme.id} initial={editing.theme} isNew={editing.isNew} onClose={() => setEditing(null)} />}
      <AutomaticSettings />
      <RotationSettings />
      <PlanningSettings />
      <p className="settings-hint">
        {tr("Ordre de priorité : thème gardé pour aujourd'hui › planning › changement automatique › rotation › thème préféré.")}
      </p>
    </>
  );
}
