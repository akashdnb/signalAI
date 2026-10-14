import { useState, type ReactNode } from "react";
import { useModalDialog } from "./PrecisionOperationsPreviewPage";
import { AutomationIcon, InstagramMarkIcon, SearchIcon, PlusIcon, ChevronDownIcon, CheckCircleIcon, InboxIcon, DotsVerticalIcon, SendIcon, SunIcon, MoonIcon } from "../components/icons";
import { Logo } from "../components/Logo";

export type FullPreviewScreen = "overview" | "automations" | "builder" | "inbox" | "leads" | "lead-detail" | "knowledge" | "content" | "analytics" | "integrations" | "team" | "billing" | "settings" | "login" | "connect-error" | "invite";
export type PreviewPalette = "navy-cobalt" | "teal-emerald" | "slate-cyan" | "forest-slate" | "orange-amber" | "neutral-slate" | "ocean-blue" | "rose-graphite" | "amber-minimal" | "ocean-sky" | "jade-mint" | "rose-slate" | "amber-graphite";
type Go = (screen: FullPreviewScreen) => void;
function Tag({ children, tone = "neutral" }: { children: ReactNode; tone?: string }) { return <span className={"po-tag po-tag--" + tone}>{children}</span>; }
function Panel({ children, className = "" }: { children: ReactNode; className?: string }) { return <section className={"po-content-panel " + className}>{children}</section>; }
function PanelTitle({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <header className="po-panel-title"><div>{eyebrow && <span className="po-eyebrow">{eyebrow}</span>}<h2>{title}</h2>{description && <p>{description}</p>}</div>{action}</header>;
}
function Metric({ label, value, note }: { label: string; value: string; note: string }) { return <div className="po-metric"><span>{label}</span><strong>{value}</strong><small>{note}</small></div>; }
const sampleConversations = [
  { handle:"@sample_fitness", preview:"Do you have pricing for 1:1 coaching?", time:"2m", status:"AI handling", tone:"purple", initial:"SF" },
  { handle:"@studio_owner", preview:"Can you share the class schedule?", time:"12m", status:"Needs review", tone:"amber", initial:"SO" },
  { handle:"@maya_runs", preview:"Is this available for beginners?", time:"27m", status:"AI handling", tone:"purple", initial:"MR" },
];

/* ...UNCHANGED_CODE_BELOW_SETTINGS_COMPONENT... */
