import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { FieldDefinitionsPanel } from "../components/FieldDefinitionsPanel";
import { GuardrailsConfigPanel } from "../components/GuardrailsConfigPanel";
import { ScoringRulesPanel } from "../components/ScoringRulesPanel";
import { BellIcon, CreditCardIcon, SettingsIcon, TeamIcon, UserIcon, LifeBuoyIcon } from "../components/icons";
import { useTenant } from "../context/TenantContext";

type SettingsSection = "general" | "team" | "billing" | "lead-fields" | "ai-behavior" | "forbidden-topics" | "escalation" | "scoring" | "notifications" | "appearance" | "profile" | "support";

type Section = { id: SettingsSection; label: string; description: string; role?: "Owner" | "Owner / Admin" };

const workspaceSections: Section[] = [
  { id: "general", label: "General", description: "Workspace identity and defaults" },
  { id: "team", label: "Team & access", description: "Members, roles and permissions", role: "Owner / Admin" },
  { id: "billing", label: "Plan & billing", description: "Plan, usage and invoices", role: "Owner" },
  { id: "lead-fields", label: "Lead fields", description: "Fields captured on leads", role: "Owner / Admin" },
  { id: "ai-behavior", label: "AI behavior", description: "How the assistant operates", role: "Owner / Admin" },
  { id: "forbidden-topics", label: "Forbidden topics", description: "Topics the assistant must avoid", role: "Owner / Admin" },
  { id: "escalation", label: "Escalation", description: "When conversations need a person", role: "Owner / Admin" },
  { id: "scoring", label: "Scoring", description: "Lead scoring rules", role: "Owner / Admin" },
  { id: "notifications", label: "Notifications", description: "Workspace alerts and operational notices" },
];

const personalSections: Section[] = [
  { id: "appearance", label: "Appearance", description: "Theme and visual preferences" },
  { id: "profile", label: "Profile", description: "Your name and account details" },
  { id: "support", label: "Support", description: "Help and support resources" },
];

const allSections = [...workspaceSections, ...personalSections];

export function SettingsPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { tenant } = useTenant();
  const [section, setSection] = useState<SettingsSection>("general");
  const active = useMemo(() => allSections.find(item => item.id === section) ?? allSections[0], [section]);
  if (!tenantId) return null;

  return (
    <div className="page page-wide">
      <div className="mb-7">
        <div className="text-xs font-semibold uppercase tracking-[0.12em] text-subtle">Settings</div>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-ink">{tenant?.name ?? "Workspace"}</h1>
        <p className="mt-2 max-w-2xl text-sm text-subtle">Manage workspace behavior, access, automation controls, and your personal preferences.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)] lg:items-start">
        <aside className="rounded-xl border border-line bg-card p-2 shadow-sm" aria-label="Settings sections">
          <SettingsNavGroup label="Workspace" sections={workspaceSections} active={section} onSelect={setSection} />
          <SettingsNavGroup label="Personal" sections={personalSections} active={section} onSelect={setSection} />
        </aside>

        <main className="min-w-0">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-ink">{active.label}</h2>
              <p className="mt-1 text-sm text-subtle">{active.description}</p>
            </div>
            <span className="rounded-full bg-chip px-2.5 py-1 text-xs font-medium text-subtle">{workspaceSections.some(item => item.id === section) ? "Workspace scoped" : "Personal"}</span>
          </div>

          {section === "general" && <GeneralPanel tenantName={tenant?.name ?? "Workspace"} tenantId={tenantId} />}
          {section === "team" && <LinkPanel title="Team & access" description="Workspace members, roles and invitations live on the dedicated team page." to={`/dashboard/${tenantId}/team`} action="Open team & access" icon={<TeamIcon className="h-5 w-5 text-accent" />} />}
          {section === "billing" && <LinkPanel title="Plan & billing" description="Billing is scoped to this workspace; the full payment and usage workflow stays on the dedicated billing page." to={`/dashboard/${tenantId}/billing`} action="Open plan & billing" icon={<CreditCardIcon className="h-5 w-5 text-accent" />} />}
          {section === "lead-fields" && <FieldDefinitionsPanel tenantId={tenantId} />}
          {section === "ai-behavior" && <AiBehaviorPanel />}
          {section === "forbidden-topics" && <GuardrailsConfigPanel tenantId={tenantId} />}
          {section === "escalation" && <GuardrailsConfigPanel tenantId={tenantId} />}
          {section === "scoring" && <ScoringRulesPanel tenantId={tenantId} />}
          {section === "notifications" && <NotificationsPanel />}
          {section === "appearance" && <PersonalPanel icon={<SettingsIcon className="h-5 w-5 text-accent" />} title="Appearance" description="Choose how SignalAI looks for you. Appearance follows your account across workspaces." />}
          {section === "profile" && <PersonalPanel icon={<UserIcon className="h-5 w-5 text-accent" />} title="Profile" description="Your personal account details follow you across workspaces." />}
          {section === "support" && <SupportPanel />}
        </main>
      </div>
    </div>
  );
}

