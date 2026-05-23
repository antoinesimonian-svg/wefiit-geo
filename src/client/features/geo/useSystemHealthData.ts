import { useQuery } from "@tanstack/react-query";

export type JobEntry = {
  jobId: string;
  démarré: string;
  terminé: string;
  durée: number;
  mode: string;
  requêtes: number;
  modèles: string[];
  statut: "succès" | "partiel";
  résumé: { ok: number; timeout: number; erreur: number; ignoré: number };
  evals?: {
    completude?: { attendu: number; ok: number; manquants: string[] };
    anomalies?: string[];
  };
};

export type AuditEntry = {
  jobId: string;
  requêteId: string;
  modèle: string;
  run: number;
  statut: "ok" | "timeout" | "reponse_vide" | "erreur_reseau" | "erreur_ui" | "erreur" | "login-wall" | "ignoré";
  démarré: string | null;
  terminé: string | null;
  durée: number | null;
  wefiit: boolean | null;
  erreurDétail: string | null;
};

export type SystemHealthData = {
  jobs: JobEntry[];
  tauxSucces30j: number;
  tauxSucces7j: number;
  totalJobs: number;
  jobsPartiels: number;
  totalRetries: number;
  repartitionErreurs: Record<string, number>;
  evolutionSucces: Array<{ date: string; statut: "succès" | "partiel" }>;
  derniersJobs: JobEntry[];
};

function dateMinusJours(jours: number): string {
  return new Date(Date.now() - jours * 86400_000).toISOString().slice(0, 10);
}

function calculerTaux(jobs: JobEntry[], depuis: string): number {
  const filtres = jobs.filter(j => j.démarré.slice(0, 10) >= depuis);
  if (filtres.length === 0) return 0;
  return Math.round((filtres.filter(j => j.statut === "succès").length / filtres.length) * 100);
}

function transforme(jobs: JobEntry[], audit: AuditEntry[]): SystemHealthData {
  const depuis30j = dateMinusJours(30);
  const depuis7j = dateMinusJours(7);

  const repartitionErreurs: Record<string, number> = {};
  for (const e of audit) {
    if (e.statut !== "ok" && e.statut !== "ignoré") {
      repartitionErreurs[e.statut] = (repartitionErreurs[e.statut] ?? 0) + 1;
    }
  }

  // Retries = jobs qui ont un evals.completude avec des manquants résolus
  const totalRetries = jobs.filter(j => (j.evals?.completude?.manquants?.length ?? 0) === 0 && j.statut === "succès" && j.résumé.erreur > 0).length;

  const evolutionSucces = jobs
    .slice(-30)
    .map(j => ({ date: j.démarré.slice(0, 10), statut: j.statut }));

  return {
    jobs,
    tauxSucces30j: calculerTaux(jobs, depuis30j),
    tauxSucces7j: calculerTaux(jobs, depuis7j),
    totalJobs: jobs.length,
    jobsPartiels: jobs.filter(j => j.statut === "partiel").length,
    totalRetries,
    repartitionErreurs,
    evolutionSucces,
    derniersJobs: [...jobs].reverse().slice(0, 10),
  };
}

export function useSystemHealthData() {
  const jobs = useQuery({
    queryKey: ["geo-jobs"],
    queryFn: async () => {
      const res = await fetch("/jobs.json");
      if (!res.ok) throw new Error(`Erreur fetch jobs.json : ${res.status}`);
      return res.json() as Promise<JobEntry[]>;
    },
    staleTime: 5 * 60_000,
  });

  const auditQ = useQuery({
    queryKey: ["geo-audit"],
    queryFn: async () => {
      const res = await fetch("/audit.json");
      if (!res.ok) throw new Error(`Erreur fetch audit.json : ${res.status}`);
      return res.json() as Promise<AuditEntry[]>;
    },
    staleTime: 5 * 60_000,
  });

  const isLoading = jobs.isLoading || auditQ.isLoading;
  const isError = jobs.isError || auditQ.isError;

  if (!jobs.data || !auditQ.data) return { data: null, isLoading, isError };

  return { data: transforme(jobs.data, auditQ.data), isLoading, isError };
}
