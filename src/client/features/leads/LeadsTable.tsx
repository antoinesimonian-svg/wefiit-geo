import type { Lead } from "./useLeadsData";

type Props = { leads: Lead[] };

const BADGE_TYPE: Record<Lead["type"], string> = {
  Business: "badge-primary",
  Candidat: "badge-secondary",
};

const BADGE_SOURCE: Record<Lead["source"], string> = {
  Bookings: "badge-info",
  Webflow: "badge-accent",
  Inconnu: "badge-ghost",
};

const BADGE_STATUT: Record<Lead["statut"], string> = {
  "à traiter": "badge-warning",
  traité: "badge-success",
};

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export function LeadsTable({ leads }: Props) {
  if (leads.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-box border border-base-200 bg-base-100">
        <p className="text-sm text-base-content/40">Aucun lead pour ces filtres.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-box border border-base-200">
      <table className="table table-sm bg-base-100">
        <thead>
          <tr className="text-xs text-base-content/50">
            <th>Date</th>
            <th>Type</th>
            <th>Source</th>
            <th>Nom</th>
            <th>Email</th>
            <th>Téléphone</th>
            <th>Message</th>
            <th>Statut</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((lead) => (
            <tr key={lead.id} className="hover:bg-base-50">
              <td className="whitespace-nowrap text-xs text-base-content/70">
                {formatDate(lead.date)}
              </td>
              <td>
                <span className={`badge badge-sm ${BADGE_TYPE[lead.type]}`}>
                  {lead.type}
                </span>
              </td>
              <td>
                <span className={`badge badge-sm badge-outline ${BADGE_SOURCE[lead.source]}`}>
                  {lead.source}
                </span>
              </td>
              <td className="max-w-[140px] truncate text-sm font-medium">
                {lead.nom ?? <span className="text-base-content/30">—</span>}
              </td>
              <td className="max-w-[180px]">
                {lead.email ? (
                  <a
                    href={`mailto:${lead.email}`}
                    className="link link-hover text-xs"
                  >
                    {lead.email}
                  </a>
                ) : (
                  <span className="text-base-content/30 text-xs">—</span>
                )}
              </td>
              <td className="text-xs text-base-content/70">
                {lead.telephone ?? <span className="text-base-content/30">—</span>}
              </td>
              <td className="max-w-[240px]">
                {lead.message ? (
                  <span
                    className="block truncate text-xs text-base-content/60"
                    title={lead.message}
                  >
                    {lead.message}
                  </span>
                ) : (
                  <span className="text-base-content/30 text-xs">—</span>
                )}
              </td>
              <td>
                <span className={`badge badge-sm ${BADGE_STATUT[lead.statut]}`}>
                  {lead.statut}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
