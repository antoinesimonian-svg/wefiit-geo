import { useState } from "react";
import { useGeoDonneesFiltrees, type GeoFiltres } from "./useGeoData";
import { GeoKpiCards } from "./GeoKpiCards";
import { GeoEvolutionChart } from "./GeoEvolutionChart";
import { GeoMatriceScores } from "./GeoMatriceScores";
import { GeoConcurrents } from "./GeoConcurrents";
import { GeoVerbatims } from "./GeoVerbatims";

type Props = { projectId: string; tab: "visibility" | "sante" };

const PERIODES = [
  { label: "Hier", jours: 1 },
  { label: "7 derniers jours", jours: 7 },
  { label: "30 derniers jours", jours: 30 },
  { label: "90 derniers jours", jours: 90 },
  { label: "Tout l'historique", jours: 0 },
];

export function GeoPage({ projectId: _projectId, tab: _tab }: Props) {
  const [filtres, setFiltres] = useState<GeoFiltres>({
    requeteId: "",
    modele: "",
    jours: 30,
  });

  const { data, isLoading, isError } = useGeoDonneesFiltrees(filtres);

  return (
    <div className="px-4 py-4 md:px-6 md:py-6 pb-24 md:pb-8 overflow-auto">
      <div className="mx-auto max-w-7xl space-y-4">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold">Visibilité GEO : WeFiiT est-il cité ?</h1>
            <p className="text-sm text-base-content/60">
              Présence de WeFiiT dans les réponses des IA génératives
            </p>
          </div>
          {data && (
            <p className="text-xs text-base-content/40 self-end">
              Dernier run : {data.kpis.dernierRun || "—"}
            </p>
          )}
        </div>

        {/* Onglet Visibilité GEO */}
        {
          <>
            {/* Filtres */}
            <div className="space-y-2">
              {/* Chips Requête */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none" style={{ scrollbarWidth: "none" }}>
                <span className="shrink-0 text-xs text-base-content/50">Requête</span>
                <button
                  className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium border transition-colors cursor-pointer ${
                    filtres.requeteId === ""
                      ? "bg-[#f98f03] border-[#f98f03] text-white"
                      : "bg-white border-base-300 text-base-content/70 hover:border-[#f98f03]/50 hover:text-[#f98f03]"
                  }`}
                  onClick={() => setFiltres((f) => ({ ...f, requeteId: "" }))}
                >
                  Toutes
                </button>
                {data?.toutesRequetes.map((r) => (
                  <button
                    key={r.id}
                    className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium border transition-colors cursor-pointer ${
                      filtres.requeteId === r.id
                        ? "bg-[#f98f03] border-[#f98f03] text-white"
                        : "bg-white border-base-300 text-base-content/70 hover:border-[#f98f03]/50 hover:text-[#f98f03]"
                    }`}
                    onClick={() => setFiltres((f) => ({ ...f, requeteId: r.id }))}
                  >
                    {r.libelle}
                  </button>
                ))}
              </div>

              {/* Modèle + Période */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <label className="text-xs text-base-content/50">Modèle</label>
                  <select
                    className="select select-sm select-bordered text-xs"
                    value={filtres.modele}
                    onChange={(e) =>
                      setFiltres((f) => ({ ...f, modele: e.target.value }))
                    }
                  >
                    <option value="">Tous les modèles</option>
                    <option value="chatgpt">ChatGPT</option>
                    <option value="gemini">Gemini</option>
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-xs text-base-content/50">Période</label>
                  <select
                    className="select select-sm select-bordered text-xs"
                    value={filtres.jours}
                    onChange={(e) =>
                      setFiltres((f) => ({ ...f, jours: Number(e.target.value) }))
                    }
                  >
                    {PERIODES.map((p) => (
                      <option key={p.jours} value={p.jours}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {isLoading && (
              <div className="flex h-64 items-center justify-center">
                <span className="loading loading-spinner loading-md" />
              </div>
            )}

            {(isError || (!isLoading && !data)) && (
              <div className="flex h-64 items-center justify-center">
                <p className="text-sm text-error">
                  Impossible de charger les données GEO.
                </p>
              </div>
            )}

            {data && (
              <>
                <GeoKpiCards kpis={data.kpis} />
                <div className="grid gap-4 md:grid-cols-2">
                  <GeoEvolutionChart
                    evolutionParRun={data.evolutionParRun}
                    modele={filtres.modele}
                  />
                  <GeoConcurrents
                    topConcurrents={data.topConcurrents}
                    maxConcurrent={data.maxConcurrent}
                  />
                </div>
                <GeoMatriceScores
                  requetes={data.requetes}
                  matriceScores={data.matriceScores}
                  modele={filtres.modele}
                />
                <GeoVerbatims verbatims={data.verbatims} />
              </>
            )}
          </>
        }
      </div>
    </div>
  );
}
