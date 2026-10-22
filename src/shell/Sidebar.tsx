import { useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { useContextMenu, type MenuEntry } from "../components/ContextMenu";
import { Icon } from "../components/Icon";
import { ICONS } from "../components/icons";
import { ModuleChip } from "../components/ModuleChip";
import { readPref, writePref } from "../lib/storage";
import { MODULE_GROUPS, visibleModules, type ModuleDef, type ModuleGroup } from "../modules/modules";
import { useNavigation } from "../navigation/NavigationProvider";
import { usePreferences, useShortcut } from "../prefs/PreferencesProvider";
import { useTasks } from "../tasks/TasksProvider";
import { preselectSettingsTab } from "../screens/settingsTab";
import { ModulesPopover } from "./ModulesPopover";
import { PinnedSection } from "../pins/PinnedSection";
import { tr } from "../i18n/i18n";

/** Catégories repliées, retrouvées au prochain lancement. */
const CLOSED_GROUPS = "barreLateraleReplis";
const isGroupList = (v: unknown): v is ModuleGroup[] =>
  Array.isArray(v) && v.every((k) => MODULE_GROUPS.some((g) => g.key === k));

/** Barre latérale des modules affichés, rangés par catégorie (maquette BarreLaterale.dc.html). */
export function Sidebar() {
  const { route, go } = useNavigation();
  const { visible, today } = useTasks();
  const { prefs, setPref } = usePreferences();
  const settingsKeys = useShortcut("settings");
  const openMenu = useContextMenu();
  const [modulesOpen, setModulesOpen] = useState(false);
  const [closed, setClosed] = useState<ModuleGroup[]>(() => readPref(CLOSED_GROUPS, [], isGroupList));
  const customizeRef = useRef<HTMLButtonElement>(null);
  const customize = () => {
    preselectSettingsTab("modules");
    go("parametres");
  };
  const saveClosed = (change: (list: ModuleGroup[]) => ModuleGroup[]) =>
    setClosed((list) => {
      const next = change(list);
      writePref(CLOSED_GROUPS, next);
      return next;
    });
  const toggleGroup = (key: ModuleGroup) =>
    saveClosed((list) => (list.includes(key) ? list.filter((k) => k !== key) : [...list, key]));
  // Tâches à faire aujourd'hui ou en retard.
  const dueNow = visible.filter((t) => t.doneAt === null && t.dueDate !== null && t.dueDate <= today).length;

  // Ctrl+1 à 9 suivent l'ordre des modules affichés, catégories repliées comprises.
  const shown = visibleModules(prefs.hiddenModules);
  const rank = new Map(shown.map((m, i) => [m.key, i]));
  const keysOf = (m: ModuleDef) => {
    const i = rank.get(m.key) ?? 99;
    return i < 9 ? `Ctrl+${i + 1}` : undefined;
  };
  const hintOf = (m: ModuleDef) => (keysOf(m) ? `${m.label} (${keysOf(m)})` : m.label);

  const moduleMenu = (e: MouseEvent, m: ModuleDef) =>
    openMenu(e, [
      { label: tr("Ouvrir"), icon: m.icon, shortcut: keysOf(m), run: () => go(m.key) },
      {
        label: tr("Masquer de la barre latérale"),
        icon: ICONS.eyeOff,
        disabled: m.key === "accueil",
        run: () => setPref("hiddenModules", [...prefs.hiddenModules, m.key]),
      },
      "separator",
      { label: tr("Personnaliser la barre latérale"), icon: ICONS.settings, run: customize },
    ]);

  const groupMenu = (e: MouseEvent, key: ModuleGroup): void => {
    const isClosed = closed.includes(key);
    const entries: MenuEntry[] = [
      { label: isClosed ? tr("Déplier") : tr("Replier"), icon: ICONS.chevronDown, run: () => toggleGroup(key) },
      "separator",
      { label: tr("Tout déplier"), icon: ICONS.chevronDown, disabled: closed.length === 0, run: () => saveClosed(() => []) },
      {
        label: tr("Tout replier"),
        icon: ICONS.chevronDown,
        disabled: closed.length === MODULE_GROUPS.length,
        run: () => saveClosed(() => MODULE_GROUPS.map((g) => g.key)),
      },
      "separator",
      { label: tr("Personnaliser la barre latérale"), icon: ICONS.settings, run: customize },
    ];
    openMenu(e, entries);
  };

  const navItem = (m: ModuleDef) => (
    <button
      key={m.key}
      type="button"
      className="nav-item"
      style={{ "--nav-color": m.color } as CSSProperties}
      aria-current={route === m.key ? "page" : undefined}
      title={hintOf(m)}
      onClick={() => go(m.key)}
      onContextMenu={(e) => moduleMenu(e, m)}
    >
      <ModuleChip color={m.color} icon={m.icon} />
      <span className="nav-label">{m.label}</span>
      {m.key === "taches" && dueNow > 0 && (
        <span className="nav-count" aria-label={tr("{dueNow} à faire aujourd'hui", { dueNow })}>
          {dueNow}
        </span>
      )}
    </button>
  );

  return (
    <nav className="sidebar glass" aria-label={tr("Modules")}>
      <div className="sidebar-scroll">
        <div className="sidebar-head">
          <div className="section-label">{tr("Modules")}</div>
          <button
            ref={customizeRef}
            type="button"
            className="icon-btn icon-btn--xs sidebar-customize"
            aria-label={tr("Choisir les modules affichés")}
            title={tr("Choisir les modules affichés")}
            aria-haspopup="dialog"
            aria-expanded={modulesOpen}
            onClick={() => setModulesOpen((open) => !open)}
          >
            <Icon d={ICONS.settings} size={12} stroke={2.4} />
          </button>
        </div>
        {modulesOpen && customizeRef.current && (
          <ModulesPopover anchor={customizeRef.current} onClose={() => setModulesOpen(false)} />
        )}
        {shown.filter((m) => !m.group && !m.featured).map(navItem)}
        {shown
          .filter((m) => m.featured)
          .map((m) => (
            <button
              key={m.key}
              type="button"
              className="nav-featured"
              style={{ "--nav-color": m.color } as CSSProperties}
              aria-current={route === m.key ? "page" : undefined}
              title={hintOf(m)}
              onClick={() => go(m.key)}
              onContextMenu={(e) => moduleMenu(e, m)}
            >
              <ModuleChip color={m.color} icon={m.icon} />
              <span className="nav-label">{m.label}</span>
            </button>
          ))}
        <PinnedSection />
        {MODULE_GROUPS.map((g) => {
          const list = shown.filter((m) => m.group === g.key);
          if (list.length === 0) return null;
          const isClosed = closed.includes(g.key);
          return (
            <div key={g.key} className="nav-group" data-closed={isClosed || undefined}>
              <button
                type="button"
                className="nav-group-head"
                aria-expanded={!isClosed}
                title={isClosed ? tr("Déplier « {label} »", { label: g.label }) : tr("Replier « {label} »", { label: g.label })}
                onClick={() => toggleGroup(g.key)}
                onContextMenu={(e) => groupMenu(e, g.key)}
              >
                <span className="nav-group-label">{g.label}</span>
                <span className="nav-group-line" aria-hidden="true" />
                <Icon d={ICONS.chevronDown} size={11} stroke={2.6} />
              </button>
              {isClosed ? (
                <div className="nav-group-chips">
                  {list.map((m) => (
                    <button
                      key={m.key}
                      type="button"
                      className="nav-mini"
                      style={{ "--nav-color": m.color } as CSSProperties}
                      aria-current={route === m.key ? "page" : undefined}
                      aria-label={m.label}
                      title={hintOf(m)}
                      onClick={() => go(m.key)}
                      onContextMenu={(e) => moduleMenu(e, m)}
                    >
                      <ModuleChip color={m.color} icon={m.icon} size={24} />
                    </button>
                  ))}
                </div>
              ) : (
                list.map(navItem)
              )}
            </div>
          );
        })}
      </div>
      <div className="sidebar-footer">
        <div className="sidebar-sep" />
        <button
          type="button"
          className="nav-item nav-item--quiet"
          aria-current={route === "corbeille" ? "page" : undefined}
          title={tr("Corbeille")}
          onClick={() => go("corbeille")}
        >
          <span className="nav-icon">
            <Icon d={ICONS.trash} size={18} />
          </span>
          <span className="nav-label">{tr("Corbeille")}</span>
        </button>
        <button
          type="button"
          className="nav-item nav-item--quiet"
          aria-current={route === "parametres" ? "page" : undefined}
          title={tr("Paramètres ({settingsKeys})", { settingsKeys })}
          onClick={() => go("parametres")}
        >
          <span className="nav-icon">
            <Icon d={ICONS.settings} size={18} />
          </span>
          <span className="nav-label">{tr("Paramètres")}</span>
        </button>
      </div>
    </nav>
  );
}
