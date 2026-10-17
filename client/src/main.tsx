import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import "./styles/precision-operations-production.css";
import "./styles/precision-operations-workflows.css";
import "./styles/production-parity-shell-overview-leads-automation.css";
import "./styles/team-access-parity.css";
import "./precision-operations-audit-fixes.css";
import "@xyflow/react/dist/style.css";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
