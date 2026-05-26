import type { GeoData } from "./useGeoData";

type Props = {
  topConcurrents: GeoData["topConcurrents"];
  maxConcurrent: GeoData["maxConcurrent"];
};

export function GeoConcurrents({ topConcurrents, maxConcurrent }: Props) {
  return (
    <div className="card bg-base-100 border border-base-200 p-4 space-y-3">
      <p className="text-sm font-semibold">Concurrents — fréquence de citation</p>
      <div className="overflow-y-auto max-h-72 space-y-1.5 pr-1">
        {topConcurrents.map(({ nom, total, freq }) => {
          const isWefiit = nom.toLowerCase().includes("wefiit");
          return (
            <div key={nom} className={`flex items-center gap-3 rounded px-1.5 py-0.5 ${isWefiit ? "bg-warning/10" : ""}`}>
              <span
                className={`w-28 shrink-0 truncate text-xs ${isWefiit ? "font-semibold text-warning" : "text-base-content/80"}`}
                title={nom}
              >
                {nom}
              </span>
              <div className="flex-1 rounded-full bg-base-200 h-2 overflow-hidden">
                <div
                  className="h-2 rounded-full bar-grow"
                  style={{
                    width: `${(total / maxConcurrent) * 100}%`,
                    background: isWefiit
                      ? "linear-gradient(90deg, #f98f03, #e95400)"
                      : "linear-gradient(90deg, #f98f03cc, #e95400aa)",
                  }}
                />
              </div>
              <span className="w-8 text-right text-xs tabular-nums text-base-content/60">{freq}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
