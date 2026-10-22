import { useEffect, useId, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { createPortal } from "react-dom";
import logo from "../assets/aqueli-logo-256.png";
import { Icon } from "../components/Icon";
import { ICONS } from "../components/icons";
import { ModuleChip } from "../components/ModuleChip";
import { SwitchRow } from "../components/Switch";
import { Tabs } from "../components/Tabs";
import { readPref, writePref } from "../lib/storage";
import { Select, SelectRow } from "../components/SelectRow";
import { useAnchoredPopover } from "../components/popover";
import { TEXT_SCALES, usePreferences, type TextScale } from "../prefs/PreferencesProvider";
import { AppearancePanel } from "./AppearancePanel";
import { BackupsPanel } from "../backups/BackupsPanel";
import { SpecialDaysPanel } from "../calendar/SpecialDaysSettings";
import { ImportPanel } from "../import/ImportPanel";
import { KeyboardPanel } from "./KeyboardPanel";
import { HelpPanel } from "./HelpPanel";
import { openSupport } from "../lib/support";
import { ModulesPanel } from "./ModulesPanel";
import { RemindersPanel } from "./RemindersPanel";
import { SecurityPanel } from "./SecurityPanel";
import { SoundsPanel } from "./SoundsPanel";
import { SpacesPanel } from "./SpacesPanel";
import { isSettingsTab, pageOf, searchSettings, SETTINGS_GROUPS, SETTINGS_PAGES, type SettingEntry, type SettingsTab } from "./settingsIndex";
import { lang, LANGUAGES, setLanguage, tr, type Lang } from "../i18n/i18n";

import { SETTINGS_TAB_EVENT as TAB_EVENT } from "./settingsTab";
import { Sentences } from "../components/Sentences";

const TEXT_LABELS: Record<TextScale, string> = {
  90: tr("Petite (90 %)"),
  100: tr("Normale (100 %)"),
  115: tr("Grande (115 %)"),
  130: tr("Très grande (130 %)"),
};

function AccessibilityPanel() {
  const { prefs, system, setPref } = usePreferences();
  return (
    <div className="settings-section">
      <h2 className="settings-heading">{tr("Affichage")}</h2>
      <div className="settings-card glass">
        <SwitchRow
          label={tr("Réduire les animations")}
          description={tr("Désactive les fondus et les effets animés.")}
          checked={prefs.reduceMotion}
          onChange={(v) => setPref("reduceMotion", v)}
          note={system.reduceMotion ? tr("Activé par un paramètre de Windows.") : undefined}
        />
        <SwitchRow
          label={tr("Contraste élevé")}
          description={tr("Texte plus marqué, contours visibles et surfaces opaques, dans tous les thèmes.")}
          checked={prefs.highContrast}
          onChange={(v) => setPref("highContrast", v)}
          note={system.highContrast ? tr("Activé par un paramètre de Windows.") : undefined}
        />
        <SwitchRow
          label={tr("Réduire la transparence")}
          description={tr("Remplace les effets de verre par des surfaces opaques.")}
          checked={prefs.reduceTransparency}
          onChange={(v) => setPref("reduceTransparency", v)}
          note={
            system.reduceTransparency
              ? tr("Activé par un paramètre de Windows.")
              : prefs.highContrast || system.highContrast
                ? tr("Compris dans le contraste élevé.")
                : undefined
          }
        />
        <SelectRow
          label={tr("Taille du texte")}
          description={tr("S'applique à toute la fenêtre. Ctrl + molette permet aussi de zoomer.")}
          value={String(prefs.textScale)}
          options={TEXT_SCALES.map((s) => ({ value: String(s), label: TEXT_LABELS[s] }))}
          onChange={(v) => setPref("textScale", Number(v) as TextScale)}
        />
      </div>
    </div>
  );
}

/** Langue de l'interface ; les dates, les heures et les nombres suivent. */
function LanguagePanel() {
  return (
    <div className="settings-section">
      <h2 className="settings-heading">{tr("Langue")}</h2>
      <div className="settings-card glass">
        <SelectRow<Lang>
          label={tr("Langue de l'interface")}
          description={tr("Les dates, les heures et les nombres suivent la langue choisie. La fenêtre se recharge pour l'appliquer.")}
          value={lang()}
          options={LANGUAGES.map((l) => ({ value: l.id, label: l.label }))}
          onChange={(v) => void setLanguage(v)}
        />
      </div>
      <p className="settings-hint"><Sentences text={tr("La saisie rapide (« demain 14h », « tomorrow 2pm ») et l'import comprennent le français et l'anglais, quelle que soit la langue de l'interface.")} /></p>
    </div>
  );
}

function AboutPanel() {
  return (
    <div className="settings-section">
      <div className="about glass">
        <img className="about-logo" src={logo} alt={tr("Logo Aqueli")} draggable={false} />
        <div className="about-text">
          <h2 className="about-name">Aqueli</h2>
          <p className="about-version">{tr("Version {version}", { version: __APP_VERSION__ })}</p>
          <p className="about-author">{tr("Créé par {author}", { author: "Areemi" })}</p>
          <ul className="feature-list feature-list--left">
            <li>
              <Icon d={ICONS.shield} size={14} stroke={2.6} />
              <span>{tr("Fonctionnement hors ligne, sans télémétrie.")}</span>
            </li>
            <li>
              <Icon d={ICONS.lock} size={14} stroke={2.6} />
              <span>{tr("Chiffrement AES-256 (SQLCipher), dérivation de clé Argon2id.")}</span>
            </li>
            <li>
              <Icon d={ICONS.info} size={14} stroke={2.6} />
              <span>{tr("Police Figtree, sous licence SIL Open Font License.")}</span>
            </li>
            <li>
              <Icon d={ICONS.code} size={14} stroke={2.6} />
              <span>{tr("Logiciel libre, sous licence GNU GPL 3.0.")}</span>
            </li>
          </ul>
          <div className="about-support">
            <button type="button" className="btn-gel" onClick={openSupport}>
              <Icon d={ICONS.heart} size={16} stroke={2.4} />
              {tr("Soutenir Aqueli")}
            </button>
            <span className="about-support-note">{tr("Aqueli est libre et gratuit. Les dons passent par Ko-fi.")}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Met en valeur un réglage trouvé par la recherche : la page défile jusqu'à lui, qui s'éclaire un instant. */
function flashSetting(label: string) {
  const target = [...document.querySelectorAll<HTMLElement>(".settings-panel .setting-label, .settings-panel .settings-heading, .settings-panel .checkbox-label")].find(
    (el) => el.textContent?.trim().startsWith(label),
  );
  const row = target?.closest<HTMLElement>(".setting-row, .settings-section") ?? target;
  if (!row) return;
  row.scrollIntoView({ block: "center", behavior: "smooth" });
  row.classList.remove("setting-flash");
  void row.offsetWidth;
  row.classList.add("setting-flash");
  window.setTimeout(() => row.classList.remove("setting-flash"), 1800);
}

/** « Rechercher un réglage » : les réglages qui correspondent ; le choix ouvre sa rubrique. */
function SettingsSearch({ onPick }: { onPick: (entry: SettingEntry) => void }) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const results = searchSettings(query).slice(0, 8);
  const open = results.length > 0;
  const place = useAnchoredPopover(open, inputRef, listRef, () => setQuery(""), { height: 340, minWidth: 320 });
  const pick = (entry: SettingEntry) => {
    setQuery("");
    onPick(entry);
  };
  // Ctrl+F : recherche dans les réglages.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.ctrlKey && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" && open) setActive((i) => Math.min(results.length - 1, i + 1));
    else if (e.key === "ArrowUp" && open) setActive((i) => Math.max(0, i - 1));
    else if (e.key === "Enter" && results[active]) pick(results[active]!);
    else if (e.key === "Escape" && query) setQuery("");
    else return;
    e.preventDefault();
    e.stopPropagation();
  };
  return (
    <div className="settings-search field-box">
      <Icon d={ICONS.search} size={15} stroke={2.2} />
      <input
        ref={inputRef}
        className="field-input"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        aria-label={tr("Rechercher un réglage")}
        placeholder={tr("Rechercher un réglage")}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={onKey}
      />
      {open &&
        createPortal(
          <ul ref={listRef} id={listId} role="listbox" className="select-list glass-popover" style={place} aria-label={tr("Réglages trouvés")}>
            {results.map((r, i) => (
              <li
                key={`${r.tab}-${r.label}`}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                className="select-option settings-result"
                data-active={i === active || undefined}
                onPointerMove={() => setActive(i)}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => pick(r)}
              >
                <Icon d={pageOf(r.tab).icon} size={15} className="select-icon" />
                <span className="select-text">{r.label}</span>
                <span className="time-note">{pageOf(r.tab).label}</span>
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </div>
  );
}

type Section = { id: string; label: string };

const sameSections = (a: Section[], b: Section[]) => a.length === b.length && a.every((s, i) => s.id === b[i]!.id && s.label === b[i]!.label);

/**
 * « Sections de la page » : une pastille par intertitre quand la page en a trois ou plus. Elle
 * reste en haut pendant le défilement, suit la section affichée et y mène d'un clic.
 */
function SectionJump({ panelRef }: { panelRef: RefObject<HTMLDivElement | null> }) {
  const { prefs, system } = usePreferences();
  const [sections, setSections] = useState<Section[]>([]);
  const [active, setActive] = useState("");
  const jumping = useRef(0);

  // Chaque intertitre et le bloc qui le porte ; relu quand la page change (données chargées, ajout…).
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const read = () => {
      const blocks = new Set<HTMLElement>();
      const found: Section[] = [];
      for (const heading of panel.querySelectorAll<HTMLElement>(".settings-heading")) {
        const block = heading.closest<HTMLElement>("section, .settings-section") ?? heading;
        if (blocks.has(block)) continue;
        blocks.add(block);
        const id = `s${found.length}`;
        block.id = `parametres-section-panel-${id}`;
        block.dataset.jump = "";
        found.push({ id, label: heading.textContent?.trim() ?? "" });
      }
      setSections((old) => (sameSections(old, found) ? old : found));
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(panel, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [panelRef]);

  // La section affichée : la dernière dont le haut est passé sous la barre (la dernière tout en bas).
  useEffect(() => {
    const scroller = panelRef.current?.closest<HTMLElement>(".main");
    if (!scroller || sections.length < 3) return;
    const onScroll = () => {
      if (Date.now() < jumping.current) return;
      const line = scroller.getBoundingClientRect().top + 72;
      let current = sections[0]!.id;
      for (const s of sections) {
        const el = document.getElementById(`parametres-section-panel-${s.id}`);
        if (el && el.getBoundingClientRect().top <= line) current = s.id;
      }
      if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4) current = sections[sections.length - 1]!.id;
      setActive(current);
    };
    onScroll();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => scroller.removeEventListener("scroll", onScroll);
  }, [panelRef, sections]);

  if (sections.length < 3) return null;
  const smooth = !(prefs.reduceMotion || system.reduceMotion);
  const go = (id: string) => {
    setActive(id);
    jumping.current = Date.now() + (smooth ? 700 : 0);
    document.getElementById(`parametres-section-panel-${id}`)?.scrollIntoView({ block: "start", behavior: smooth ? "smooth" : "auto" });
  };
  return (
    <div className="settings-jump">
      <Tabs items={sections} value={active || sections[0]!.id} onChange={go} label={tr("Sections de la page")} idPrefix="parametres-section" />
    </div>
  );
}

export function SettingsScreen() {
  const [tab, setTabState] = useState<SettingsTab>(() => readPref("ongletParametres", "apparence", isSettingsTab));
  const setTab = (t: SettingsTab) => {
    setTabState(t);
    writePref("ongletParametres", t);
  };
  useEffect(() => {
    const onTab = (e: Event) => setTabState((e as CustomEvent<SettingsTab>).detail);
    window.addEventListener(TAB_EVENT, onTab);
    return () => window.removeEventListener(TAB_EVENT, onTab);
  }, []);
  const page = pageOf(tab);
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  // Flèches ↑ ↓ dans le volet : rubrique précédente ou suivante.
  const onNavKey = (e: KeyboardEvent<HTMLElement>) => {
    const step = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const i = SETTINGS_PAGES.findIndex((p) => p.id === tab);
    const next = SETTINGS_PAGES[(i + step + SETTINGS_PAGES.length) % SETTINGS_PAGES.length]!;
    setTab(next.id);
    e.currentTarget.querySelector<HTMLButtonElement>(`[data-page="${next.id}"]`)?.focus();
  };

  return (
    <div className="screen settings-screen">
      <header className="screen-header">
        <ModuleChip color="var(--aq-gel)" icon={ICONS.settings} size={40} />
        <div className="screen-heading">
          <h1 className="screen-title">{tr("Paramètres")}</h1>
        </div>
      </header>
      <div className="settings-body">
        <div className="settings-side">
          <SettingsSearch
            onPick={(entry) => {
              setTab(entry.tab);
              window.setTimeout(() => flashSetting(entry.label), 120);
            }}
          />
          <nav className="settings-nav glass" aria-label={tr("Rubriques des paramètres")} onKeyDown={onNavKey}>
            {SETTINGS_GROUPS.map((g) => (
              <div key={g.label} className="settings-nav-group">
                <h2 className="settings-nav-title">{g.label}</h2>
                {g.pages.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="settings-nav-item"
                    data-page={p.id}
                    aria-current={p.id === tab ? "page" : undefined}
                    tabIndex={p.id === tab ? 0 : -1}
                    onClick={() => setTab(p.id)}
                  >
                    <ModuleChip color={p.color} icon={p.icon} size={22} />
                    <span>{p.label}</span>
                  </button>
                ))}
              </div>
            ))}
          </nav>
        </div>
        <div className="settings-main">
          {/* Fenêtre étroite : le volet laisse place à une liste déroulante. */}
          <Select
            className="settings-nav-compact"
            label={tr("Rubrique des paramètres")}
            value={tab}
            options={SETTINGS_GROUPS.flatMap((g) => g.pages.map((p) => ({ value: p.id, label: p.label, icon: p.icon, group: g.label })))}
            onChange={setTab}
          />
          <div className="settings-page-head">
            <ModuleChip color={page.color} icon={page.icon} size={34} />
            <div className="settings-page-heading">
              <h2 id={titleId} className="settings-page-title">
                {page.label}
              </h2>
              <p className="settings-page-hint">{page.hint}</p>
            </div>
          </div>
          <SectionJump key={`sections-${tab}`} panelRef={panelRef} />
          <div key={tab} ref={panelRef} role="region" aria-labelledby={titleId} id={`parametres-panel-${tab}`} className="settings-panel">
            {tab === "apparence" && <AppearancePanel />}
            {tab === "espaces" && <SpacesPanel />}
            {tab === "modules" && <ModulesPanel />}
            {tab === "sons" && <SoundsPanel />}
            {tab === "rappels" && <RemindersPanel />}
            {tab === "calendrier" && <SpecialDaysPanel />}
            {tab === "sauvegardes" && <BackupsPanel />}
            {tab === "import" && <ImportPanel />}
            {tab === "securite" && <SecurityPanel />}
            {tab === "accessibilite" && <AccessibilityPanel />}
            {tab === "clavier" && <KeyboardPanel />}
            {tab === "langue" && <LanguagePanel />}
            {tab === "aide" && <HelpPanel />}
            {tab === "a-propos" && <AboutPanel />}
          </div>
        </div>
      </div>
    </div>
  );
}
