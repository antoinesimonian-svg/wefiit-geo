import { useState, useEffect } from "react";
import type { GeoData } from "./useGeoData";

type Props = { verbatims: GeoData["verbatims"] };
type Verbatim = GeoData["verbatims"][0];

function BadgeModele({ modele }: { modele: string }) {
  if (modele === "chatgpt") return <span className="badge badge-success badge-sm">ChatGPT</span>;
  return <span className="badge badge-info badge-sm">Gemini</span>;
}

function VerbatimModal({ v, onClose }: { v: Verbatim; onClose: () => void }) {
  const [texteComplet, setTexteComplet] = useState<string | null>(null);
  const [chargement, setChargement] = useState(false);

  useEffect(() => {
    if (!v.cheminReponse) return;
    setChargement(true);
    fetch(`/${v.cheminReponse}`)
      .then((r) => (r.ok ? r.text() : null))
      .then((t) => setTexteComplet(t))
      .catch(() => setTexteComplet(null))
      .finally(() => setChargement(false));
  }, [v.cheminReponse]);

  const contenu = texteComplet ?? v.texte;

  return (
    <div className="modal modal-open" onClick={onClose}>
      <div
        className="modal-box max-w-2xl max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2"
          onClick={onClose}
        >
          ✕
        </button>
        <h3 className="font-semibold text-base mb-1">{v.requete}</h3>
        <div className="flex items-center gap-2 mb-4">
          <BadgeModele modele={v.modele} />
          <span className="text-xs text-base-content/40">{v.date}</span>
          {texteComplet && (
            <span className="text-xs text-success ml-auto">Réponse complète</span>
          )}
        </div>
        {chargement ? (
          <div className="flex justify-center py-8">
            <span className="loading loading-spinner loading-sm" />
          </div>
        ) : (
          <p className="text-sm leading-relaxed text-base-content/90 whitespace-pre-wrap">
            "{contenu}"
          </p>
        )}
      </div>
    </div>
  );
}

function VerbatimCard({ v, onOpen }: { v: Verbatim; onOpen: () => void }) {
  const long = v.texte.length > 200;
  const bgClass = v.wefiitCite ? "" : "bg-[#f8f9fa] opacity-80";
  const bgStyle = v.wefiitCite
    ? { background: "rgba(249,143,3,0.07)", border: "1px solid rgba(249,143,3,0.2)" }
    : {};

  return (
    <div className={`rounded-lg border border-base-200 p-3 space-y-2 ${bgClass}`} style={bgStyle}>
      <p className="text-sm leading-relaxed text-base-content/90 line-clamp-3">
        "{v.texte}"
      </p>
      {long && (
        <button
          className="text-xs text-primary hover:underline"
          onClick={onOpen}
        >
          Voir la réponse complète →
        </button>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <BadgeModele modele={v.modele} />
        {v.wefiitCite ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-[#e95400]">
            <img
              src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS3GgsS4gnbVgzHjynixRKNWUx3hjzUcYJwsQ&s"
              alt="WeFiiT"
              className="h-4 w-4 rounded object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
            cité
          </span>
        ) : (
          <span className="badge badge-sm badge-ghost text-base-content/40">Non cité</span>
        )}
        <span className="text-xs text-base-content/50">{v.requete}</span>
        <span className="ml-auto text-xs text-base-content/40">{v.date}</span>
      </div>
    </div>
  );
}

export function GeoVerbatims({ verbatims }: Props) {
  const [selected, setSelected] = useState<Verbatim | null>(null);

  if (verbatims.length === 0) {
    return (
      <div className="card bg-base-100 border border-base-200 p-4">
        <p className="text-sm text-base-content/60">Aucun verbatim enregistré pour le moment.</p>
      </div>
    );
  }

  return (
    <>
      <div className="card bg-base-100 border border-base-200 p-4 space-y-3">
        <p className="text-sm font-semibold">Verbatims WeFiiT récents</p>
        <div className="flex flex-col gap-3">
          {verbatims.slice(0, 9).map((v, i) => (
            <VerbatimCard key={i} v={v} onOpen={() => setSelected(v)} />
          ))}
        </div>
      </div>
      {selected && <VerbatimModal v={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
