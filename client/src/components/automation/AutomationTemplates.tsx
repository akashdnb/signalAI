import { BotIcon, HandshakeIcon, InstagramMarkIcon, SendIcon } from "../icons";
import { useState } from "react";
import { BottomSheet } from "../BottomSheet";
import type { CampaignLanguage, CampaignTone, ReplyChannel, TriggerSource } from "../../api";

export type AutomationTemplate = {
  id: string;
  name: string;
  description: string;
  trigger: string;
  keywords: string[];
  icon: typeof BotIcon;
  tone: "pink" | "blue" | "green" | "neutral";
  preset: {
    triggerSource: TriggerSource;
    replyChannel: ReplyChannel;
    replyMode: "rule_based" | "ai_generated";
    tone: CampaignTone;
    language: CampaignLanguage;
    defaultReplyTemplate: string;
    description: string;
    milestones?: Array<{ goalDescription: string; captureFields: string[] }>;
  };
};

const TEMPLATES: AutomationTemplate[] = [
  { id: "comment-to-dm", name: "Send a DM after a comment", description: "Automatically thank people who comment and continue the conversation in a private message.", trigger: "Someone comments", keywords: ["details", "info", "link"], icon: InstagramMarkIcon, tone: "pink", preset: { triggerSource: "comment", replyChannel: "dm", replyMode: "rule_based", tone: "friendly", language: "auto", defaultReplyTemplate: "Thanks for your comment! I’ll send you the details in DM.", description: "A simple starting point for turning comments into private conversations." } },
  { id: "lead-qualification", name: "Qualify new enquiries", description: "Let AI understand what someone needs and collect useful contact details before you follow up.", trigger: "Someone sends a DM", keywords: ["pricing", "demo", "interested"], icon: BotIcon, tone: "blue", preset: { triggerSource: "message", replyChannel: "dm", replyMode: "ai_generated", tone: "professional_and_friendly", language: "auto", defaultReplyTemplate: "Thanks for your interest! I’d love to learn a little more about what you’re looking for.", description: "A guided starting point for qualifying inbound enquiries and collecting lead details.", milestones: [{ goalDescription: "Understand what the person needs", captureFields: ["intent", "need"] }, { goalDescription: "Collect contact details", captureFields: ["email", "phone"] }] } },
  { id: "product-link", name: "Send a product link", description: "Reply to buying intent with a helpful DM and a clear next step to your product page.", trigger: "Someone shows buying intent", keywords: ["buy", "shop", "price"], icon: SendIcon, tone: "green", preset: { triggerSource: "comment", replyChannel: "dm", replyMode: "rule_based", tone: "friendly", language: "auto", defaultReplyTemplate: "Absolutely — I’ll send you the product details in DM.", description: "A starter setup for product-intent conversations. Add your product URL before publishing." } },
  { id: "human-handoff", name: "Hand off to a person", description: "Let AI understand the request first, then prepare the conversation for a human follow-up.", trigger: "Someone needs help", keywords: ["help", "support", "agent"], icon: HandshakeIcon, tone: "neutral", preset: { triggerSource: "message", replyChannel: "dm", replyMode: "ai_generated", tone: "professional", language: "auto", defaultReplyTemplate: "I’ll make sure your request gets the right attention. Let me first understand what you need.", description: "A starter setup for conversations that need human attention.", milestones: [{ goalDescription: "Understand the request before handoff", captureFields: ["intent", "need"] }] } },
];

const TONE_CLASS: Record<AutomationTemplate["tone"], string> = { pink: "bg-[#FCE7F3] text-[#DB2777]", blue: "bg-[#DBEAFE] text-[#2563EB]", green: "bg-[#DCFCE7] text-[#16A34A]", neutral: "bg-chip text-subtle" };

