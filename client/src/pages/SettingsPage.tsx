import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { FieldDefinitionsPanel } from "../components/FieldDefinitionsPanel";
import { GuardrailsConfigPanel } from "../components/GuardrailsConfigPanel";
import { ScoringRulesPanel } from "../components/ScoringRulesPanel";
import { TeamIcon, CreditCardIcon, IntegrationsIcon, SettingsIcon } from "../components/icons";
import { useTenant } from "../context/TenantContext";

type SettingsSection = "general" | "team" | "billing" | "connections" | "ai" | "personal";

const sections: Array<{ id: SettingsSection; label: string; group: "workspace" | "automation" | "personal"; description: string }> = [
  { id: "general", label: "General", group: "workspace", description: "Workspace identity and defaults" },
  { id: "team", label: "Team & access", group: "workspace", description: "Members, roles and permissions" },
  { id: "connections", label: "Connections", group: "workspace", description: "Channels and external accounts" },
  { id: "billing", label: "Plan & billing", group: "workspace", description: "Plan, usage and invoices" },
  { id: "ai", label: "AI & automation", group: "automation", description: "Fields, guardrails and scoring" },
  { id: "personal", label: "Personal", group: "personal", description: "Your preferences" },
];

export function SettingsPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { tenant } = useTenant();
  const [section, setSection] = useState<SettingsSection>("general");

  const active = useMemo(() => sections.find(item => item.id === section) ?? sections[0], [section]);
  if (!tenantId) return null;

  return (
    <div className="page page-wide">
      <div className="mb-7">
        <div className="text-xs font-semibold uppercase tracking-[0.12em] text-subtle">Settings</div>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-ink">{tenant?.name ?? "Workspace"}</h1>
        <p className="mt-2 max-w-2xl text-sm text-subtle">Manage this workspace and your personal preferences. The workspace selected in the header determines the scope of these settings.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[210px_minmax(0,1fr)] lg:items-start">
        <aside className="rounded-xl border border-line bg-card p-2 shadow-sm" aria-label="Settings sections">
          {(["workspace", "automation", "personal"] as const).map(group => (
            <div key={group} className="mb-4 last:mb-0">
              <div className="px-2.5 pb-1.5 pt-2 text-[10px] font-bold uppercase tracking-[0.12em] text-subtle">
                {group === "workspace" ? "Workspace" : group === "automation" ? "AI & automation" : "Personal"}
              </div>
              <nav className="space-y-0.5">
                {sections.filter(item => item.group === group).map(item => (
                  <button key={item.id} type="button" onClick={() => setSection(item.id)} aria-current={section === item.id ? "page" : undefined} className={`w-full rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${section === item.id ? "bg-chip font-semibold text-accent" : "text-ink hover:bg-chip"}`}>
                    <span className="block">{item.label}</span>
                    <span className="mt-0.5 block text-xs font-normal text-subtle">{item.description}</span>
                  </button>
                ))}
              </nav>
            </div>
          ))}
        </aside>

        <main className="min-w-0">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-ink">{active.label}</h2>
              <p className="mt-1 text-sm text-subtle">{active.description}</p>
            </div>
            <span className="rounded-full bg-chip px-2.5 py-1 text-xs font-medium text-subtle">{active.group === "workspace" ? "Workspace scoped" : active.group === "personal" ? "Personal" : "Workspace scoped"}</span>
          </div>

          {section === "general" && (
            <div className="space-y-5">
              <section className="rounded-xl border border-line bg-card p-5 shadow-sm">
                <div className="flex items-start gap-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-chip text-accent"><SettingsIcon className="h-5 w-5" /></span>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-ink">Workspace identity</h3>
                    <p className="mt-1 text-sm text-subtle">This is the business context used by automations, leads, knowledge, connected accounts and team access.</p>
                  </div>
                </div>
                <dl className="mt-5 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-lg border border-line bg-canvas p-4"><dt className="text-xs font-medium text-subtle">Workspace name</dt><dd className="mt-1 font-semibold text-ink">{tenant?.name ?? "—"}</dd></div>
                  <div className="rounded-lg border border-line bg-canvas p-4"><dt className="text-xs font-medium text-subtle">Workspace ID</dt><dd className="mt-1 break-all font-mono text-xs text-ink">{tenantId}</dd></div>
                </dl>
                <p className="mt-4 text-xs text-subtle">Workspace name editing can be enabled here once the workspace-management API is exposed. Until then, this page deliberately does not pretend a local edit is persisted.</p>
              </section>

              <div className="grid gap-4 md:grid-cols-3">
                <Link to={`/dashboard/${tenantId}/team`} className="rounded-xl border border-line bg-card p-4 no-underline shadow-sm transition hover:border-accent/40 hover:bg-chip"><TeamIcon className="h-5 w-5 text-accent" /><strong className="mt-3 block text-sm text-ink">Team & access</strong><span className="mt-1 block text-xs text-subtle">Manage members and roles.</span></Link>
                <Link to={`/dashboard/${tenantId}/integrations`} className="rounded-xl border border-line bg-card p-4 no-underline shadow-sm transition hover:border-accent/40 hover:bg-chip"><IntegrationsIcon className="h-5 w-5 text-accent" /><strong className="mt-3 block text-sm text-ink">Connections</strong><span className="mt-1 block text-xs text-subtle">Connect and manage Instagram and other channels.</span></Link>
                <Link to={`/dashboard/${tenantId}/billing`} className="rounded-xl border border-line bg-card p-4 no-underline shadow-sm transition hover:border-accent/40 hover:bg-chip"><CreditCardIcon className="h-5 w-5 text-accent" /><strong className="mt-3 block text-sm text-ink">Plan & billing</strong><span className="mt-1 block text-xs text-subtle">View usage, plan and billing details.</span></Link>
              </div>
            </div>
          )}

          {section === "team" && <TeamLinkPanel tenantId={tenantId} />}
          {section === "connections" && <ConnectionLinkPanel tenantId={tenantId} />}
          {section === "billing" && <BillingLinkPanel tenantId={tenantId} />}
          {section === "ai" && (
            <div className="space-y-5">
              <FieldDefinitionsPanel tenantId={tenantId} />
              <GuardrailsConfigPanel tenantId={tenantId} />
              <ScoringRulesPanel tenantId={tenantId} />
            </div>
          )}
          {section === "personal" && (
            <section className="rounded-xl border border-line bg-card p-5 shadow-sm">
              <h3 className="font-semibold text-ink">Personal preferences</h3>
              <p className="mt-1 text-sm text-subtle">Personal settings should follow you across workspaces rather than changing the workspace itself.</p>
              <div className="mt-5 rounded-lg border border-line bg-canvas p-4"><strong className="text-sm text-ink">Theme and notifications</strong><p className="mt-1 text-xs text-subtle">Use the account menu and notification controls for preferences that belong to you.</p></div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

function TeamLinkPanel({ tenantId }: { tenantId: string }) {
  return <section className="rounded-xl border border-line bg-card p-5 shadow-sm"><h3 className="font-semibold text-ink">Team & access</h3><p className="mt-1 text-sm text-subtle">Workspace members, roles and invitations live on the dedicated team page.</p><Link className="mt-5 inline-flex rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white no-underline hover:bg-accent-hover" to={`/dashboard/${tenantId}/team`}>Open team & access</Link></section>;
}
function ConnectionLinkPanel({ tenantId }: { tenantId: string }) {
  return <section className="rounded-xl border border-line bg-card p-5 shadow-sm"><h3 className="font-semibold text-ink">Connections</h3><p className="mt-1 text-sm text-subtle">Connected Instagram accounts and other channels remain in Integrations so there is one source of truth for OAuth, health and reconnect actions.</p><Link className="mt-5 inline-flex rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white no-underline hover:bg-accent-hover" to={`/dashboard/${tenantId}/integrations`}>Open integrations</Link></section>;
}
function BillingLinkPanel({ tenantId }: { tenantId: string }) {
  return <section className="rounded-xl border border-line bg-card p-5 shadow-sm"><h3 className="font-semibold text-ink">Plan & billing</h3><p className="mt-1 text-sm text-subtle">Billing is scoped to this workspace, while the full payment and usage workflow stays on the dedicated billing page.</p><Link className="mt-5 inline-flex rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white no-underline hover:bg-accent-hover" to={`/dashboard/${tenantId}/billing`}>Open plan & billing</Link></section>;
}
