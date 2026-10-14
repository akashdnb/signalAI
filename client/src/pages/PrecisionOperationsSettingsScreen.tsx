import { useState, type ReactNode } from "react";
import { BellIcon, CheckCircleIcon, DotsVerticalIcon, MoonIcon, PlusIcon, SunIcon } from "../components/icons";
import type { PreviewPalette } from "./PrecisionOperationsFullScreens";
import "../styles/precision-operations-settings.css";

type SettingsSection =
  | "General"
  | "Team & access"
  | "Plan & billing"
  | "Lead fields"
  | "AI behavior"
  | "Forbidden topics"
  | "Escalation"
  | "Scoring"
  | "Notifications"
  | "Appearance"
  | "Profile"
  | "Support";

const workspaceSections: SettingsSection[] = [
  "General",
  "Team & access",
  "Plan & billing",
  "Lead fields",
  "AI behavior",
  "Forbidden topics",
  "Escalation",
  "Scoring",
  "Notifications",
];

const personalSections: SettingsSection[] = ["Appearance", "Profile", "Support"];

type Member = { initials: string; name: string; email: string; role: "Owner" | "Admin" | "Member"; status: "Active" | "Invited" };

const initialMembers: Member[] = [
  { initials: "AM", name: "Alex Morgan", email: "alex@signalai.example", role: "Owner", status: "Active" },
  { initials: "ST", name: "Sam Taylor", email: "sam@signalai.example", role: "Admin", status: "Active" },
  { initials: "JR", name: "Jordan Reed", email: "jordan@signalai.example", role: "Member", status: "Active" },
];

const permissionRows = [
  ["Manage workspace settings", "✓", "✓", "—"],
  ["Invite and manage teammates", "✓", "✓", "—"],
  ["Manage billing and plan", "✓", "✓", "—"],
  ["Create and publish automations", "✓", "✓", "✓"],
  ["View leads and conversations", "✓", "✓", "✓"],
  ["Manage connected accounts", "✓", "✓", "—"],
];

function SectionNav({ selected, onSelect }: { selected: SettingsSection; onSelect: (section: SettingsSection) => void }) {
  const renderItem = (section: SettingsSection) => (
    <button
      key={section}
      type="button"
      className={"po-settings-nav-item" + (selected === section ? " is-active" : "")}
      aria-current={selected === section ? "page" : undefined}
      onClick={() => onSelect(section)}
    >
      {section}
    </button>
  );

  return (
    <aside className="po-settings-nav" aria-label="Settings sections">
      <div className="po-settings-nav-group">
        <span className="po-settings-nav-label">Workspace</span>
        {workspaceSections.map(renderItem)}
      </div>
      <div className="po-settings-nav-group">
        <span className="po-settings-nav-label">Personal</span>
        {personalSections.map(renderItem)}
      </div>
    </aside>
  );
}