export function AutomationTemplates({ onUse }: { onUse: (template: AutomationTemplate) => void | Promise<void> }) {
  const [selectedTemplate, setSelectedTemplate] = useState<AutomationTemplate | null>(null);
  return (
    <section className="mt-5" aria-labelledby="automation-templates-title">
      <div className="mb-4 max-w-2xl">
        <h2 id="automation-templates-title" className="m-0 text-[20px] font-semibold tracking-[-0.01em] text-ink">What do you want to automate?</h2>
        <p className="muted m-0 mt-1.5 text-[13px] leading-5">Choose a starting point. SignalAI creates a draft and guides you through the important settings before anything goes live.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {TEMPLATES.map((template) => { const Icon = template.icon; return (
          <article key={template.id} className="group rounded-2xl border border-line bg-card p-4 transition-shadow hover:shadow-md">
            <div className="flex items-start justify-between gap-3"><span className={`flex h-9 w-9 items-center justify-center rounded-xl ${TONE_CLASS[template.tone]}`}><Icon className="h-4 w-4" /></span><span className="rounded-full bg-canvas px-2 py-1 text-[10px] font-semibold text-subtle">{template.trigger}</span></div>
            <h3 className="m-0 mt-4 text-[14px] font-semibold text-ink">{template.name}</h3>
            <p className="muted m-0 mt-1.5 min-h-[64px] text-[11px] leading-4">{template.description}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">{template.keywords.map((keyword) => <span key={keyword} className="rounded-md bg-chip px-2 py-1 text-[10px] font-medium text-subtle">{keyword}</span>)}</div>
            <button type="button" className="btn-secondary mt-4 min-h-9 w-full text-xs font-semibold group-hover:border-accent/40 group-hover:text-accent" onClick={() => setSelectedTemplate(template)}>Use this starting point</button>
          </article>
        ); })}
      </div>
      {selectedTemplate && <TemplateDetailsDialog template={selectedTemplate} onClose={() => setSelectedTemplate(null)} onCreate={() => onUse(selectedTemplate)} />}
    </section>
  );
}

function TemplateDetailsDialog({ template, onClose, onCreate }: { template: AutomationTemplate; onClose: () => void; onCreate: () => void | Promise<void> }) {
  const Icon = template.icon;
  const milestones = template.preset.milestones ?? [];
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function create() { if (creating) return; setCreating(true); setError(null); try { await onCreate(); onClose(); } catch (err) { setError(err instanceof Error ? err.message : "Failed to create draft"); } finally { setCreating(false); } }
  return (
    <BottomSheet title={`Start with ${template.name}`} onClose={onClose} closeDisabled={creating} maxWidth={560} zIndex={60}>
      <div className="flex items-start gap-3"><span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${TONE_CLASS[template.tone]}`}><Icon className="h-5 w-5" /></span><div className="min-w-0"><h3 className="m-0 text-base font-semibold text-ink">{template.name}</h3><p className="muted m-0 mt-1 text-sm leading-5">{template.description}</p></div></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-line bg-canvas/50 p-3"><p className="muted m-0 text-[11px] font-semibold uppercase tracking-wide">Starts when</p><p className="m-0 mt-1 text-sm font-medium text-ink">{template.trigger}</p></div>
        <div className="rounded-xl border border-line bg-canvas/50 p-3"><p className="muted m-0 text-[11px] font-semibold uppercase tracking-wide">Reply style</p><p className="m-0 mt-1 text-sm font-medium text-ink">{template.preset.replyMode === "ai_generated" ? "AI writes the reply" : "Use a fixed reply"}</p></div>
      </div>
      <div className="mt-5 rounded-xl border border-line p-3.5"><p className="m-0 text-xs font-semibold uppercase tracking-wide text-subtle">Example reply</p><p className="m-0 mt-2 whitespace-pre-wrap text-sm leading-5 text-ink">{template.preset.defaultReplyTemplate}</p></div>
      {milestones.length > 0 && <div className="mt-5"><p className="m-0 text-xs font-semibold uppercase tracking-wide text-subtle">What it can learn</p><ol className="mt-2 space-y-2 pl-5">{milestones.map((milestone) => <li key={milestone.goalDescription} className="pl-1 text-sm text-ink"><span className="font-medium">{milestone.goalDescription}</span>{milestone.captureFields.length > 0 && <p className="muted m-0 mt-0.5 text-xs">For example: {milestone.captureFields.join(", ")}</p>}</li>)}</ol></div>}
      <div className="mt-5 rounded-xl border border-accent/15 bg-accent/5 p-3.5"><p className="m-0 text-xs font-semibold text-ink">Nothing goes live yet</p><p className="muted m-0 mt-1 text-xs leading-5">We’ll create a draft. You can review, edit and test it before publishing.</p></div>
      {error && <div className="banner banner-error mt-4" role="alert">{error}</div>}
      <div className="mt-5 flex justify-end gap-2"><button type="button" className="btn-secondary" disabled={creating} onClick={onClose}>Cancel</button><button type="button" className="btn-primary" disabled={creating} onClick={() => void create()}>{creating ? "Creating…" : "Create draft"}</button></div>
    </BottomSheet>
  );
}
