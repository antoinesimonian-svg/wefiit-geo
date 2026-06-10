import { useState } from "react";
import { useLeadsData, type LeadsFiltres } from "./useLeadsData";
import { LeadsKpiCards } from "./LeadsKpiCards";
import { LeadsFilters } from "./LeadsFilters";
import { LeadsTable } from "./LeadsTable";

type Props = { projectId: string };

const FILTRES_DEFAUT: LeadsFiltres = {
  type: "",
  source: "",
  statut: "",
};

export function LeadsPage({ projectId: _projectId }: Props) {
  const [filtres, setFiltres] = useState<LeadsFiltres>(FILTRES_DEFAUT);
  const { leads, generatedAt, isLoading, isError } = useLeadsData(filtres);

  return (
    <div className="px-4 py-4 md:px-6 md:py-6 pb-24 md:pb-8 overflow-auto">
      <div className="mx-auto max-w-7xl space-y-4">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold">Leads notoriété</h1>
            <p className="text-sm text-base-content/60">
              Réservations Bookings et demandes de contact Webflow
            </p>
          </div>
          {generatedAt && (
            <p className="text-xs text-base-content/40 self-end">
              Dernière sync :{" "}
              {new Date(generatedAt).toLocaleDateString("fr-FR", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          )}
        </div>

        {/* Filtres */}
        <LeadsFilters filtres={filtres} onChange={setFiltres} />

        {/* États */}
        {isLoading && (
          <div className="flex h-64 items-center justify-center">
            <span className="loading loading-spinner loading-md" />
          </div>
        )}

        {isError && (
          <div className="flex h-64 flex-col items-center justify-center gap-2">
            <p className="text-sm text-error">
              Impossible de charger les leads.
            </p>
            <p className="text-xs text-base-content/40">
              Lance{" "}
              <code className="bg-base-200 px-1 rounded">node scraper.mjs</code>{" "}
              dans le dossier <code className="bg-base-200 px-1 rounded">leads-scraper/</code> pour générer le fichier.
            </p>
          </div>
        )}

        {!isLoading && !isError && leads !== null && (
          <>
            <LeadsKpiCards leads={leads} />
            <LeadsTable leads={leads} />
          </>
        )}
      </div>
    </div>
  );
}
