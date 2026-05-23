import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useGeoDonneesFiltrees, type GeoFiltres } from "./useGeoData";
import { GeoKpiCards } from "./GeoKpiCards";
import { GeoEvolutionChart } from "./GeoEvolutionChart";
import { GeoMatriceScores } from "./GeoMatriceScores";
import { GeoConcurrents } from "./GeoConcurrents";
import { GeoVerbatims } from "./GeoVerbatims";
import { GeoSystemHealth } from "./GeoSystemHealth";

type Props = { projectId: string; tab: "visibility" | "sante" };

const PERIODES = [
  { label: "Hier", jours: 1 },
  { label: "7 derniers jours", jours: 7 },
  { label: "30 derniers jours", jours: 30 },
  { label: "90 derniers jours", jours: 90 },
  { label: "Tout l'historique", jours: 0 },
];

export function GeoPage({ projectId, tab }: Props) {
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
            <h1 className="text-lg font-semibold">GEO Visibility</h1>
            <p className="text-sm text-base-content/60">Présence de WeFiiT dans les réponses des IA génératives</p>
          </div>
          {data && (
            <p className="text-xs text-base-content/40 self-end">Dernier run : {data.kpis.dernierRun || "—"}</p>
          )}
        </div>

        {/* Tabs */}
        <div role="tablist" className="tabs tabs-box w-fit">
          <Link
            to="/p/$projectId/geo"
            params={{ projectId }}
            search={{ tab: "visibility" }}
            replace
            role="tab"
            className={`tab text-xs ${tab === "visibility" ? "tab-active" : ""}`}
          >
            GEO Visibility
          </Link>
          <Link
            to="/p/$projectId/geo"
            params={{ projectId }}
            search={{ tab: "sante" }}
            replace
            role="tab"
            className={`tab text-xs ${tab === "sante" ? "tab-active" : ""}`}
          >
            Santé système
          </Link>
        </div>

        {/* Onglet Santé système */}
        {tab === "sante" && <GeoSystemHealth />}

        {/* Onglet GEO Visibility */}
        {tab === "visibility" && (
          <>
            {/* Filtres */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <label className="text-xs text-base-content/50">Requête</label>
                <select
                  className="select select-sm select-bordered text-xs"
                  value={filtres.requeteId}
                  onChange={(e) => setFiltres((f) => ({ ...f, requeteId: e.target.value }))}
                >
                  <option value="">Toutes les requêtes</option>
                  {data?.toutesRequetes.map((r) => (
                    <option key={r.id} value={r.id}>{r.libelle}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <label className="text-xs text-base-content/50">Modèle</label>
                <select
                  className="select select-sm select-bordered text-xs"
                  value={filtres.modele}
                  onChange={(e) => setFiltres((f) => ({ ...f, modele: e.target.value }))}
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
                  onChange={(e) => setFiltres((f) => ({ ...f, jours: Number(e.target.value) }))}
                >
                  {PERIODES.map((p) => (
                    <option key={p.jours} value={p.jours}>{p.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {isLoading && (
              <div className="flex h-64 items-center justify-center">
                <span className="loading loading-spinner loading-md" />
              </div>
            )}

            {(isError || (!isLoading && !data)) && (
              <div className="flex h-64 items-center justify-center">
                <p className="text-sm text-error">Impossible de charger les données GEO.</p>
              </div>
            )}

            {data && (
              <>
                <GeoKpiCards kpis={data.kpis} />
                <div className="grid gap-4 md:grid-cols-2">
                  <GeoEvolutionChart evolutionParRun={data.evolutionParRun} modele={filtres.modele} />
                  <GeoConcurrents topConcurrents={data.topConcurrents} maxConcurrent={data.maxConcurrent} />
                </div>
                <GeoMatriceScores requetes={data.requetes} matriceScores={data.matriceScores} modele={filtres.modele} />
                <GeoVerbatims verbatims={data.verbatims} />
              </>
            )}
          </>
        )}

      </div>
    </div>
  );
}
