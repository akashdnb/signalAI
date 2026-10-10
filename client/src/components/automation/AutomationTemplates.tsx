import { BotIcon, HandshakeIcon, InstagramMarkIcon, SendIcon, CloseIcon } from "../icons";
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
  {
    id: "comment-to-dm",
    name: "Comment to DM",
    description: "Starts with a comment trigger and configures a DM reply workflow you can customize before publishing.",
    trigger: "Comment → DM",
    keywords: ["details", "info", "link"],
    icon: InstagramMarkIcon,
    tone: "pink",
    preset: {
      triggerSource: "comment",
      replyChannel: "dm",
      replyMode: "rule_based",
      tone: "friendly",
      language: "auto",
      defaultReplyTemplate: "Thanks for your comment! I’ll send you the details in DM.",
      description: "Starter preset for turning matching Instagram comments into DM conversations.",
    },
  },
  {
    id: "lead-qualification",
    name: "Lead Qualification",
    description: "Starts from a DM, enables AI replies, and adds qualification goals for intent and contact details.",
    trigger: "DM qualification",
    keywords: ["pricing", "demo", "interested"],
    icon: BotIcon,
    tone: "blue",
    preset: {
      triggerSource: "message",
      replyChannel: "dm",
      replyMode: "ai_generated",
      tone: "professional_and_friendly",
      language: "auto",
      defaultReplyTemplate: "Thanks for your interest! I’d love to learn a little more about what you’re looking for.",
      description: "Starter preset for qualifying inbound DM conversations and capturing lead details.",
      milestones: [
        { goalDescription: "Understand the lead's intent and need", captureFields: ["intent", "need"] },
        { goalDescription: "Capture contact details", captureFields: ["email", "phone"] },
      ],
    },
  },
  {
    id: "product-link",
    name: "Product Link",
    description: "Starts from matching comments and configures a DM-first product response with a clear next-action message.",
    trigger: "Comment → DM",
    keywords: ["buy", "shop", "price"],
    icon: SendIcon,
    tone: "green",
    preset: {
      triggerSource: "comment",
      replyChannel: "dm",
      replyMode: "rule_based",
      tone: "friendly",
      language: "auto",
      defaultReplyTemplate: "Absolutely — I’ll send you the product details in DM.",
      description: "Starter preset for product-intent comments. Add your product URL in the journey before publishing.",
    },
  },
  {
    id: "human-handoff",
    name: "Human Handoff",
    description: "Starts from DMs and prepares a qualification flow for conversations that should be reviewed by a person.",
    trigger: "DM qualification",
    keywords: ["help", "support", "agent"],
    icon: HandshakeIcon,
    tone: "neutral",
    preset: {
      triggerSource: "message",
      replyChannel: "dm",
      replyMode: "ai_generated",
      tone: "professional",
      language: "auto",
      defaultReplyTemplate: "I’ll make sure your request gets the right attention. Let me first understand what you need.",
      description: "Starter preset for preparing a DM qualification flow before adding your preferred handoff rule.",
      milestones: [
        { goalDescription: "Understand the request before handoff", captureFields: ["intent", "need"] },
      ],
    },
  },
];

const TONE_CLASS: Record<AutomationTemplate["tone"], string> = {
  pink: "bg-[#FCE7F3] text-[#DB2777]",
  blue: "bg-[#DBEAFE] text-[#2563EB]",
  green: "bg-[#DCFCE7] text-[#16A34A]",
  neutral: "bg-chip text-subtle",
};

