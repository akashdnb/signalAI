import { Navigate, Route, Routes } from "react-router-dom";
import { ConnectPage } from "./pages/ConnectPage";
import { DashboardPage } from "./pages/DashboardPage";
import { LeadDetailPage } from "./pages/LeadDetailPage";
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
      <Route path="/dashboard/:tenantId" element={<DashboardPage />} />
      <Route path="/dashboard/:tenantId/settings" element={<SettingsPage />} />
      <Route path="/dashboard/:tenantId/leads/:leadId" element={<LeadDetailPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
