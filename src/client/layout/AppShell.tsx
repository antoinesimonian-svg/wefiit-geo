import * as React from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronDown,
  Menu,
} from "lucide-react";
import {
  AppContent,
  MissingSeoSetupModal,
  SeoApiStatusBanners,
} from "@/client/layout/AppShellParts";
import { getProjectNavGroups } from "@/client/navigation/items";
import { getSeoApiKeyStatus } from "@/serverFunctions/config";
import { getOrCreateDefaultProject } from "@/serverFunctions/projects";

const DATAFORSEO_HELP_PATH = "/help/dataforseo-api-key";

/** Favicon WeFiiT — logo image de la marque */
function WeFiiTFavicon() {
  return (
    <img
      src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS3GgsS4gnbVgzHjynixRKNWUx3hjzUcYJwsQ&s"
      alt="WeFiiT"
      className="h-7 w-7 shrink-0 rounded-lg object-cover"
      onError={(e) => {
        (e.target as HTMLImageElement).style.display = "none";
      }}
    />
  );
}
export function AuthenticatedAppLayout({
  children,
  projectId,
  banner,
}: {
  children: React.ReactNode;
  projectId?: string;
  banner?: React.ReactNode;
}) {
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const setupModalRef = React.useRef<HTMLDivElement | null>(null);
  const [showMissingSeoApiKeyModal, setShowMissingSeoApiKeyModal] =
    React.useState(false);
  const defaultProjectQuery = useQuery({
    queryKey: ["defaultProject"],
    queryFn: () => getOrCreateDefaultProject(),
    enabled: !projectId,
  });
  const headerProjectId = projectId ?? defaultProjectQuery.data?.id ?? null;
  const shouldCheckSeoApiKeyStatus = true;
  const seoApiKeyStatusQuery = useQuery({
    queryKey: ["seoApiKeyStatus"],
    queryFn: () => getSeoApiKeyStatus(),
    enabled: shouldCheckSeoApiKeyStatus,
  });
  const isSeoApiKeyConfigured = shouldCheckSeoApiKeyStatus
    ? (seoApiKeyStatusQuery.data?.configured ?? null)
    : null;
  const seoApiKeyStatusError =
    shouldCheckSeoApiKeyStatus && seoApiKeyStatusQuery.isError;

  React.useEffect(() => {
    if (!shouldCheckSeoApiKeyStatus) {
      setShowMissingSeoApiKeyModal(false);
      return;
    }

    if (seoApiKeyStatusQuery.isError) {
      setShowMissingSeoApiKeyModal(false);
      return;
    }

    if (!seoApiKeyStatusQuery.isSuccess) return;
    setShowMissingSeoApiKeyModal(!seoApiKeyStatusQuery.data.configured);
  }, [
    location.pathname,
    seoApiKeyStatusQuery.data,
    seoApiKeyStatusQuery.isError,
    seoApiKeyStatusQuery.isSuccess,
    shouldCheckSeoApiKeyStatus,
  ]);

  const shouldShowMissingSeoApiKeyModal =
    showMissingSeoApiKeyModal && location.pathname !== DATAFORSEO_HELP_PATH;

  const shouldShowSeoApiWarning =
    !seoApiKeyStatusError &&
    isSeoApiKeyConfigured === false &&
    !shouldShowMissingSeoApiKeyModal;

  React.useEffect(() => {
    if (!shouldShowMissingSeoApiKeyModal) return;

    setupModalRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowMissingSeoApiKeyModal(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [shouldShowMissingSeoApiKeyModal]);

  React.useEffect(() => {
    if (!projectId) {
      setDrawerOpen(false);
    }
  }, [projectId]);

  return (
    <div className="flex h-[100dvh] flex-col bg-base-200">
      <TopNav
        drawerOpen={drawerOpen}
        projectId={headerProjectId}
        pathname={location.pathname}
        onOpenDrawer={() => setDrawerOpen(true)}
      />

      <SeoApiStatusBanners
        shouldShowSeoApiWarning={shouldShowSeoApiWarning}
        seoApiKeyStatusError={seoApiKeyStatusError}
      />

      {banner}

      <AppContent
        drawerOpen={drawerOpen}
        projectId={headerProjectId}
        onCloseDrawer={() => setDrawerOpen(false)}
      >
        {children}
      </AppContent>

      <MissingSeoSetupModal
        ref={setupModalRef}
        isOpen={shouldShowMissingSeoApiKeyModal}
        onClose={() => setShowMissingSeoApiKeyModal(false)}
      />
    </div>
  );
}

function TopNav({
  drawerOpen,
  projectId,
  pathname,
  onOpenDrawer,
}: {
  drawerOpen: boolean;
  projectId: string | null;
  pathname: string;
  onOpenDrawer: () => void;
}) {
  const navGroups = projectId ? getProjectNavGroups(projectId) : [];

  return (
    <div className="navbar shrink-0 gap-2 border-b border-base-300 bg-base-100">
      <div className="flex flex-none items-center md:hidden">
        {projectId ? (
          <button
            type="button"
            className="btn btn-square btn-ghost"
            aria-label="Toggle sidebar"
            aria-expanded={drawerOpen}
            onClick={onOpenDrawer}
          >
            <Menu className="h-6 w-6" />
          </button>
        ) : null}
        <Link to="/" className="ml-1 flex items-center gap-2">
          <WeFiiTFavicon />
          <span className="font-semibold text-base-content">Dashboard GEO & SEO</span>
        </Link>
      </div>

      <div className="hidden items-center gap-1 md:flex">
        <Link to="/" className="flex items-center gap-2 px-2">
          <WeFiiTFavicon />
          <span className="text-base font-semibold text-base-content">Dashboard GEO & SEO</span>
        </Link>
        {projectId
          ? navGroups.map((entry) => {
              if (entry.type === "standalone") {
                const { icon: Icon, matchSegment, ...linkProps } = entry.item;
                const isActive = pathname.includes(matchSegment);
                return (
                  <Link
                    key={linkProps.to}
                    {...linkProps}
                    className={`btn btn-sm gap-2 ${
                      isActive
                        ? "border-transparent bg-primary/10 font-medium text-primary"
                        : "btn-ghost text-base-content/60 hover:text-base-content"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {entry.item.label}
                  </Link>
                );
              }

              const GroupIcon = entry.icon;
              const isGroupActive = entry.matchSegments.some((seg) =>
                pathname.includes(seg),
              );

              return (
                <div key={entry.label} className="dropdown dropdown-hover">
                  <button
                    type="button"
                    tabIndex={0}
                    className={`btn btn-sm gap-1.5 ${
                      isGroupActive
                        ? "border-transparent bg-primary/10 font-medium text-primary"
                        : "btn-ghost text-base-content/60 hover:text-base-content"
                    }`}
                  >
                    <GroupIcon className="h-4 w-4" />
                    {entry.label}
                    <ChevronDown className="h-3 w-3 opacity-50" />
                  </button>
                  <ul
                    tabIndex={0}
                    className="dropdown-content z-20 menu w-52 rounded-box border border-base-300 bg-base-100 p-2 shadow-lg"
                  >
                    {entry.items.map((item) => {
                      const { icon: Icon, matchSegment, ...linkProps } = item;
                      const isActive = pathname.includes(matchSegment);
                      return (
                        <li key={linkProps.to}>
                          <Link
                            {...linkProps}
                            className={
                              isActive
                                ? "bg-primary/10 font-medium text-primary"
                                : ""
                            }
                            onClick={() => {
                              if (
                                document.activeElement instanceof HTMLElement
                              ) {
                                document.activeElement.blur();
                              }
                            }}
                          >
                            <Icon className="h-4 w-4" />
                            {item.label}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })
          : null}
      </div>

      <div className="flex-1" />
    </div>
  );
}
