import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from "react";
import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import "./styles/app-shell-phase2.css";
import "./styles/core-screens-phase4.css";
import "./styles/product-polish-phase5.css";
import "./styles/settings-appearance-parity.css";
import "./styles/settings-notifications-parity.css";
import "./styles/settings-profile-parity.css";
import "./styles/settings-billing-parity.css";
import "./styles/settings-guardrails-parity.css";
import "./styles/settings-team-parity.css";
import "./styles/settings-general-parity.css";
import "./styles/lead-detail-parity.css";
import "./styles/workspace-settings-preview.css";
import "./styles/automation-dark-parity.css";
import "./styles/journey-builder-leads-preview-parity.css";
import "./styles/inbox-preview-parity.css";
import "./styles/content-preview-parity.css";
import "./styles/integrations-preview-parity.css";
import "./styles/dashboard-overview-parity.css";
import "./styles/leads-preview-parity.css";
import { loadSession } from "./api";

const WorkspaceSettingsPreviewPage = lazy(() =>
  import("./pages/WorkspaceSettingsPreviewPage").then((module) => ({ default: module.WorkspaceSettingsPreviewPage })),
);