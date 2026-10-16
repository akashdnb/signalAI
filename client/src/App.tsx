import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from "react";
import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import "./styles/app-shell-phase2.css";
import "./styles/core-screens-phase4.css";
import "./styles/product-polish-phase5.css";
import "./styles/precision-operations-preview.css";
import { loadSession } from "./api";

const PrecisionOperationsPreviewPage = lazy(() =>
  import("./pages/PrecisionOperationsPreviewPage").then((module) => ({ default: module.PrecisionOperationsPreviewPage })),
);

const AnalyticsPage = lazy(() =>
  import("./pages/AnalyticsPage").then((module) => ({ default: module.AnalyticsPage })),
);
const AutomationPage = lazy(() =>
  import("./pages/AutomationPage").then((module) => ({ default: module.AutomationPage })),
);
const JourneyBuilderPage = lazy(() =>
  import("./pages/JourneyBuilderPage").then((module) => ({ default: module.JourneyBuilderPage })),
);
const BillingPage = lazy(() =>
  import("./pages/BillingPage").then((module) => ({ default: module.BillingPage })),
);
const ConnectPage = lazy(() =>
  import("./pages/ConnectPage").then((module) => ({ default: module.ConnectPage })),
);
const ContentPage = lazy(() =>
  import("./pages/ContentPage").then((module) => ({ default: module.ContentPage })),
);
const DashboardPage = lazy(() =>
  import("./pages/DashboardPage").then((module) => ({ default: module.DashboardPage })),
);
const DocsPage = lazy(() =>
  import("./pages/DocsPage").then((module) => ({ default: module.DocsPage })),
);
const InboxPage = lazy(() =>
  import("./pages/InboxPage").then((module) => ({ default: module.InboxPage })),
);
const IntegrationsPage = lazy(() =>
  import("./pages/IntegrationsPage").then((module) => ({ default: module.IntegrationsPage })),
);
const KnowledgePage = lazy(() =>
  import("./pages/KnowledgePage").then((module) => ({ default: module.KnowledgePage })),
);
const LeadDetailPage = lazy(() =>
  import("./pages/LeadDetailPage").then((module) => ({ default: module.LeadDetailPage })),
);
const LeadsPage = lazy(() =>
  import("./pages/LeadsPage").then((module) => ({ default: module.LeadsPage })),
);
const LoginPage = lazy(() =>
  import("./pages/LoginPage").then((module) => ({ default: module.LoginPage })),
);
const SettingsPage = lazy(() =>
  import("./pages/SettingsPage").then((module) => ({ default: module.SettingsPage })),
);
const SettingsGeneralPage = lazy(() =>
  import("./pages/settings/SettingsGeneralPage").then((module) => ({ default: module.SettingsGeneralPage })),
);
const SettingsFieldsPage = lazy(() =>
  import("./pages/settings/SettingsFieldsPage").then((module) => ({ default: module.SettingsFieldsPage })),
);
const SettingsAiBehaviorPage = lazy(() =>
  import("./pages/settings/SettingsAiBehaviorPage").then((module) => ({ default: module.SettingsAiBehaviorPage })),
);
const SettingsForbiddenTopicsPage = lazy(() =>
  import("./pages/settings/SettingsForbiddenTopicsPage").then((module) => ({ default: module.SettingsForbiddenTopicsPage })),
);
const SettingsEscalationPage = lazy(() =>
  import("./pages/settings/SettingsEscalationPage").then((module) => ({ default: module.SettingsEscalationPage })),
);
const SettingsScoringPage = lazy(() =>
  import("./pages/settings/SettingsScoringPage").then((module) => ({ default: module.SettingsScoringPage })),
);
const SettingsAppearancePage = lazy(() =>
  import("./pages/settings/SettingsAppearancePage").then((module) => ({ default: module.SettingsAppearancePage })),
);
const SettingsProfilePage = lazy(() =>
  import("./pages/settings/SettingsProfilePage").then((module) => ({ default: module.SettingsProfilePage })),
);
const SettingsNotificationsPage = lazy(() =>
  import("./pages/settings/SettingsNotificationsPage").then((module) => ({ default: module.SettingsNotificationsPage })),
);
const TeamPage = lazy(() =>
  import("./pages/TeamPage").then((module) => ({ default: module.TeamPage })),
);
const InvitationAcceptPage = lazy(() =>
  import("./pages/InvitationAcceptPage").then((module) => ({ default: module.InvitationAcceptPage })),
);

