import {
  CartesianGrid,
  Line,
  LineChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Payload } from "recharts/types/component/DefaultTooltipContent";
import type { GeoData } from "./useGeoData";

type Props = { evolutionParRun: GeoData["evolutionParRun"]; modele: string };

export function GeoEvolutionChart({ evolutionParRun, modele }: Props) {
  if (evolutionParRun.length === 0) {
    return (
      <div className="card bg-base-100 border border-base-200 p-4 flex h-56 items-center justify-center text-sm text-base-content/60">
        Pas encore de données d'évolution.
      </div>
    );
  }

  return (
    <div className="card bg-base-100 border border-base-200 p-4 space-y-3">
      <p className="text-sm font-semibold">Évolution du taux de visibilité</p>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={evolutionParRun}
            margin={{ top: 8, right: 12, bottom: 4, left: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="currentColor"
              opacity={0.12}
            />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 9, fill: "#888" }}
              tickLine={false}
              axisLine={false}
              interval={0}
              angle={-45}
              textAnchor="end"
              height={40}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#888" }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
              domain={[0, 100]}
              tickFormatter={(v: number) => `${v}%`}
            />
            <Tooltip
              contentStyle={{ fontSize: 12 }}
              cursor={{ stroke: "currentColor", strokeOpacity: 0.2 }}
              labelFormatter={(label, payload) => {
                const date = (
                  payload as ReadonlyArray<Payload<number, string>>
                )?.[0]?.payload?.date as string | undefined;
                return date ?? String(label);
              }}
              formatter={(value: number | string | undefined) => [
                `${value ?? ""}%`,
              ]}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {(!modele || modele === "chatgpt") && (
              <Line
                type="monotone"
                dataKey="chatgpt"
                name="ChatGPT"
                stroke="#10a37f"
                strokeWidth={2}
                dot={{ r: 3 }}
                connectNulls={false}
              />
            )}
            {(!modele || modele === "gemini") && (
              <Line
                type="monotone"
                dataKey="gemini"
                name="Gemini"
                stroke="#1a73e8"
                strokeWidth={2}
                dot={{ r: 3 }}
                connectNulls={false}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
