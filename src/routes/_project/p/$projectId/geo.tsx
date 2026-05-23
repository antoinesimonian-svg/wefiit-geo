import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { GeoPage } from "@/client/features/geo/GeoPage";

const geoTabs = ["visibility", "sante"] as const;

const geoSearchSchema = z.object({
  tab: z.enum(geoTabs).catch("visibility").default("visibility"),
});

export const Route = createFileRoute("/_project/p/$projectId/geo")({
  validateSearch: geoSearchSchema,
  component: GeoRoute,
});

function GeoRoute() {
  const { projectId } = Route.useParams();
  const { tab } = Route.useSearch();
  return <GeoPage projectId={projectId} tab={tab} />;
}