export function AutomationTemplates({
  onUse,
}: {
  onUse: (template: AutomationTemplate) => void | Promise<void>;
}) {
  const [selectedTemplate, setSelectedTemplate] = useState<AutomationTemplate | null>(null);

  function confirmUse() {
    if (!selectedTemplate) return;
    void onUse(selectedTemplate);
  }

  return (
    <section className="mt-5" aria-labelledby="automation-templates-title">
      <div className="mb-3 flex items-end justify-between gap-4">
        <div>
          <h2 id="automation-templates-title" className="m-0 text-[18px] font-semibold tracking-[-0.01em] text-ink">
            Start from a preset
          </h2>
          <p className="muted m-0 mt-1 text-[12px]">
            Pre-configured journey starting points. Customize them in Builder before publishing.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {TEMPLATES.map((template) => {
          const Icon = template.icon;
          return (
            <article
              key={template.id}
              className="group rounded-2xl border border-line bg-card p-4 transition-shadow hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${TONE_CLASS[template.tone]}`}>
                  <Icon className="h-4 w-4" />
                </span>
                <span className="rounded-full bg-canvas px-2 py-1 text-[10px] font-semibold text-subtle">
                  {template.trigger}
                </span>
              </div>
              <h3 className="m-0 mt-4 text-[14px] font-semibold text-ink">{template.name}</h3>
              <p className="muted m-0 mt-1.5 min-h-[56px] text-[11px] leading-4">{template.description}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {template.keywords.map((keyword) => (
                  <span key={keyword} className="rounded-md bg-chip px-2 py-1 text-[10px] font-medium text-subtle">
                    {keyword}
                  </span>
                ))}
              </div>
              <button
                type="button"
                className="btn-secondary mt-4 min-h-9 w-full text-xs font-semibold group-hover:border-accent/40 group-hover:text-accent"
                onClick={() => setSelectedTemplate(template)}
              >
                Use preset
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
      {selectedTemplate && (
        <TemplateDetailsDialog
          template={selectedTemplate}
          onClose={() => setSelectedTemplate(null)}
          onCreate={confirmUse}
        />
      )}

}


function TemplateDetailsDialog({
  template,
  onClose,
  onCreate,
}: {
  template: AutomationTemplate;
  onClose: () => void;
  onCreate: () => void;
}) {
  const Icon = template.icon;
  const milestones = template.preset.milestones ?? [];
  const [creating, setCreating] = useState(false);

  async function create() {
    if (creating) return;
    setCreating(true);
    try {
      onCreate();
    } finally {
      // The owning page closes the dialog after the API succeeds. Keep the
      // local guard only for the current interaction; failed attempts can retry.
      setCreating(false);
    }
  }

  return (
    <BottomSheet
      title={`Use ${template.name}`}
      onClose={() => { if (!creating) onClose(); }}
      maxWidth={560}
    >
      <div className="flex items-start gap-3">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${TONE_CLASS[template.tone]}`}>
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h3 className="m-0 text-base font-semibold text-ink">{template.name}</h3>
          <p className="muted m-0 mt-1 text-sm leading-5">{template.description}</p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-line bg-canvas/50 p-3">
          <p className="muted m-0 text-[11px] font-semibold uppercase tracking-wide">Trigger</p>
          <p className="m-0 mt-1 text-sm font-medium text-ink">{template.trigger}</p>
        </div>
        <div className="rounded-xl border border-line bg-canvas/50 p-3">
          <p className="muted m-0 text-[11px] font-semibold uppercase tracking-wide">Reply mode</p>
          <p className="m-0 mt-1 text-sm font-medium text-ink">{template.preset.replyMode === "ai_generated" ? "AI-generated" : "Rule-based"}</p>
        </div>
        <div className="rounded-xl border border-line bg-canvas/50 p-3">
          <p className="muted m-0 text-[11px] font-semibold uppercase tracking-wide">Reply channel</p>
          <p className="m-0 mt-1 text-sm font-medium text-ink">{template.preset.replyChannel === "dm" ? "Direct message" : template.preset.replyChannel === "comment" ? "Comment" : "Comment and DM"}</p>
        </div>
        <div className="rounded-xl border border-line bg-canvas/50 p-3">
          <p className="muted m-0 text-[11px] font-semibold uppercase tracking-wide">Tone</p>
          <p className="m-0 mt-1 text-sm font-medium capitalize text-ink">{template.preset.tone.replaceAll("_", " ")}</p>
        </div>
      </div>

      <div className="mt-5">
        <p className="m-0 text-xs font-semibold uppercase tracking-wide text-subtle">Trigger keywords</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {template.keywords.map((keyword) => (
            <span key={keyword} className="rounded-md bg-chip px-2.5 py-1.5 text-xs font-medium text-ink">{keyword}</span>
          ))}
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-line p-3.5">
        <p className="m-0 text-xs font-semibold uppercase tracking-wide text-subtle">Default reply</p>
        <p className="m-0 mt-2 whitespace-pre-wrap text-sm leading-5 text-ink">{template.preset.defaultReplyTemplate}</p>
      </div>

      {milestones.length > 0 && (
        <div className="mt-5">
          <p className="m-0 text-xs font-semibold uppercase tracking-wide text-subtle">Qualification goals</p>
          <ol className="mt-2 space-y-2 pl-5">
            {milestones.map((milestone, index) => (
              <li key={milestone.goalDescription} className="pl-1 text-sm text-ink">
                <span className="font-medium">{milestone.goalDescription}</span>
                {milestone.captureFields.length > 0 && (
                  <p className="muted m-0 mt-0.5 text-xs">Capture: {milestone.captureFields.join(", ")}</p>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}

      <p className="muted mt-5 text-xs leading-5">
        This creates a disabled draft. Review the journey in Builder and publish it when it is ready.
      </p>

      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className="btn-secondary" disabled={creating} onClick={onClose}>Cancel</button>
        <button type="button" className="btn-primary" disabled={creating} onClick={() => void create()}>
          {creating ? "Creating…" : "Create draft"}
        </button>
      </div>
    </BottomSheet>
  );
}