function PageLoadingFallback() {
  return (
    <div
      role="status"
      className="flex min-h-24 items-center justify-center px-4 py-8 text-sm text-subtle"
    >
      Loading page…
    </div>
  );
}

function LazyPage({ Page }: { Page: LazyExoticComponent<ComponentType> }) {
  return (
    <Suspense fallback={<PageLoadingFallback />}>
      <Page />
    </Suspense>
  );
}

/** Team & access and Plan & billing moved into Settings' sub-nav (matching the preview's IA) — these keep any existing bookmarks/links to the old top-level routes working. */
function RedirectToSettingsSection({ section }: { section: string }) {
  const { tenantId } = useParams<{ tenantId: string }>();
  return <Navigate to={`/dashboard/${tenantId}/settings/${section}`} replace />;
}

function HomeRedirect() {
  // Render the isolated concept from the static preview site's root when its
  // explicit query flag is present. This avoids relying on host-level SPA
  // rewrite configuration for a temporary review route.
  const isPrecisionPreview =
    new URLSearchParams(window.location.search).get("preview") === "precision-operations";
  if (isPrecisionPreview) return <LazyPage Page={PrecisionOperationsPreviewPage} />;

  const session = loadSession();
  return <Navigate to={session ? `/dashboard/${session.tenantId}` : "/login"} replace />;
}

export default function App() {
  return (
    <Routes>
      {/* Isolated UI concept route. Sample content only; remove after the design is approved and migrated into real screens. */}
      <Route path="/redesign-preview" element={<LazyPage Page={PrecisionOperationsPreviewPage} />} />
      <Route path="/" element={<HomeRedirect />} />
      <Route path="/docs" element={<Navigate to="/docs/introduction" replace />} />
      <Route path="/docs/*" element={<LazyPage Page={DocsPage} />} />
      <Route path="/login" element={<LazyPage Page={LoginPage} />} />
      <Route path="/connect" element={<LazyPage Page={ConnectPage} />} />
      <Route path="/invite" element={<LazyPage Page={InvitationAcceptPage} />} />
      <Route path="/dashboard/:tenantId" element={<AppShell />}>
        <Route index element={<LazyPage Page={DashboardPage} />} />
        <Route path="settings" element={<LazyPage Page={SettingsPage} />}>
          <Route index element={<Navigate to="general" replace />} />
          <Route path="general" element={<LazyPage Page={SettingsGeneralPage} />} />
          <Route path="team" element={<LazyPage Page={TeamPage} />} />
          <Route path="billing" element={<LazyPage Page={BillingPage} />} />
          <Route path="fields" element={<LazyPage Page={SettingsFieldsPage} />} />
          <Route path="ai-behavior" element={<LazyPage Page={SettingsAiBehaviorPage} />} />
          <Route path="forbidden-topics" element={<LazyPage Page={SettingsForbiddenTopicsPage} />} />
          <Route path="escalation" element={<LazyPage Page={SettingsEscalationPage} />} />
          <Route path="scoring" element={<LazyPage Page={SettingsScoringPage} />} />
          <Route path="appearance" element={<LazyPage Page={SettingsAppearancePage} />} />
          <Route path="profile" element={<LazyPage Page={SettingsProfilePage} />} />
          <Route path="notifications" element={<LazyPage Page={SettingsNotificationsPage} />} />
        </Route>
        <Route path="leads/:leadId" element={<LazyPage Page={LeadDetailPage} />} />
        <Route path="inbox" element={<LazyPage Page={InboxPage} />} />
        <Route path="leads" element={<LazyPage Page={LeadsPage} />} />
        <Route path="automation" element={<LazyPage Page={AutomationPage} />} />
        <Route path="automation/journeys/:campaignId" element={<LazyPage Page={JourneyBuilderPage} />} />
        <Route path="content" element={<LazyPage Page={ContentPage} />} />
        <Route path="knowledge" element={<LazyPage Page={KnowledgePage} />} />
        <Route path="analytics" element={<LazyPage Page={AnalyticsPage} />} />
        <Route path="team" element={<RedirectToSettingsSection section="team" />} />
        <Route path="integrations" element={<LazyPage Page={IntegrationsPage} />} />
        <Route path="billing" element={<RedirectToSettingsSection section="billing" />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
