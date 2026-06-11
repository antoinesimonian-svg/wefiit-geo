import { useQuery } from "@tanstack/react-query";

export type Lead = {
  id: string;
  date: string;
  type: "Business" | "Candidat";
  typeLead: "demande de contact" | "réservation booking";
  email: string | null;
  entreprise: string | null;
  message: string | null;
};

type LeadsJson = {
  generatedAt: string;
  leads: Lead[];
};

export type LeadsFiltres = {
  type: "" | "Business" | "Candidat";
  typeLead: "" | "demande de contact" | "réservation booking";
};

function filtrer(leads: Lead[], filtres: LeadsFiltres): Lead[] {
  return leads.filter((l) => {
    if (filtres.type && l.type !== filtres.type) return false;
    if (filtres.typeLead && l.typeLead !== filtres.typeLead) return false;
    return true;
  });
}

export function useLeadsData(filtres: LeadsFiltres) {
  const query = useQuery({
    queryKey: ["leads-json"],
    queryFn: async () => {
      const res = await fetch(`/leads.json?v=${Date.now()}`);
      if (!res.ok) throw new Error(`Erreur fetch leads.json : ${res.status}`);
      const data: LeadsJson = await res.json();
      return data;
    },
    staleTime: 0,
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
