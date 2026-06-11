import type { Lead } from "./useLeadsData";

type Props = { leads: Lead[] };

export function LeadsKpiCards({ leads }: Props) {
  const total = leads.length;
  const business = leads.filter((l) => l.type === "Business").length;
  const candidats = leads.filter((l) => l.type === "Candidat").length;
  const avecEntreprise = leads.filter((l) => l.entreprise !== null).length;

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      <div className="card bg-base-100 border border-base-200 p-4">
        <p className="text-xs text-base-content/60">Total leads</p>
        <p className="mt-1 text-2xl font-bold">{total}</p>
        <p className="mt-1 text-xs text-base-content/40">tous types confondus</p>
      </div>
      <div className="card bg-base-100 border border-base-200 p-4">
        <p className="text-xs text-base-content/60">Business</p>
        <p className="mt-1 text-2xl font-bold text-primary">{business}</p>
        <p className="mt-1 text-xs text-base-content/40">
          {total > 0 ? Math.round((business / total) * 100) : 0}% du total
        </p>
      </div>
      <div className="card bg-base-100 border border-base-200 p-4">
        <p className="text-xs text-base-content/60">Candidats</p>
        <p className="mt-1 text-2xl font-bold">{candidats}</p>
        <p className="mt-1 text-xs text-base-content/40">
          {total > 0 ? Math.round((candidats / total) * 100) : 0}% du total
        </p>
      </div>
      <div className="card bg-base-100 border border-base-200 p-4">
        <p className="text-xs text-base-content/60">Avec entreprise</p>
        <p className="mt-1 text-2xl font-bold text-accent">{avecEntreprise}</p>
        <p className="mt-1 text-xs text-base-content/40">entreprise identifiée</p>
      </div>
    </div>
  );
}
