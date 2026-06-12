import { useState } from "react";
import type React from "react";
import type { Lead } from "./useLeadsData";

type Props = { leads: Lead[] };

const BADGE_TYPE: Record<Lead["type"], string> = {
  Business: "badge-primary",
  Candidat: "badge-secondary",
};

const BADGE_TYPE_LEAD: Record<Lead["typeLead"], string> = {
  "demande de contact": "badge-accent",
  "réservation booking": "badge-info",
};

function formatDate(iso: string | null): React.ReactNode {
  if (!iso) return <span className="text-base-content/30">—</span>;
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

function LeadModal({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  return (
    <dialog className="modal modal-open" onClick={onClose}>
      <div
        className="modal-box max-w-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="btn btn-sm btn-circle btn-ghost absolute right-3 top-3"
          onClick={onClose}
        >
          ✕
        </button>
        <div className="mb-4 flex items-center gap-2">
          <span className={`badge ${BADGE_TYPE[lead.type]}`}>{lead.type}</span>
          <span className={`badge badge-outline ${BADGE_TYPE_LEAD[lead.typeLead]}`}>
            {lead.typeLead}
          </span>
        </div>
        <h3 className="mb-1 text-base font-semibold">
          {lead.entreprise ?? <span className="text-base-content/40">Entreprise inconnue</span>}
        </h3>
        {lead.email && (
          <a href={`mailto:${lead.email}`} className="link link-hover mb-3 block text-sm text-base-content/60">
            {lead.email}
          </a>
        )}
        <div className="divider my-3" />
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-base-content">
          {lead.message ?? <span className="text-base-content/40">Aucun message</span>}
        </p>
        <div className="mt-4 text-right text-xs text-base-content/40">
          {formatDate(lead.date)}
        </div>
      </div>
    </dialog>
  );
}

export function LeadsTable({ leads }: Props) {
  const [leadSelectionne, setLeadSelectionne] = useState<Lead | null>(null);

  if (leads.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-box border border-base-200 bg-base-100">
        <p className="text-sm text-base-content/40">Aucun lead pour ces filtres.</p>
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-box border border-base-200">
        <table className="table table-sm bg-base-100">
          <thead>
            <tr className="text-xs text-base-content/50">
              <th>Date</th>
              <th>Type</th>
              <th>Canal</th>
              <th>Entreprise</th>
              <th>Email</th>
              <th>Message</th>
              <th title="Besoins remontés dans Boond">Boond</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <tr
                key={lead.id}
                className="cursor-pointer hover:bg-base-200"
                onClick={() => setLeadSelectionne(lead)}
              >
                <td className="whitespace-nowrap text-xs text-base-content/70">
                  {formatDate(lead.date)}
                </td>
                <td>
                  <span className={`badge badge-sm ${BADGE_TYPE[lead.type]}`}>
                    {lead.type}
                  </span>
                </td>
                <td>
                  <span className={`badge badge-sm badge-outline ${BADGE_TYPE_LEAD[lead.typeLead]}`}>
                    {lead.typeLead}
                  </span>
                </td>
                <td className="max-w-[160px] truncate text-sm font-medium">
                  {lead.entreprise ?? <span className="text-base-content/30">—</span>}
                </td>
                <td className="max-w-[180px]">
                  {lead.email ? (
                    <a
                      href={`mailto:${lead.email}`}
                      className="link link-hover text-xs"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {lead.email}
                    </a>
                  ) : (
                    <span className="text-base-content/30 text-xs">—</span>
                  )}
                </td>
                <td className="max-w-[240px]">
                  {lead.message ? (
                    <span className="block truncate text-xs text-base-content/60">
                      {lead.message}
                    </span>
                  ) : (
                    <span className="text-base-content/30 text-xs">—</span>
                  )}
                </td>
                <td className="text-center text-xs">
                  {lead.besoinsBoond !== null ? (
                    <span className="font-semibold text-primary">{lead.besoinsBoond}</span>
                  ) : (
                    <span className="text-base-content/30">—</span>
                  )}
                </td>
                <td className="max-w-[160px]">
                  {lead.source ? (
                    <span className="block truncate text-xs text-base-content/60" title={lead.source}>
                      {lead.source}
                    </span>
                  ) : (
                    <span className="text-base-content/30 text-xs">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {leadSelectionne && (
        <LeadModal lead={leadSelectionne} onClose={() => setLeadSelectionne(null)} />
      )}
    </>
  );
}
