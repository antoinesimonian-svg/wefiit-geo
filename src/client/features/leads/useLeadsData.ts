import { useQuery } from "@tanstack/react-query";

export type Lead = {
  id: string;
  date: string;
  type: "Business" | "Candidat";
  source: "Bookings" | "Webflow" | "Inconnu";
  nom: string | null;
  email: string | null;
  telephone: string | null;
  message: string | null;
  statut: "à traiter" | "traité";
};

type LeadsJson = {
  generatedAt: string;
  leads: Lead[];
};

export type LeadsFiltres = {
  type: "" | "Business" | "Candidat";
  source: "" | "Bookings" | "Webflow";
  statut: "" | "à traiter" | "traité";
};

function filtrer(leads: Lead[], filtres: LeadsFiltres): Lead[] {
  return leads.filter((l) => {
    if (filtres.type && l.type !== filtres.type) return false;
    if (filtres.source && l.source !== filtres.source) return false;
    if (filtres.statut && l.statut !== filtres.statut) return false;
    return true;
  });
}

export function useLeadsData(filtres: LeadsFiltres) {
  const query = useQuery({
    queryKey: ["leads-json"],
    queryFn: async () => {
      const res = await fetch("/leads.json");
      if (!res.ok) throw new Error(`Erreur fetch leads.json : ${res.status}`);
      const data: LeadsJson = await res.json();
      return data;
    },
    staleTime: 5 * 60_000,
  });

  const { data: brut, isLoading, isError } = query;

  if (!brut) return { leads: null, generatedAt: null, isLoading, isError };

  const leadsFiltres = filtrer(brut.leads, filtres);

  return {
    leads: leadsFiltres,
    generatedAt: brut.generatedAt,
    isLoading,
    isError,
  };
}
