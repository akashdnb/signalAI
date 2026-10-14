import { lazy, Suspense, useEffect, type ComponentType, type LazyExoticComponent } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import "./styles/app-shell-phase2.css";
import "./styles/core-screens-phase4.css";
import "./styles/product-polish-phase5.css";
import "./styles/precision-operations-preview.css";
import "./styles/precision-operations-design-system.css";
import "./styles/precision-operations-final-fixes.css";
import "./styles/precision-operations-color-tokens.css";
import "./styles/precision-operations-palette-switcher.css";
import "./styles/precision-settings-preview.css";
import "./styles/precision-settings-preview-brand.css";
import { loadSession } from "./api";

const PrecisionOperationsPreviewPage = lazy(() => import("./pages/PrecisionOperationsPreviewPage").then((module) => ({ default: module.PrecisionOperationsPreviewPage })));
const PrecisionSettingsPreviewPage = lazy(() => import("./pages/PrecisionSettingsPreviewPage").then((module) => ({ default: module.PrecisionSettingsPreviewPage })));
const AnalyticsPage = lazy(() => import("./pages/AnalyticsPage").then((module) => ({ default: module.AnalyticsPage })));
const AutomationPage = lazy(() => import("./pages/AutomationPage").then((module) => ({ default: module.AutomationPage })));
const JourneyBuilderPage = lazy(() => import("./pages/JourneyBuilderPage").then((module) => ({ default: module.JourneyBuilderPage })));
const BillingPage = lazy(() => import("./pages/BillingPage").then((module) => ({ default: module.BillingPage })));
const ConnectPage = lazy(() => import("./pages/ConnectPage").then((module) => ({ default: module.ConnectPage })));
const ContentPage = lazy(() => import("./pages/ContentPage").then((module) => ({ default: module.ContentPage })));
const DashboardPage = lazy(() => import("./pages/DashboardPage").then((module) => ({ default: module.DashboardPage })));
const DocsPage = lazy(() => import("./pages/DocsPage").then((module) => ({ default: module.DocsPage })));
const InboxPage = lazy(() => import("./pages/InboxPage").then((module) => ({ default: module.InboxPage })));
const IntegrationsPage = lazy(() => import("./pages/IntegrationsPage").then((module) => ({ default: module.IntegrationsPage })));
const KnowledgePage = lazy(() => import("./pages/KnowledgePage").then((module) => ({ default: module.KnowledgePage })));
const LeadDetailPage = lazy(() => import("./pages/LeadDetailPage").then((module) => ({ default: module.LeadDetailPage })));
const LeadsPage = lazy(() => import("./pages/LeadsPage").then((module) => ({ default: module.LeadsPage })));
const LoginPage = lazy(() => import("./pages/LoginPage").then((module) => ({ default: module.LoginPage })));
const SettingsPage = lazy(() => import("./pages/SettingsPage").then((module) => ({ default: module.SettingsPage })));
const TeamPage = lazy(() => import("./pages/TeamPage").then((module) => ({ default: module.TeamPage })));
const InvitationAcceptPage = lazy(() => import("./pages/InvitationAcceptPage").then((module) => ({ default: module.InvitationAcceptPage })));

const previewPalettes = new Set(["navy-cobalt", "teal-emerald", "slate-cyan", "forest-slate", "orange-amber", "neutral-slate", "ocean-blue", "rose-graphite", "amber-minimal", "ocean-sky", "jade-mint", "rose-slate", "amber-graphite"]);
const previewPaletteAliases: Record<string, string> = { "indigo-blue": "navy-cobalt", "green-slate": "forest-slate" };
function PreviewPaletteBridge() { useEffect(() => { const params = new URLSearchParams(window.location.search); const requested = params.get("palette") ?? "navy-cobalt"; const palette = previewPaletteAliases[requested] ?? requested; const isPreview = params.get("preview") === "precision-operations" || window.location.pathname === "/redesign-preview"; if (isPreview) document.body.dataset.poPalette = previewPalettes.has(palette) ? palette : "navy-cobalt"; else delete document.body.dataset.poPalette; return () => { delete document.body.dataset.poPalette; }; }, []); return null; }
function PageLoadingFallback() { return <div role="status" className="flex min-h-24 items-center justify-center px-4 py-8 text-sm text-subtle">Loading page…</div>; }
function LazyPage({ Page }: { Page: LazyExoticComponent<ComponentType> }) { return <Suspense fallback={<PageLoadingFallback />}><Page /></Suspense>; }
function PrecisionPreviewEntry() { const params = new URLSearchParams(window.location.search); return params.get("screen") === "settings" ? <LazyPage Page={PrecisionSettingsPreviewPage} /> : <LazyPage Page={PrecisionOperationsPreviewPage} />; }
function HomeRedirect() { const isPrecisionPreview = new URLSearchParams(window.location.search).get("preview") === "precision-operations"; if (isPrecisionPreview) return <PrecisionPreviewEntry />; const session = loadSession(); return <Navigate to={session ? `/dashboard/${session.tenantId}` : "/login"} replace />; }
export default function App() {
  return <><PreviewPaletteBridge /><Routes>
    <Route path="/redesign-preview" element={<PrecisionPreviewEntry />} />
    <Route path="/" element={<HomeRedirect />} />
    <Route path="/docs" element={<Navigate to="/docs/introduction" replace />} />
    <Route path="/docs/*" element={<LazyPage Page={DocsPage} />} />
    <Route path="/login" element={<LazyPage Page={LoginPage} />} />
    <Route path="/connect" element={<LazyPage Page={ConnectPage} />} />
    <Route path="/invite" element={<LazyPage Page={InvitationAcceptPage} />} />
    <Route path="/dashboard/:tenantId" element={<AppShell />}>
      <Route index element={<LazyPage Page={DashboardPage} />} />
      <Route path="settings" element={<LazyPage Page={SettingsPage} />} />
      <Route path="leads/:leadId" element={<LazyPage Page={LeadDetailPage} />} />
      <Route path="inbox" element={<LazyPage Page={InboxPage} />} />
      <Route path="leads" element={<LazyPage Page={LeadsPage} />} />
      <Route path="automation" element={<LazyPage Page={AutomationPage} />} />
      <Route path="automation/journeys/:campaignId" element={<LazyPage Page={JourneyBuilderPage} />} />
      <Route path="content" element={<LazyPage Page={ContentPage} />} />
      <Route path="knowledge" element={<LazyPage Page={KnowledgePage} />} />
      <Route path="analytics" element={<LazyPage Page={AnalyticsPage} />} />
      <Route path="team" element={<LazyPage Page={TeamPage} />} />
      <Route path="integrations" element={<LazyPage Page={IntegrationsPage} />} />
      <Route path="billing" element={<LazyPage Page={BillingPage} />} />
    </Route>
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes></>;
}