function SettingsNavGroup({ label, sections, active, onSelect }: { label: string; sections: Section[]; active: SettingsSection; onSelect: (section: SettingsSection) => void }) {
  return <div className="mb-4 last:mb-0"><div className="px-2.5 pb-1.5 pt-2 text-[10px] font-bold uppercase tracking-[0.12em] text-subtle">{label}</div><nav className="space-y-0.5">{sections.map(item => <button key={item.id} type="button" onClick={() => onSelect(item.id)} aria-current={active === item.id ? "page" : undefined} className={`w-full rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${active === item.id ? "bg-chip font-semibold text-accent" : "text-ink hover:bg-chip"}`}><span className="flex items-start justify-between gap-2"><span><span className="block">{item.label}</span><span className="mt-0.5 block text-xs font-normal text-subtle">{item.description}</span></span>{item.role && <span className="shrink-0 pt-0.5 text-[9px] font-semibold uppercase tracking-wide text-subtle">{item.role}</span>}</span></button>)}</nav></div>;
}

function GeneralPanel({ tenantName, tenantId }: { tenantName: string; tenantId: string }) {
  return <section className="rounded-xl border border-line bg-card p-5 shadow-sm"><div className="flex items-start gap-4"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-chip text-accent"><SettingsIcon className="h-5 w-5" /></span><div><h3 className="font-semibold text-ink">Workspace identity</h3><p className="mt-1 text-sm text-subtle">This is the business context used by automations, leads, knowledge, connected accounts, and team access.</p></div></div><dl className="mt-5 grid gap-4 sm:grid-cols-2"><div className="rounded-lg border border-line bg-canvas p-4"><dt className="text-xs font-medium text-subtle">Workspace name</dt><dd className="mt-1 font-semibold text-ink">{tenantName}</dd></div><div className="rounded-lg border border-line bg-canvas p-4"><dt className="text-xs font-medium text-subtle">Workspace ID</dt><dd className="mt-1 break-all font-mono text-xs text-ink">{tenantId}</dd></div></dl><p className="mt-4 text-xs text-subtle">Administrative workspace settings are role-based. The current backend does not expose workspace-name editing, so this view does not fake a persisted local edit.</p></section>;
}

function AiBehaviorPanel() {
  return <section className="rounded-xl border border-line bg-card p-5 shadow-sm"><h3 className="font-semibold text-ink">AI behavior</h3><p className="mt-1 text-sm text-subtle">How the assistant responds when context is incomplete or uncertain.</p><div className="mt-5 rounded-lg border border-line bg-canvas p-4"><strong className="text-sm text-ink">Safe response behavior</strong><p className="mt-1 text-xs leading-5 text-subtle">Never invent facts, prices, availability, or guarantees. If approved knowledge does not contain an answer, ask a follow-up or route to a teammate.</p></div></section>;
}

function NotificationsPanel() {
  return <section className="rounded-xl border border-line bg-card p-5 shadow-sm"><h3 className="font-semibold text-ink">Notifications</h3><p className="mt-1 text-sm text-subtle">Workspace-level alerts and operational notices.</p><div className="mt-5 divide-y divide-line rounded-lg border border-line"><NotificationRow title="Automation alerts" description="Notify workspace admins when an automation needs attention." /><NotificationRow title="Integration health" description="Notify workspace admins when a connected account needs action." /><NotificationRow title="Lead handoff alerts" description="Keep the team informed when a conversation is waiting for a person." /></div></section>;
}

function NotificationRow({ title, description }: { title: string; description: string }) {
  return <div className="flex items-center justify-between gap-4 p-4"><div><strong className="text-sm text-ink">{title}</strong><p className="mt-1 text-xs text-subtle">{description}</p></div><span className="rounded-full bg-chip px-2.5 py-1 text-[10px] font-semibold text-subtle">Workspace</span></div>;
}

function PersonalPanel({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return <section className="rounded-xl border border-line bg-card p-5 shadow-sm"><div className="flex items-start gap-4"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-chip text-accent">{icon}</span><div><h3 className="font-semibold text-ink">{title}</h3><p className="mt-1 text-sm text-subtle">{description}</p></div></div></section>;
}

function SupportPanel() {
  return <section className="rounded-xl border border-line bg-card p-5 shadow-sm"><div className="flex items-start gap-4"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-chip text-accent"><LifeBuoyIcon className="h-5 w-5" /></span><div><h3 className="font-semibold text-ink">Support</h3><p className="mt-1 text-sm text-subtle">Find product help or contact the SignalAI team.</p></div></div><div className="mt-5 flex flex-wrap gap-3"><button type="button" className="rounded-lg border border-line bg-card px-3 py-2 text-sm font-semibold text-ink">Open help center</button><button type="button" className="rounded-lg border border-line bg-card px-3 py-2 text-sm font-semibold text-ink">Contact support</button></div></section>;
}

function LinkPanel({ title, description, to, action, icon }: { title: string; description: string; to: string; action: string; icon: React.ReactNode }) {
  return <section className="rounded-xl border border-line bg-card p-5 shadow-sm"><div className="flex items-start gap-4"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-chip text-accent">{icon}</span><div><h3 className="font-semibold text-ink">{title}</h3><p className="mt-1 text-sm text-subtle">{description}</p></div></div><Link className="mt-5 inline-flex rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white no-underline hover:bg-accent-hover" to={to}>{action}</Link></section>;
}
