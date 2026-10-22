import {
  lazy,
  Suspense,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { useToast } from "../app/ToastProvider";
import { submenuEntry, useContextMenu, useScreenMenu, type MenuEntry } from "../components/ContextMenu";
import { requestCalendar } from "../calendar/calendarRequest";
import { requestObligation } from "../obligations/obligationRequest";
import { requestNote } from "../notes/noteRequest";
import { Icon } from "../components/Icon";
import { ICONS } from "../components/icons";
import { Select } from "../components/SelectRow";
import {
  activeLayout,
  addLayout,
  hiddenWidgets,
  hideWidget,
  MAX_LAYOUTS,
  moveWidget,
  removeLayout,
  renameLayout,
  setWidgetSize,
  showWidget,
  WIDGET_SIZES,
  withLayout,
  type HomeLayout,
  type WidgetId,
  type WidgetSize,
} from "../home/layout";
import { LayoutNameDialog } from "../home/LayoutNameDialog";
import { useHomeLayouts } from "../home/useHomeLayouts";
import { WIDGETS } from "../home/widgets";
import { getModule } from "../modules/modules";
import { formatDateLine, greeting } from "../lib/dates";
import { usePreferences } from "../prefs/PreferencesProvider";
import { trackDrag } from "../lib/pointerDrag";
import { useNow } from "../lib/useNow";
import { useNavigation } from "../navigation/NavigationProvider";
import { onDayPlannerRequest, takePendingDayPlanner } from "../planner/plannerRequest";
import { requestQuickAdd } from "../tasks/quickAddFocus";
import { useTodayTasks } from "../tasks/TodayWidget";
import { useVault } from "../vault/VaultProvider";
import { KEYS } from "../lib/itemKeys";
import { preselectSettingsTab } from "./settingsTab";
import { tr, trn } from "../i18n/i18n";

/** « Planifier ma journée » : chargé à sa première ouverture. */
const DayPlanner = lazy(() => import("../planner/DayPlanner").then((m) => ({ default: m.DayPlanner })));

const SIZE_LABELS: Record<WidgetSize, string> = { normal: tr("Normale|taille"), large: tr("Large|taille"), haute: tr("Haute|taille") };

const nextSize = (size: WidgetSize): WidgetSize =>
  WIDGET_SIZES[(WIDGET_SIZES.indexOf(size) + 1) % WIDGET_SIZES.length] ?? "normal";

/** Rappel tant que la clé de récupération n'a pas été recopiée et vérifiée. */
function RecoveryKeyReminder() {
  const { recoveryKeyVerified } = useVault();
  const { go } = useNavigation();
  if (recoveryKeyVerified) return null;
  return (
    <div className="notice notice--warn notice--banner glass" role="note">
      <Icon d={ICONS.warning} size={18} stroke={2.2} />
      <span className="notice-text">{tr("Votre clé de récupération n'a pas été vérifiée.")}</span>
      <button
        type="button"
        className="btn-glass btn-glass--sm"
        onClick={() => {
          preselectSettingsTab("securite");
          go("parametres");
        }}
      >
        {tr("Générer une nouvelle clé")}
      </button>
    </div>
  );
}

interface HomeGridProps {
  layout: HomeLayout;
  editing: boolean;
  onChange: (layout: HomeLayout) => void;
  announce: (message: string) => void;
  /** Passe en mode « Personnaliser ». */
  onCustomize: () => void;
}

/** Cartes de l'Accueil ; en mode « Personnaliser », elles se déplacent, s'agrandissent, se masquent. */
function HomeGrid({ layout, editing, onChange, announce, onCustomize }: HomeGridProps) {
  const openMenu = useContextMenu();
  const [draft, setDraft] = useState<HomeLayout | null>(null);
  const [dragging, setDragging] = useState<WidgetId | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number; title: string } | null>(null);
  const cells = useRef(new Map<WidgetId, HTMLDivElement>());
  const grips = useRef(new Map<WidgetId, HTMLButtonElement>());
  const refocus = useRef<WidgetId | null>(null);
  const shown = draft ?? layout;
  const hidden = hiddenWidgets(layout);

  // Après un déplacement au clavier ou un masquage, le focus reste sur une poignée.
  useLayoutEffect(() => {
    if (!refocus.current) return;
    grips.current.get(refocus.current)?.focus();
    refocus.current = null;
  });

  const cellAt = (x: number, y: number): WidgetId | null => {
    for (const [id, el] of cells.current) {
      const r = el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return id;
    }
    return null;
  };

  const startDrag = (e: ReactPointerEvent, id: WidgetId) => {
    if (!editing || (e.target as HTMLElement).closest("button:not(.home-grip)")) return;
    let current = layout;
    let lastTarget: WidgetId | null = null;
    trackDrag(e, {
      onStart: () => {
        setDragging(id);
        setDraft(current);
      },
      onMove: (x, y) => {
        setGhost({ x, y, title: WIDGETS[id].title });
        const target = cellAt(x, y);
        if (target === null) lastTarget = null;
        if (target === null || target === id || target === lastTarget) return;
        lastTarget = target;
        current = moveWidget(current, id, current.widgets.findIndex((w) => w.id === target));
        setDraft(current);
      },
      onEnd: (_x, _y, cancelled) => {
        setDragging(null);
        setGhost(null);
        setDraft(null);
        if (!cancelled && current !== layout) onChange(current);
      },
    });
  };

  const onGripKey = (e: KeyboardEvent, id: WidgetId) => {
    const count = layout.widgets.length;
    const index = layout.widgets.findIndex((w) => w.id === id);
    const targets: Record<string, number> = {
      ArrowLeft: index - 1,
      ArrowUp: index - 1,
      ArrowRight: index + 1,
      ArrowDown: index + 1,
      Home: 0,
      End: count - 1,
    };
    const to = targets[e.key];
    if (to === undefined) return;
    e.preventDefault();
    if (to < 0 || to >= count || to === index) return;
    refocus.current = id;
    onChange(moveWidget(layout, id, to));
    announce(tr("« {title} » : position {x} sur {count}.", { title: WIDGETS[id].title, x: to + 1, count }));
  };

  const hide = (id: WidgetId) => {
    const index = layout.widgets.findIndex((w) => w.id === id);
    refocus.current = layout.widgets[index + 1]?.id ?? layout.widgets[index - 1]?.id ?? null;
    onChange(hideWidget(layout, id));
    announce(tr("« {title} » masquée.", { title: WIDGETS[id].title }));
  };

  const show = (id: WidgetId) => {
    refocus.current = id;
    onChange(showWidget(layout, id));
    announce(tr("« {title} » affichée.", { title: WIDGETS[id].title }));
  };

  const resize = (id: WidgetId, size: WidgetSize) => {
    onChange(setWidgetSize(layout, id, size));
    announce(tr("« {title} » : taille {x}.", { title: WIDGETS[id].title, x: SIZE_LABELS[size].toLowerCase() }));
  };

  /** Clic droit sur une carte, en mode « Personnaliser » ou non. */
  const cardMenu = (id: WidgetId, size: WidgetSize): MenuEntry[] => [
    ...(editing ? [] : [{ label: tr("Personnaliser l'Accueil"), icon: ICONS.settings, run: onCustomize }, "separator" as const]),
    submenuEntry(
      tr("Taille|carte"),
      ICONS.resize,
      WIDGET_SIZES.map((s) => ({ label: SIZE_LABELS[s], checked: size === s, run: () => resize(id, s) })),
    ),
    { label: tr("Retirer de l'Accueil"), icon: ICONS.close, run: () => hide(id) },
  ];

  return (
    <>
      {editing && hidden.length > 0 && (
        <section className="home-hidden glass" aria-label={tr("Cartes masquées")}>
          <h2 className="home-hidden-title">{tr("Cartes masquées")}</h2>
          <div className="home-hidden-list">
            {hidden.map((id) => (
              <button key={id} type="button" className="btn-glass btn-glass--sm" onClick={() => show(id)}>
                <Icon d={ICONS.plus} size={14} stroke={2.4} />
                {WIDGETS[id].title}
              </button>
            ))}
          </div>
        </section>
      )}

      {shown.widgets.length === 0 && !editing ? (
        <p className="home-none">{tr("Aucune carte affichée.")}</p>
      ) : (
        <div className="home-grid" data-editing={editing || undefined}>
          {shown.widgets.map((w) => {
            const title = WIDGETS[w.id].title;
            return (
              <div
                key={w.id}
                ref={(el) => {
                  if (el) cells.current.set(w.id, el);
                  else cells.current.delete(w.id);
                }}
                className="home-cell"
                style={{ "--widget-color": getModule(WIDGETS[w.id].module).color } as CSSProperties}
                data-size={w.size}
                data-dragging={dragging === w.id || undefined}
                onPointerDown={(e) => startDrag(e, w.id)}
                onContextMenu={(e) => openMenu(e, cardMenu(w.id, w.size))}
              >
                <div className="home-cell-body" inert={editing || undefined}>
                  {WIDGETS[w.id].render()}
                </div>
                {editing && (
                  <div className="home-cell-tools">
                    <button
                      ref={(el) => {
                        if (el) grips.current.set(w.id, el);
                        else grips.current.delete(w.id);
                      }}
                      type="button"
                      className="icon-btn icon-btn--sm home-grip"
                      aria-label={tr("Déplacer « {title} »", { title })}
                      title={tr("Déplacer (glisser, ou flèches du clavier)")}
                      onKeyDown={(e) => onGripKey(e, w.id)}
                    >
                      <Icon d={ICONS.grip} size={16} stroke={3.2} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn icon-btn--sm"
                      aria-label={tr("Taille de « {title} » : {x}", { title, x: SIZE_LABELS[w.size].toLowerCase() })}
                      title={tr("Changer la taille")}
                      onClick={() => resize(w.id, nextSize(w.size))}
                    >
                      <Icon d={ICONS.resize} size={15} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn icon-btn--sm home-remove"
                      aria-label={tr("Retirer « {title} » de l'Accueil", { title })}
                      title={tr("Retirer de l'Accueil")}
                      onClick={() => hide(w.id)}
                    >
                      <Icon d={ICONS.close} size={14} stroke={2.6} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {ghost &&
        createPortal(
          <div className="drag-ghost" style={{ left: ghost.x, top: ghost.y }} aria-hidden="true">
            {ghost.title}
          </div>,
          document.body,
        )}
    </>
  );
}

export function HomeScreen() {
  const now = useNow();
  const { prefs } = usePreferences();
  const remaining = useTodayTasks().open.length;
  const notify = useToast();
  const [layouts, setLayouts] = useHomeLayouts();
  const [editing, setEditing] = useState(false);
  const [planning, setPlanning] = useState(takePendingDayPlanner);
  const [naming, setNaming] = useState<"nouvelle" | "renommer" | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const layoutSelectId = useId();
  const layout = activeLayout(layouts);
  const layoutOptions = layouts.layouts.map((l) => ({ value: l.id, label: l.name }));
  const chooseLayout = (id: string) => setLayouts({ ...layouts, active: id });

  useEffect(() => onDayPlannerRequest(() => setPlanning(true)), []);

  const { go } = useNavigation();
  useScreenMenu(() => [
    { label: tr("Planifier ma journée"), icon: ICONS.sun, run: () => setPlanning(true) },
    { label: tr("Personnaliser l'Accueil"), icon: ICONS.settings, disabled: editing, run: () => setEditing(true) },
    "separator",
    {
      label: tr("Nouvelle tâche"),
      icon: ICONS.plus,
      shortcut: KEYS.create,
      run: () => {
        go("taches");
        requestQuickAdd();
      },
    },
    {
      label: tr("Nouvel événement"),
      icon: ICONS.calendar,
      run: () => {
        go("calendrier");
        requestCalendar({ create: true });
      },
    },
    {
      label: tr("Nouvelle obligation"),
      icon: ICONS.notes,
      run: () => {
        go("obligations");
        requestObligation({ create: true });
      },
    },
    {
      label: tr("Nouvelle note"),
      icon: ICONS.pencil,
      run: () => {
        go("notes");
        requestNote({ create: true });
      },
    },
  ]);

  const removeCurrent = () => {
    const before = layouts;
    setLayouts(removeLayout(layouts, layout.id));
    notify(tr("Mise en page « {name} » supprimée.", { name: layout.name }), {
      label: tr("Annuler|action"),
      undo: tr("suppression de la mise en page"),
      run: () => setLayouts(before),
    });
  };

  return (
    <div className="screen home-screen">
      <header className="screen-header">
        <div className="screen-heading">
          <h1 className="screen-title">{greeting(now, prefs.displayName)}</h1>
          <p className="screen-subtitle">
            {formatDateLine(now)}
            {remaining > 0 && trn(remaining, " · {n} tâche restante aujourd'hui", " · {n} tâches restantes aujourd'hui")}
          </p>
        </div>
        {editing ? (
          <button type="button" className="btn-gel" onClick={() => setEditing(false)}>
            <Icon d={ICONS.check} size={16} stroke={2.6} />
            {tr("Terminer")}
          </button>
        ) : (
          <>
            {layouts.layouts.length > 1 && (
              <Select label={tr("Mise en page")} value={layouts.active} options={layoutOptions} onChange={chooseLayout} />
            )}
            <button type="button" className="btn-glass" onClick={() => setEditing(true)}>
              <Icon d={ICONS.settings} size={16} stroke={2.2} />
              {tr("Personnaliser")}
            </button>
            <button type="button" className="btn-gel" onClick={() => setPlanning(true)}>
              <Icon d={ICONS.sun} size={16} stroke={2.4} />
              {tr("Planifier ma journée")}
            </button>
          </>
        )}
      </header>

      {editing && (
        <div className="home-editbar glass">
          <label htmlFor={layoutSelectId} className="home-editbar-label">
            {tr("Mise en page")}
          </label>
          <Select id={layoutSelectId} value={layouts.active} options={layoutOptions} onChange={chooseLayout} />
          <button
            type="button"
            className="btn-glass btn-glass--sm"
            disabled={layouts.layouts.length >= MAX_LAYOUTS}
            title={layouts.layouts.length >= MAX_LAYOUTS ? tr("{max_layouts} mises en page au plus.", { max_layouts: MAX_LAYOUTS }) : undefined}
            onClick={() => setNaming("nouvelle")}
          >
            <Icon d={ICONS.plus} size={14} stroke={2.4} />
            {tr("Nouvelle")}
          </button>
          <button type="button" className="btn-glass btn-glass--sm" onClick={() => setNaming("renommer")}>
            <Icon d={ICONS.pencil} size={14} />
            {tr("Renommer")}
          </button>
          {layouts.layouts.length > 1 && (
            <button type="button" className="btn-glass btn-glass--sm" onClick={removeCurrent}>
              <Icon d={ICONS.trash} size={14} />
              {tr("Supprimer la mise en page")}
            </button>
          )}
          <span className="home-editbar-hint">{tr("Glissez les cartes pour les déplacer.")}</span>
        </div>
      )}

      {!editing && <RecoveryKeyReminder />}

      <HomeGrid
        layout={layout}
        editing={editing}
        onChange={(next) => setLayouts(withLayout(layouts, next))}
        announce={setAnnouncement}
        onCustomize={() => setEditing(true)}
      />
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      {planning && (
        <Suspense fallback={null}>
          <DayPlanner onClose={() => setPlanning(false)} />
        </Suspense>
      )}
      {naming && (
        <LayoutNameDialog
          layouts={layouts}
          renaming={naming === "renommer" ? { id: layout.id, name: layout.name } : undefined}
          onClose={() => setNaming(null)}
          onSave={(name) => {
            setLayouts(
              naming === "renommer" ? renameLayout(layouts, layout.id, name) : addLayout(layouts, name, crypto.randomUUID()),
            );
            setNaming(null);
          }}
        />
      )}
    </div>
  );
}
