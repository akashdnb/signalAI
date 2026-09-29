import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { ComingSoonPage } from "./components/ComingSoonPage";
import { ConnectPage } from "./pages/ConnectPage";
import { DashboardPage } from "./pages/DashboardPage";
import { InboxPage } from "./pages/InboxPage";
import { LeadDetailPage } from "./pages/LeadDetailPage";
import { LeadsPage } from "./pages/LeadsPage";
import { LoginPage } from "./pages/LoginPage";
import { SettingsPage } from "./pages/SettingsPage";
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
        <Route path="automation" element={<ComingSoonPage title="Automation" />} />
        <Route path="content" element={<ComingSoonPage title="Content" />} />
        <Route path="analytics" element={<ComingSoonPage title="Analytics" />} />
        <Route path="team" element={<ComingSoonPage title="Team" />} />
        <Route path="integrations" element={<ComingSoonPage title="Integrations" />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
