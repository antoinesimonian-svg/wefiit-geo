import type { LeadsFiltres } from "./useLeadsData";

type Props = {
  filtres: LeadsFiltres;
  onChange: (f: LeadsFiltres) => void;
};

export function LeadsFilters({ filtres, onChange }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2">
        <label className="text-xs text-base-content/50">Type</label>
        <select
          className="select select-sm select-bordered text-xs"
          value={filtres.type}
          onChange={(e) =>
            onChange({ ...filtres, type: e.target.value as LeadsFiltres["type"] })
          }
        >
          <option value="">Tous</option>
          <option value="Business">Business</option>
          <option value="Candidat">Candidat</option>
        </select>
      </div>

      <div className="flex items-center gap-2">
        <label className="text-xs text-base-content/50">Source</label>
        <select
          className="select select-sm select-bordered text-xs"
          value={filtres.source}
          onChange={(e) =>
            onChange({
              ...filtres,
              source: e.target.value as LeadsFiltres["source"],
            })
          }
        >
          <option value="">Toutes</option>
          <option value="Bookings">Bookings</option>
          <option value="Webflow">Webflow</option>
        </select>
      </div>

      <div className="flex items-center gap-2">
        <label className="text-xs text-base-content/50">Statut</label>
        <select
          className="select select-sm select-bordered text-xs"
          value={filtres.statut}
          onChange={(e) =>
            onChange({
              ...filtres,
              statut: e.target.value as LeadsFiltres["statut"],
            })
          }
        >
          <option value="">Tous</option>
          <option value="à traiter">À traiter</option>
          <option value="traité">Traité</option>
        </select>
      </div>
    </div>
  );
}
