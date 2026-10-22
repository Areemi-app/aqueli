import { Fragment, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Checkbox } from "../components/Checkbox";
import { MODULE_GROUPS, MODULES } from "../modules/modules";
import { useNavigation } from "../navigation/NavigationProvider";
import { usePreferences } from "../prefs/PreferencesProvider";
import { preselectSettingsTab } from "../screens/settingsTab";
import { tr } from "../i18n/i18n";

interface ModulesPopoverProps {
  /** Bouton qui ouvre le panneau (à côté de « Modules »). */
  anchor: HTMLElement;
  onClose: () => void;
}

/** Choix rapide des modules de la barre latérale, sans passer par les Paramètres. */
export function ModulesPopover({ anchor, onClose }: ModulesPopoverProps) {
  const { prefs, setPref } = usePreferences();
  const { go } = useNavigation();
  const ref = useRef<HTMLDivElement>(null);
  const hidden = prefs.hiddenModules;
  const rect = anchor.getBoundingClientRect();
  const top = rect.bottom + 6;

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("input:not(:disabled)")?.focus();
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!ref.current?.contains(target) && !anchor.contains(target)) onClose();
    };
    document.addEventListener("pointerdown", onPointer, true);
    return () => document.removeEventListener("pointerdown", onPointer, true);
  }, [anchor, onClose]);

  return createPortal(
    <div
      ref={ref}
      className="modules-popover glass-popover"
      role="dialog"
      aria-label={tr("Modules affichés")}
      style={{ left: Math.max(8, rect.left - 8), top, maxHeight: `calc(100vh - ${top + 12}px)` }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
          anchor.focus();
        }
      }}
    >
      <div className="modules-popover-head">
        <span className="modules-popover-title">{tr("Modules affichés")}</span>
        {hidden.length > 0 && (
          <button type="button" className="link-btn" onClick={() => setPref("hiddenModules", [])}>
            {tr("Tout afficher")}
          </button>
        )}
      </div>
      <div className="modules-popover-list">
        {MODULES.map((m, i) => (
          <Fragment key={m.key}>
            {m.group && m.group !== MODULES[i - 1]?.group && (
              <span className="modules-popover-group">{MODULE_GROUPS.find((g) => g.key === m.group)?.label}</span>
            )}
            <Checkbox
              label={m.label}
              color={m.color}
              checked={m.key === "accueil" || !hidden.includes(m.key)}
              disabled={m.key === "accueil"}
              onChange={(on) => setPref("hiddenModules", on ? hidden.filter((k) => k !== m.key) : [...hidden, m.key])}
            />
          </Fragment>
        ))}
      </div>
      <button
        type="button"
        className="link-btn modules-popover-more"
        onClick={() => {
          onClose();
          preselectSettingsTab("modules");
          go("parametres");
        }}
      >
        {tr("Ouvrir les paramètres des modules")}
      </button>
    </div>,
    document.body,
  );
}
