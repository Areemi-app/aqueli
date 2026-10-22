import { useState, type CSSProperties } from "react";
import { Dialog } from "../components/Dialog";
import { ModuleChip } from "../components/ModuleChip";
import { SymbolPicker } from "../components/SymbolPicker";
import { Tabs } from "../components/Tabs";
import { TASK_COLORS } from "../tasks/colors";
import {
  OFFSET_CHOICES,
  offsetLabel,
  offsetsFor,
  readReminderSettings,
  writeReminderSettings,
  type ReminderSettings,
} from "./obligationReminders";
import { CATEGORIES, type CategoryDef, type ObligationCategory } from "./obligations";
import { useObligations } from "./ObligationsProvider";
import { tr } from "../i18n/i18n";

export type SettingsTab = "categories" | "rappels";
const TABS: readonly { id: SettingsTab; label: string }[] = [
  { id: "categories", label: tr("Catégories") },
  { id: "rappels", label: tr("Rappels") },
];

const original = (id: ObligationCategory) => CATEGORIES.find((c) => c.id === id)!;

/** Nom, symbole et couleur d'une catégorie ; le nom s'enregistre en quittant le champ. */
function CategoryRow({ category, autoFocus }: { category: CategoryDef; autoFocus: boolean }) {
  const { customizeCategory } = useObligations();
  const [lookOpen, setLookOpen] = useState(false);
  const base = original(category.id);
  const customized = category.label !== base.label || category.color !== base.color || category.symbol !== base.symbol;
  const save = (changes: Partial<{ label: string | null; color: string; symbol: string }>) => {
    const label = changes.label === undefined ? category.label : changes.label;
    const color = changes.color ?? category.color;
    const symbol = changes.symbol ?? category.symbol;
    void customizeCategory(category.id, {
      label: label && label.trim() !== base.label ? label : null,
      color: color !== base.color ? color : null,
      icon: symbol !== base.symbol ? symbol : null,
    });
  };

  return (
    <div className="obl-cat">
      <div className="obl-cat-row">
        <button
          type="button"
          className="obl-cat-look"
          aria-expanded={lookOpen}
          aria-label={tr("Symbole et couleur de « {label} »", { label: category.label })}
          title={tr("Symbole et couleur")}
          onClick={() => setLookOpen((open) => !open)}
        >
          <ModuleChip color={category.color} icon={category.icon} size={28} />
        </button>
        <div className="field-box obl-cat-name">
          <input
            className="field-input"
            defaultValue={category.label}
            key={category.label}
            maxLength={40}
            placeholder={base.label}
            aria-label={tr("Nom de la catégorie « {label} »", { label: base.label })}
            data-autofocus={autoFocus || undefined}
            onBlur={(e) => {
              if (e.target.value.trim() !== category.label) save({ label: e.target.value.trim() || null });
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
          />
        </div>
        {customized && (
          <button
            type="button"
            className="link-btn"
            onClick={() => void customizeCategory(category.id, { label: null, color: null, icon: null })}
          >
            {tr("Rétablir|défaut")}
          </button>
        )}
      </div>
      {lookOpen && (
        <div className="obl-cat-look-panel">
          <span className="field-label">{tr("Symbole")}</span>
          <SymbolPicker
            value={category.symbol}
            onChange={(symbol) => save({ symbol })}
            label={tr("Symbole de « {label} »", { label: category.label })}
            color={category.color}
          />
          <span className="field-label">{tr("Couleur")}</span>
          <div className="color-choices" role="radiogroup" aria-label={tr("Couleur de « {label} »", { label: category.label })}>
            {[{ value: base.color, label: tr("Couleur d'origine") }, ...TASK_COLORS.filter((c) => c.value !== base.color)].map((c) => (
              <button
                key={c.value}
                type="button"
                role="radio"
                aria-checked={category.color === c.value}
                className="color-choice"
                title={c.label}
                aria-label={c.label}
                style={{ "--swatch": c.value } as CSSProperties}
                onClick={() => save({ color: c.value })}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Pastilles J-30 … Jour J. */
function DayPills({ days, onToggle, label, autoFocus }: { days: readonly number[]; onToggle: (day: number) => void; label: string; autoFocus?: boolean }) {
  return (
    <div className="obl-offsets" role="group" aria-label={label}>
      {OFFSET_CHOICES.map((day, i) => (
        <button
          key={day}
          type="button"
          className="pill pill--button obl-offset"
          aria-pressed={days.includes(day)}
          data-autofocus={(autoFocus && i === 0) || undefined}
          onClick={() => onToggle(day)}
        >
          {offsetLabel(day)}
        </button>
      ))}
    </div>
  );
}

const toggled = (days: readonly number[], day: number) =>
  (days.includes(day) ? days.filter((d) => d !== day) : [...days, day]).sort((a, b) => b - a);

interface ObligationsSettingsProps {
  tab?: SettingsTab;
  /** Catégorie visée (clic droit sur une catégorie). */
  category?: ObligationCategory;
  onClose: () => void;
}

/** Réglages des obligations : noms et couleurs des catégories, jours de rappel. */
export function ObligationsSettings({ tab: initialTab = "categories", category, onClose }: ObligationsSettingsProps) {
  const { categories } = useObligations();
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const [settings, setSettings] = useState<ReminderSettings>(readReminderSettings);
  const exceptions = Object.keys(settings.categories).length;
  const [detailsOpen, setDetailsOpen] = useState(Boolean(category) || exceptions > 0);
  const change = (next: ReminderSettings) => {
    setSettings(next);
    writeReminderSettings(next);
  };
  const setCategoryDays = (id: ObligationCategory, days: number[] | null) => {
    const next = { ...settings.categories };
    if (days === null) delete next[id];
    else next[id] = days;
    change({ ...settings, categories: next });
  };

  return (
    <Dialog title={tr("Réglages des obligations")} onClose={onClose} className="dialog--event">
      <Tabs items={TABS} value={tab} onChange={setTab} label={tr("Réglages")} idPrefix="reglages-obligations" />

      {tab === "categories" ? (
        <div className="obl-settings" role="tabpanel" id="reglages-obligations-panel-categories" aria-labelledby="reglages-obligations-tab-categories">
          <p className="settings-intro">{tr("Noms et couleurs des catégories.")}</p>
          {categories.map((c) => (
            <CategoryRow key={c.id} category={c} autoFocus={c.id === category} />
          ))}
        </div>
      ) : (
        <div className="obl-settings" role="tabpanel" id="reglages-obligations-panel-rappels" aria-labelledby="reglages-obligations-tab-rappels">
          <p className="settings-intro">{tr("Rappels à 9 h, avant l'échéance et avant la date limite de résiliation.")}</p>
          <div className="obl-default">
            <span className="field-label">{tr("Toutes les catégories")}</span>
            <DayPills
              days={settings.default}
              label={tr("Jours de rappel de toutes les catégories")}
              onToggle={(day) => change({ ...settings, default: toggled(settings.default, day) })}
            />
          </div>
          <button
            type="button"
            className="obl-disclosure"
            aria-expanded={detailsOpen}
            onClick={() => setDetailsOpen((open) => !open)}
          >
            <span className="obl-disclosure-arrow" aria-hidden="true" />
            {tr("Réglages par catégorie")}
            {exceptions > 0 && <span className="pill">{exceptions}</span>}
          </button>
          {detailsOpen && (
            <div className="obl-exceptions">
              {categories.map((c) => {
                const own = settings.categories[c.id];
                return (
                  <div key={c.id} className="obl-exception" data-own={own ? true : undefined}>
                    <ModuleChip color={c.color} icon={c.icon} size={22} />
                    <span className="obl-exception-label">
                      {c.label}
                      {own ? (
                        <button
                          type="button"
                          className="link-btn"
                          aria-label={tr("Rappels de « {label} » : rétablir ceux de toutes les catégories", { label: c.label })}
                          onClick={() => setCategoryDays(c.id, null)}
                        >
                          {tr("Rétablir|défaut")}
                        </button>
                      ) : (
                        <span className="obl-exception-same">{tr("Comme toutes les catégories")}</span>
                      )}
                    </span>
                    <DayPills
                      days={offsetsFor(settings, c.id)}
                      label={tr("Jours de rappel : {label}", { label: c.label })}
                      autoFocus={c.id === category}
                      onToggle={(day) => setCategoryDays(c.id, toggled(offsetsFor(settings, c.id), day))}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="onb-actions">
        <button type="button" className="btn-gel" onClick={onClose}>
          {tr("Fermer")}
        </button>
      </div>
    </Dialog>
  );
}
