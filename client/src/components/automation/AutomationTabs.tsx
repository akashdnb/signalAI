export type AutomationTab = "journeys" | "templates" | "keywords" | "quickReplies" | "handoffRules" | "settings";

const TABS: { key: AutomationTab; label: string }[] = [
  { key: "journeys", label: "Journeys" },
  { key: "templates", label: "Templates" },
  { key: "keywords", label: "Keywords" },
  { key: "quickReplies", label: "Quick Replies" },
  { key: "handoffRules", label: "Handoff Rules" },
  { key: "settings", label: "Settings" },
];

export function AutomationTabs({ active, onChange }: { active: AutomationTab; onChange: (tab: AutomationTab) => void }) {
  return (
    <div className="mt-6 flex gap-6 border-b border-line">
      {TABS.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onChange(tab.key)}
          className={`-mb-px border-b-2 px-0.5 pb-3 text-sm transition-colors ${
            active === tab.key
              ? "border-accent font-semibold text-accent"
              : "border-transparent text-subtle hover:text-ink"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
