import { Navigate, Route, Routes } from "react-router-dom";
import { ConnectPage } from "./pages/ConnectPage";
import { ConnectedPage } from "./pages/ConnectedPage";
import { DashboardPage } from "./pages/DashboardPage";
import { loadSession } from "./api";

function HomeRedirect() {
  const session = loadSession();
  return <Navigate to={session ? `/dashboard/${session.tenantId}` : "/connect"} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeRedirect />} />
      <Route path="/connect" element={<ConnectPage />} />
      <Route path="/connected" element={<ConnectedPage />} />
      <Route path="/dashboard/:tenantId" element={<DashboardPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
