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
        <label className="text-xs text-base-content/50">Canal</label>
        <select
          className="select select-sm select-bordered text-xs"
          value={filtres.typeLead}
          onChange={(e) =>
            onChange({
              ...filtres,
              typeLead: e.target.value as LeadsFiltres["typeLead"],
            })
          }
        >
          <option value="">Tous</option>
          <option value="demande de contact">Demande de contact</option>
          <option value="réservation booking">Réservation booking</option>
        </select>
      </div>
    </div>
  );
}
