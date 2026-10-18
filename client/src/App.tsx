import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from "react";
import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import "./styles/app-shell-phase2.css";
import "./styles/core-screens-phase4.css";
import "./styles/product-polish-phase5.css";
import "./styles/settings-notifications-parity.css";
import "./styles/settings-profile-parity.css";
import "./styles/settings-guardrails-parity.css";
import "./styles/workspace-settings-preview.css";
import { loadSession } from "./api";

const WorkspaceSettingsPreviewPage = lazy(() =>
  import("./pages/WorkspaceSettingsPreviewPage").then((module) => ({ default: module.WorkspaceSettingsPreviewPage })),
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
const DocsPreviewPage = lazy(() =>
  import("./pages/DocsPreviewPage").then((module) => ({ default: module.DocsPreviewPage })),
);

function TenantRoute({ component: Component }: { component: LazyExoticComponent<ComponentType> }) {
  const { tenantId } = useParams();
  if (!tenantId) return <Navigate to="/login" replace />;
  return <Component />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/invite/:token" element={<InvitationAcceptPage />} />
      <Route path="/dashboard/:tenantId" element={<TenantRoute component={DashboardPage} />} />
      <Route path="/dashboard/:tenantId/automation" element={<TenantRoute component={AutomationPage} />} />
      <Route path="/dashboard/:tenantId/automation/:automationId" element={<TenantRoute component={JourneyBuilderPage} />} />
      <Route path="/dashboard/:tenantId/inbox" element={<TenantRoute component={InboxPage} />} />
      <Route path="/dashboard/:tenantId/leads" element={<TenantRoute component={LeadsPage} />} />
      <Route path="/dashboard/:tenantId/leads/:leadId" element={<TenantRoute component={LeadDetailPage} />} />
      <Route path="/dashboard/:tenantId/analytics" element={<TenantRoute component={AnalyticsPage} />} />
      <Route path="/dashboard/:tenantId/content" element={<TenantRoute component={ContentPage} />} />
      <Route path="/dashboard/:tenantId/knowledge" element={<TenantRoute component={KnowledgePage} />} />
      <Route path="/dashboard/:tenantId/integrations" element={<TenantRoute component={IntegrationsPage} />} />
      <Route path="/dashboard/:tenantId/settings" element={<TenantRoute component={SettingsPage} />}>
        <Route index element={<Navigate to="general" replace />} />
        <Route path="general" element={<SettingsGeneralPage />} />
        <Route path="team" element={<TeamPage />} />
        <Route path="billing" element={<BillingPage />} />
        <Route path="fields" element={<SettingsFieldsPage />} />
        <Route path="ai-behavior" element={<SettingsAiBehaviorPage />} />
        <Route path="forbidden-topics" element={<SettingsForbiddenTopicsPage />} />
        <Route path="escalation" element={<SettingsEscalationPage />} />
        <Route path="scoring" element={<SettingsScoringPage />} />
        <Route path="appearance" element={<SettingsAppearancePage />} />
        <Route path="profile" element={<SettingsProfilePage />} />
        <Route path="notifications" element={<SettingsNotificationsPage />} />
      </Route>
      <Route path="/docs/:slug" element={<TenantRoute component={DocsPage} />} />
      <Route path="/docs-preview" element={<DocsPreviewPage />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