function SettingsPanel({ eyebrow, title, description, children, action }: { eyebrow?: string; title: string; description?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="po-settings-panel">
      <header className="po-settings-panel-header">
        <div>
          {eyebrow && <span className="po-settings-eyebrow">{eyebrow}</span>}
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

function TeamAccess({ onInvite }: { onInvite: () => void }) {
  const [members, setMembers] = useState<Member[]>(initialMembers);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  function changeRole(index: number, role: Member["role"]) {
    setMembers(current => current.map((member, memberIndex) => memberIndex === index ? { ...member, role } : member));
    setMenuOpen(null);
    setNotice("Sample role updated. No production workspace was changed.");
  }

  return (
    <>
      <SettingsPanel
        eyebrow="WORKSPACE ACCESS"
        title="Team & access"
        description="Invite teammates and control what each role can manage in this workspace."
        action={<button type="button" className="po-button po-button--primary po-settings-invite" onClick={onInvite}><PlusIcon /> Invite teammate</button>}
      >
        {notice && <div className="po-settings-notice" role="status"><CheckCircleIcon />{notice}</div>}
        <div className="po-settings-members" aria-label="Workspace members">
          <div className="po-settings-member-head"><span>Member</span><span>Role</span><span>Status</span><span /></div>
          {members.map((member, index) => (
            <div className="po-settings-member-row" key={member.email}>
              <div className="po-settings-member-person"><span className="po-settings-avatar">{member.initials}</span><span><strong>{member.name}</strong><small>{member.email}</small></span></div>
              <span className="po-settings-role">{member.role}</span>
              <span className="po-settings-status"><span className="po-settings-status-dot" />{member.status}</span>
              <div className="po-settings-member-actions">
                {member.role === "Owner" ? <span className="po-settings-owner">Owner</span> : <div className="po-settings-menu-wrap">
                  <button type="button" className="po-settings-icon-button" aria-label={`Manage ${member.name}`} aria-expanded={menuOpen === member.email} onClick={() => setMenuOpen(menuOpen === member.email ? null : member.email)}><DotsVerticalIcon /></button>
                  {menuOpen === member.email && <div className="po-settings-menu">
                    <button type="button" onClick={() => changeRole(index, "Admin")}>Make admin</button>
                    <button type="button" onClick={() => changeRole(index, "Member")}>Make member</button>
                    <button type="button" className="is-danger" onClick={() => { setMembers(current => current.filter((_, i) => i !== index)); setMenuOpen(null); setNotice("Sample teammate removed. No production workspace was changed."); }}>Remove teammate</button>
                  </div>}
                </div>}
              </div>
            </div>
          ))}
          <div className="po-settings-member-row is-pending">
            <div className="po-settings-member-person"><span className="po-settings-avatar po-settings-avatar--pending">KW</span><span><strong>kira@signalai.example</strong><small>Invitation sent 2 hours ago</small></span></div>
            <span className="po-settings-role">Member</span>
            <span className="po-settings-status po-settings-status--pending">Pending</span>
            <button type="button" className="po-settings-text-button" onClick={() => setNotice("Sample invitation resent. No email was sent.")}>Resend</button>
          </div>
        </div>
      </SettingsPanel>

      <SettingsPanel eyebrow="ROLE PERMISSIONS" title="What each role can do" description="Owners and admins can manage workspace configuration. Members can work with day-to-day conversations and automations.">
        <div className="po-settings-permissions" role="table" aria-label="Role permissions">
          <div className="po-settings-permission-row is-head" role="row"><span role="columnheader">Permission</span><span role="columnheader">Owner</span><span role="columnheader">Admin</span><span role="columnheader">Member</span></div>
          {permissionRows.map(([permission, owner, admin, member]) => <div className="po-settings-permission-row" role="row" key={permission}><span role="cell">{permission}</span><span role="cell" className="po-settings-permission-value">{owner}</span><span role="cell" className="po-settings-permission-value">{admin}</span><span role="cell" className="po-settings-permission-value">{member}</span></div>)}
        </div>
      </SettingsPanel>
    </>
  );
}

function Appearance({ theme, palette, onChangeTheme, onChangePalette }: { theme: "light" | "dark"; palette: PreviewPalette; onChangeTheme: (theme: "light" | "dark") => void; onChangePalette: (palette: PreviewPalette) => void }) {
  const palettes: Array<{ value: PreviewPalette; label: string; description: string; swatches: string[] }> = [
    { value: "navy-cobalt", label: "Navy & Cobalt", description: "Clear, confident blue", swatches: ["#1e3a8a", "#2563eb", "#60a5fa", "#eaf2ff"] },
    { value: "teal-emerald", label: "Teal & Emerald", description: "Calm and approachable", swatches: ["#075e54", "#10b981", "#34d399", "#ecfdf5"] },
    { value: "slate-cyan", label: "Slate & Cyan", description: "Neutral with a crisp accent", swatches: ["#0f172a", "#0891b2", "#22d3ee", "#ecfeff"] },
    { value: "forest-slate", label: "Forest & Slate", description: "Grounded green", swatches: ["#14532d", "#16a34a", "#86efac", "#f0fdf4"] },
    { value: "orange-amber", label: "Orange & Amber", description: "Warm and energetic", swatches: ["#c2410c", "#f59e0b", "#fdba74", "#fff7ed"] },
    { value: "neutral-slate", label: "Neutral Slate", description: "Low-colour and understated", swatches: ["#334155", "#64748b", "#94a3b8", "#f1f5f9"] },
    { value: "ocean-blue", label: "Ocean & Sky", description: "Bright blue clarity", swatches: ["#075985", "#0ea5e9", "#38bdf8", "#f0f9ff"] },
    { value: "jade-mint", label: "Jade & Mint", description: "Fresh green with mint highlights", swatches: ["#047857", "#10b981", "#6ee7b7", "#ecfdf5"] },
  ];
  return <SettingsPanel eyebrow="WORKSPACE PREFERENCES" title="Appearance" description="Choose a theme and accent palette for this preview.">
    <div className="po-settings-field-group"><div className="po-settings-field-heading"><h3>Theme mode</h3><p>Switch between light and dark surfaces.</p></div><div className="po-settings-theme-grid">
      {(["light", "dark"] as const).map(mode => <button type="button" key={mode} className={"po-settings-theme-card" + (theme === mode ? " is-selected" : "")} onClick={() => onChangeTheme(mode)}><span className="po-settings-theme-preview">{mode === "light" ? <SunIcon /> : <MoonIcon />}</span><span><strong>{mode === "light" ? "Light" : "Dark"}</strong><small>{mode === "light" ? "Bright surfaces" : "Reduced luminance"}</small></span>{theme === mode && <CheckCircleIcon className="po-settings-selected-icon" />}</button>)}
    </div></div>
    <div className="po-settings-field-group"><div className="po-settings-field-heading"><h3>Accent palette</h3><p>Preview the palette across navigation, actions, selected items and the brand mark.</p></div><div className="po-settings-palette-grid">{palettes.map(item => <button type="button" key={item.value} className={"po-settings-palette-card" + (palette === item.value ? " is-selected" : "")} onClick={() => onChangePalette(item.value)}><span className="po-settings-swatches">{item.swatches.map(swatch => <i key={swatch} style={{ background: swatch }} />)}</span><span><strong>{item.label}</strong><small>{item.description}</small></span>{palette === item.value && <CheckCircleIcon className="po-settings-selected-icon" />}</button>)}</div></div>
  </SettingsPanel>;
}

function PlaceholderSettings({ section }: { section: SettingsSection }) {
  const copy: Record<string, [string, string]> = {
    General: ["Workspace settings", "Manage workspace identity, timezone, and default operating preferences."],
    "Plan & billing": ["Plan & billing", "Review your current plan, usage, limits, and billing details."],
    "Lead fields": ["Lead fields", "Define the information your automations capture on a lead."],
    "AI behavior": ["AI behavior", "Set default response style, knowledge grounding, and automation guardrails."],
    "Forbidden topics": ["Forbidden topics", "Define topics the AI should avoid and how those requests are handled."],
    Escalation: ["Escalation", "Choose when conversations should move from AI handling to a person."],
    Scoring: ["Scoring", "Configure the signals used to prioritize and qualify leads."],
    Notifications: ["Notifications", "Choose which workspace events should notify you and your team."],
    Profile: ["Profile", "Manage your personal name, email, and workspace profile details."],
    Support: ["Support", "Find help and contact the SignalAI team."],
  };
  const [title, description] = copy[section];
  return <SettingsPanel eyebrow={section === "Profile" || section === "Support" ? "PERSONAL" : "WORKSPACE"} title={title} description={description}><div className="po-settings-placeholder"><span className="po-settings-placeholder-icon"><BellIcon /></span><div><strong>{section} controls</strong><p>This preview section is intentionally focused on the settings information architecture. Controls can be connected after the visual design is accepted.</p></div></div></SettingsPanel>;
}

export function PrecisionOperationsSettingsScreen({ theme, palette, onChangeTheme, onChangePalette }: { theme: "light" | "dark"; palette: PreviewPalette; onChangeTheme: (theme: "light" | "dark") => void; onChangePalette: (palette: PreviewPalette) => void }) {
  const [selected, setSelected] = useState<SettingsSection>("Team & access");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("Member");
  const [inviteNotice, setInviteNotice] = useState("");

  function submitInvite() {
    setInviteOpen(false);
    setInviteNotice(inviteEmail ? `Sample invitation prepared for ${inviteEmail}. No email was sent.` : "Sample invitation prepared. No email was sent.");
    setInviteEmail("");
  }

  return <section className="po-settings-redesign">
    <div className="po-settings-layout">
      <SectionNav selected={selected} onSelect={setSelected} />
      <div className="po-settings-content">
        {inviteNotice && <div className="po-settings-notice" role="status"><CheckCircleIcon />{inviteNotice}<button type="button" onClick={() => setInviteNotice("")}>Dismiss</button></div>}
        {selected === "Team & access" ? <TeamAccess onInvite={() => setInviteOpen(true)} /> : selected === "Appearance" ? <Appearance theme={theme} palette={palette} onChangeTheme={onChangeTheme} onChangePalette={onChangePalette} /> : <PlaceholderSettings section={selected} />}
      </div>
    </div>

    {inviteOpen && <div className="po-settings-modal-backdrop" role="presentation" onMouseDown={event => { if (event.currentTarget === event.target) setInviteOpen(false); }}>
      <div className="po-settings-modal" role="dialog" aria-modal="true" aria-labelledby="po-settings-invite-title">
        <div className="po-settings-modal-header"><div><span className="po-settings-eyebrow">TEAM & ACCESS</span><h2 id="po-settings-invite-title">Invite teammate</h2><p>Invite someone to the sample workspace. This preview never sends email.</p></div><button type="button" className="po-settings-icon-button" aria-label="Close" onClick={() => setInviteOpen(false)}>×</button></div>
        <label>Email address<input autoFocus value={inviteEmail} onChange={event => setInviteEmail(event.target.value)} placeholder="name@company.com" type="email" /></label>
        <label>Role<select value={inviteRole} onChange={event => setInviteRole(event.target.value)}><option>Member</option><option>Admin</option></select></label>
        <div className="po-settings-modal-actions"><button type="button" className="po-button po-button--secondary" onClick={() => setInviteOpen(false)}>Cancel</button><button type="button" className="po-button po-button--primary" onClick={submitInvite}>Send invite</button></div>
      </div>
    </div>}
  </section>;
}
