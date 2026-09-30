import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { AnalyticsPage } from "./pages/AnalyticsPage";
import { AutomationPage } from "./pages/AutomationPage";
import { ConnectPage } from "./pages/ConnectPage";
import { ContentPage } from "./pages/ContentPage";
import { DashboardPage } from "./pages/DashboardPage";
import { InboxPage } from "./pages/InboxPage";
import { IntegrationsPage } from "./pages/IntegrationsPage";
import { LeadDetailPage } from "./pages/LeadDetailPage";
import { LeadsPage } from "./pages/LeadsPage";
import { LoginPage } from "./pages/LoginPage";
import { SettingsPage } from "./pages/SettingsPage";
import { TeamPage } from "./pages/TeamPage";
import { loadSession } from "./api";

function HomeRedirect() {
  const session = loadSession();
  return <Navigate to={session ? `/dashboard/${session.tenantId}` : "/login"} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeRedirect />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/connect" element={<ConnectPage />} />
      <Route path="/dashboard/:tenantId" element={<AppShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="leads/:leadId" element={<LeadDetailPage />} />
        <Route path="inbox" element={<InboxPage />} />
        <Route path="leads" element={<LeadsPage />} />
        <Route path="automation" element={<AutomationPage />} />
        <Route path="content" element={<ContentPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="team" element={<TeamPage />} />
        <Route path="integrations" element={<IntegrationsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
