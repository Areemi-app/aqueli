/**
 * Réglage « Jours fériés et fêtes » : pays ou région, zones de vacances scolaires et traditions.
 * En version courte dans la barre latérale du calendrier, en entier dans Paramètres › Calendrier.
 */
import { useId } from "react";
import { Checkbox } from "../components/Checkbox";
import { Select, SelectRow } from "../components/SelectRow";
import { SwitchRow } from "../components/Switch";
import { COUNTRIES, countryOf, type CountryId } from "./countries";
import { SCHOOL_ZONES, type SchoolZone } from "./school";
import { useSpecialDays } from "./SpecialDaysProvider";
import { CalendarDisplaySettings } from "./CalendarDisplaySettings";
import { TRADITIONS, type TraditionId } from "./traditions";
import { tr } from "../i18n/i18n";

const COUNTRY_GROUPS: Record<string, string> = { France: tr("France"), Europe: tr("Europe"), "Amérique du Nord": tr("Amérique du Nord"), Afrique: tr("Afrique") };
const COUNTRY_OPTIONS = COUNTRIES.map((c) => ({ value: c.id, label: c.name, ...(c.group ? { group: COUNTRY_GROUPS[c.group] } : {}) }));

/** Ce que chaque tradition ajoute au calendrier. */
const TRADITION_DETAILS: Record<TraditionId, string> = {
  chretienne: tr("Épiphanie, Cendres, Rameaux, Pâques, Pentecôte, Toussaint, Noël. Périodes du carême et de l'Avent."),
  orthodoxe: tr("Noël et Théophanie selon le calendrier julien, Pâques et Pentecôte orthodoxes."),
  juive: tr("Pourim, Pessa'h, Chavouot, Roch Hachana, Yom Kippour, Souccot, Hanoucca. Chaque fête commence la veille au soir."),
  musulmane: tr("Ramadan, Nuit du Destin, Aïd al-Fitr, Aïd al-Adha, Nouvel An de l'Hégire, Achoura, Mawlid. Dates indicatives, à un jour près selon l'observation de la lune."),
  asiatique: tr("Nouvel An lunaire (chinois, vietnamien…), fête des lanternes, des bateaux-dragons, de la mi-automne."),
  populaire: tr("Saint-Valentin, Chandeleur, fête des mères et des pères, fête de la musique, Halloween, changement d'heure."),
};

function useSettingsActions() {
  const { settings, change } = useSpecialDays();
  return {
    settings,
    country: countryOf(settings.country),
    setCountry: (country: CountryId) => change({ country }),
    toggleZone: (zone: SchoolZone) =>
      change({ zones: settings.zones.includes(zone) ? settings.zones.filter((z) => z !== zone) : [...settings.zones, zone] }),
    toggleTradition: (id: TraditionId, on: boolean) =>
      change({ traditions: on ? [...settings.traditions, id] : settings.traditions.filter((t) => t !== id) }),
  };
}

function ZoneChips({ labelledBy }: { labelledBy: string }) {
  const { settings, toggleZone } = useSettingsActions();
  return (
    <div className="zone-chips" role="group" aria-labelledby={labelledBy}>
      {SCHOOL_ZONES.map((z) => (
        <button
          key={z.id}
          type="button"
          className="zone-chip"
          aria-pressed={settings.zones.includes(z.id)}
          aria-label={tr("{zone} : {cities}", { zone: z.label, cities: z.cities })}
          title={tr("{zone} : {cities}", { zone: z.label, cities: z.cities })}
          onClick={() => toggleZone(z.id)}
        >
          {z.id}
        </button>
      ))}
    </div>
  );
}

/** Barre latérale du calendrier. */
export function SpecialDaysAside() {
  const { settings, country, setCountry, toggleTradition } = useSettingsActions();
  const zonesId = useId();
  return (
    <>
      <h2 className="cal-aside-heading">{tr("Jours fériés et fêtes")}</h2>
      <Select value={settings.country} options={COUNTRY_OPTIONS} onChange={setCountry} label={tr("Pays ou région des jours fériés")} />
      {country.school && (
        <div className="cal-zones">
          <span id={zonesId} className="cal-zones-label">
            {tr("Vacances scolaires")}
          </span>
          <ZoneChips labelledBy={zonesId} />
        </div>
      )}
      <div className="cal-checks">
        {TRADITIONS.map((t) => (
          <Checkbox key={t.id} label={t.name} color={t.color} checked={settings.traditions.includes(t.id)} onChange={(on) => toggleTradition(t.id, on)} />
        ))}
      </div>
    </>
  );
}

/** Paramètres › Calendrier. */
export function SpecialDaysPanel() {
  const { settings, country, setCountry, toggleTradition } = useSettingsActions();
  const zonesId = useId();
  return (
    <>
      <CalendarDisplaySettings />
      <div className="settings-section">
        <h2 className="settings-heading">{tr("Jours fériés et vacances")}</h2>
        <div className="settings-card glass">
          <SelectRow
            label={tr("Pays ou région")}
            description={tr("Jours fériés signalés dans le calendrier, le journal et la revue de la semaine.")}
            value={settings.country}
            options={COUNTRY_OPTIONS}
            onChange={setCountry}
          />
          <div className="setting-row" data-disabled={!country.school || undefined}>
            <div className="setting-text">
              <span id={zonesId} className="setting-label">
                {tr("Vacances scolaires")}
              </span>
              <span className="setting-desc">
                {country.school
                  ? tr("Zones affichées, d'après l'académie. Plusieurs zones peuvent être choisies.")
                  : tr("Disponibles pour la France métropolitaine et l'Alsace-Moselle.")}
              </span>
            </div>
            {country.school && <ZoneChips labelledBy={zonesId} />}
          </div>
          {country.school && (
            <ul className="zone-list">
              {SCHOOL_ZONES.map((z) => (
                <li key={z.id}>
                  <strong>{z.label}</strong>{tr(" : ")}{z.cities}.
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="settings-section">
        <h2 className="settings-heading">{tr("Fêtes et traditions")}</h2>
        <div className="settings-card glass">
          {TRADITIONS.map((t) => (
            <SwitchRow
              key={t.id}
              label={t.name}
              description={TRADITION_DETAILS[t.id]}
              checked={settings.traditions.includes(t.id)}
              onChange={(on) => toggleTradition(t.id, on)}
            />
          ))}
        </div>
      </div>
    </>
  );
}
