import { useSystemHealthData } from "./useSystemHealthData";

const STATUT_LABELS: Record<string, string> = {
  timeout: "Timeout",
  reponse_vide: "Réponse vide",
  erreur_reseau: "Erreur réseau",
  erreur_ui: "Erreur UI",
  erreur: "Erreur générique",
  "login-wall": "Login wall",
};

const STATUT_COLORS: Record<string, string> = {
  timeout: "badge-warning",
  reponse_vide: "badge-warning",
  erreur_reseau: "badge-error",
  erreur_ui: "badge-error",
  erreur: "badge-error",
  "login-wall": "badge-neutral",
};

export function GeoSystemHealth() {
  const { data, isLoading, isError } = useSystemHealthData();

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <span className="loading loading-spinner loading-md" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-error">Impossible de charger les données de santé système.</p>
      </div>
    );
  }

  const totalErreurs = Object.values(data.repartitionErreurs).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-4">

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="bg-base-200 rounded-xl p-4">
          <p className="text-xs text-base-content/50 mb-1">Taux succès 7j</p>
          <p className={`text-2xl font-bold ${data.tauxSucces7j >= 80 ? "text-success" : data.tauxSucces7j >= 50 ? "text-warning" : "text-error"}`}>
            {data.tauxSucces7j}%
          </p>
        </div>
        <div className="bg-base-200 rounded-xl p-4">
          <p className="text-xs text-base-content/50 mb-1">Taux succès 30j</p>
          <p className={`text-2xl font-bold ${data.tauxSucces30j >= 80 ? "text-success" : data.tauxSucces30j >= 50 ? "text-warning" : "text-error"}`}>
            {data.tauxSucces30j}%
          </p>
        </div>
        <div className="bg-base-200 rounded-xl p-4">
          <p className="text-xs text-base-content/50 mb-1">Runs partiels</p>
          <p className={`text-2xl font-bold ${data.jobsPartiels === 0 ? "text-success" : "text-warning"}`}>
            {data.jobsPartiels}
          </p>
          <p className="text-xs text-base-content/40">sur {data.totalJobs} jobs</p>
        </div>
        <div className="bg-base-200 rounded-xl p-4">
          <p className="text-xs text-base-content/50 mb-1">Retries réussis</p>
          <p className="text-2xl font-bold text-info">{data.totalRetries}</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">

        {/* Répartition erreurs */}
        <div className="bg-base-200 rounded-xl p-4">
          <h3 className="text-sm font-medium mb-3">Répartition des erreurs</h3>
          {totalErreurs === 0 ? (
            <p className="text-sm text-success">Aucune erreur enregistrée ✅</p>
          ) : (
            <div className="space-y-2">
              {Object.entries(data.repartitionErreurs)
                .sort((a, b) => b[1] - a[1])
                .map(([statut, count]) => (
                  <div key={statut} className="flex items-center gap-2">
                    <span className={`badge badge-sm ${STATUT_COLORS[statut] ?? "badge-neutral"}`}>
                      {STATUT_LABELS[statut] ?? statut}
                    </span>
                    <div className="flex-1 bg-base-300 rounded-full h-2">
                      <div
                        className="bg-primary h-2 rounded-full"
                        style={{ width: `${Math.round((count / totalErreurs) * 100)}%` }}
                      />
                    </div>
                    <span className="text-xs text-base-content/60 w-8 text-right">{count}</span>
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* Historique des 10 derniers jobs */}
        <div className="bg-base-200 rounded-xl p-4">
          <h3 className="text-sm font-medium mb-3">Derniers jobs</h3>
          <div className="space-y-1.5">
            {data.derniersJobs.map((job) => {
              const date = job.démarré.slice(0, 10);
              const heure = job.démarré.slice(11, 16);
              const manquants = job.evals?.completude?.manquants ?? [];
              return (
                <div key={job.jobId} className="flex items-center gap-2 text-xs">
                  <span className={`badge badge-xs ${job.statut === "succès" ? "badge-success" : "badge-warning"}`}>
                    {job.statut}
                  </span>
                  <span className="text-base-content/60">{date} {heure}</span>
                  <span className="text-base-content/40">{job.modèles.join("+")}</span>
                  {manquants.length > 0 && (
                    <span className="text-error/70 truncate" title={manquants.join(", ")}>
                      ⚠️ {manquants.length} manquant{manquants.length > 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Timeline succès/partiel */}
      <div className="bg-base-200 rounded-xl p-4">
        <h3 className="text-sm font-medium mb-3">Timeline des 30 derniers jobs</h3>
        <div className="flex flex-wrap gap-1.5">
          {data.evolutionSucces.map((j, i) => (
            <div
              key={i}
              title={`${j.date} — ${j.statut}`}
              className={`w-5 h-5 rounded-sm cursor-default ${j.statut === "succès" ? "bg-success/70" : "bg-warning/70"}`}
            />
          ))}
        </div>
        <div className="flex gap-4 mt-2 text-xs text-base-content/50">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-success/70 inline-block" /> Succès</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-warning/70 inline-block" /> Partiel</span>
        </div>
      </div>

    </div>
  );
}
