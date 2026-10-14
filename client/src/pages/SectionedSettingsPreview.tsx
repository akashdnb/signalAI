import { useState } from "react";
import { SettingsScreen, type PreviewPalette } from "./PrecisionOperationsFullScreens";
import { BellIcon, CreditCardIcon, SettingsIcon, UserIcon, LifeBuoyIcon } from "../components/icons";

type Section =
  | "general"
  | "team"
  | "billing"
  | "lead-fields"
  | "ai-behavior"
  | "forbidden-topics"
  | "escalation"
  | "scoring"
  | "notifications"
  | "appearance"
  | "profile"
  | "support";

type Props = {
  theme: "light" | "dark";
  palette: PreviewPalette;
  onChangeTheme: (theme: "light" | "dark") => void;
  onChangePalette: (palette: PreviewPalette) => void;
};

const workspaceSections: Array<{ id: Section; label: string; description: string; role?: string }> = [
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

const personalSections: Array<{ id: Section; label: string; description: string }> = [
  { id: "appearance", label: "Appearance", description: "Theme and visual preferences" },
  { id: "profile", label: "Profile", description: "Your name and account details" },
  { id: "support", label: "Support", description: "Help and support resources" },
];

function readSection(): Section {
  const requested = new URLSearchParams(window.location.search).get("settingsSection") as Section | null;
  return [...workspaceSections, ...personalSections].some(item => item.id === requested) ? requested! : "general";
}

function selectSection(next: Section, setSection: (section: Section) => void) {
  setSection(next);
  const params = new URLSearchParams(window.location.search);
  params.set("preview", "precision-operations");
  params.set("screen", "settings");
  params.set("settingsSection", next);
  window.history.replaceState(null, "", window.location.pathname + "?" + params.toString());
}

function SectionedSettingsCard({ icon: Icon, title, description, children }: { icon: typeof SettingsIcon; title: string; description: string; children: React.ReactNode }) {
  return <section className="po-content-panel po-sectioned-settings-card"><header className="po-panel-title"><div><span className="po-eyebrow">WORKSPACE SETTINGS</span><h2>{title}</h2><p>{description}</p></div><span className="po-settings-scope">Workspace scoped</span></header>{children}</section>;
}

export function SectionedSettingsPreview({ theme, palette, onChangeTheme, onChangePalette }: Props) {
  const [section, setSection] = useState<Section>(readSection);
  const active = [...workspaceSections, ...personalSections].find(item => item.id === section)!;
  const workspaceRole = "Owner";

  const renderExisting = () => {
    const mapped: Record<string, string> = {
      team: "Team & access",
      billing: "Plan & billing",
      "lead-fields": "Lead fields",
      "ai-behavior": "AI behavior",
      "forbidden-topics": "Forbidden topics",
      escalation: "Escalation",
      scoring: "Scoring",
      appearance: "Appearance",
    };
    const existingSection = mapped[section];
    if (!existingSection) return null;
    const params = new URLSearchParams(window.location.search);
    params.set("settingsSection", existingSection);
    window.history.replaceState(null, "", window.location.pathname + "?" + params.toString());
    return <SettingsScreen key={existingSection} theme={theme} palette={palette} onChangeTheme={onChangeTheme} onChangePalette={onChangePalette} />;
  };

  return <div className="po-sectioned-settings">
    <div className="po-sectioned-settings-nav" aria-label="Settings sections">
      <div className="po-sectioned-settings-group">
        <span className="po-sectioned-settings-label">Workspace</span>
        {workspaceSections.map(item => <button key={item.id} type="button" className={section === item.id ? "is-active" : ""} aria-current={section === item.id ? "page" : undefined} onClick={() => selectSection(item.id, setSection)}><span><strong>{item.label}</strong><small>{item.description}</small></span>{item.role && <em>{item.role}</em>}</button>)}
      </div>
      <div className="po-sectioned-settings-group">
        <span className="po-sectioned-settings-label">Personal</span>
        {personalSections.map(item => <button key={item.id} type="button" className={section === item.id ? "is-active" : ""} aria-current={section === item.id ? "page" : undefined} onClick={() => selectSection(item.id, setSection)}><span><strong>{item.label}</strong><small>{item.description}</small></span></button>)}
      </div>
    </div>

    <div className="po-sectioned-settings-content">
      {section === "general" && <SectionedSettingsCard icon={SettingsIcon} title="General" description="Workspace identity and defaults."><div className="po-detail-grid"><div><span>Workspace name</span><strong>My workspace</strong></div><div><span>Workspace ID</span><strong>sample-workspace</strong></div><div><span>Workspace role</span><strong>{workspaceRole}</strong></div></div><p className="po-panel-copy">Workspace settings apply to everyone in this workspace. Access to administrative settings is controlled by role.</p></SectionedSettingsCard>}
      {section === "notifications" && <SectionedSettingsCard icon={BellIcon} title="Notifications" description="Workspace alerts and operational notices."><div className="po-settings-list"><div><strong>Automation alerts</strong><span>Notify workspace admins when an automation needs attention.</span></div><div><strong>Integration health</strong><span>Notify workspace admins when a connected account needs action.</span></div><div><strong>Lead handoff alerts</strong><span>Keep the team informed when a conversation is waiting for a person.</span></div></div></SectionedSettingsCard>}
      {section === "profile" && <SectionedSettingsCard icon={UserIcon} title="Profile" description="Your personal account details."><div className="po-detail-grid"><div><span>Name</span><strong>Alex Morgan</strong></div><div><span>Role</span><strong>Owner</strong></div><div><span>Email</span><strong>alex@creatorstudio.example</strong></div></div></SectionedSettingsCard>}
      {section === "support" && <SectionedSettingsCard icon={LifeBuoyIcon} title="Support" description="Help for your SignalAI account and workspace."><div className="po-settings-support-grid"><button type="button" className="po-button po-button--secondary">Open help center</button><button type="button" className="po-button po-button--secondary">Contact support</button></div></SectionedSettingsCard>}
      {section !== "general" && section !== "notifications" && section !== "profile" && section !== "support" && renderExisting()}
    </div>
  </div>;
}
