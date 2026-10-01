export type AutomationTab =
  | "journeys"
  | "templates"
  | "keywords"
  | "quickReplies"
  | "handoffRules"
  | "settings";

const TABS: { key: AutomationTab; label: string }[] = [
  { key: "journeys", label: "Journeys" },
  { key: "templates", label: "Templates" },
  { key: "keywords", label: "Keywords" },
  { key: "quickReplies", label: "Quick Replies" },
  { key: "handoffRules", label: "Handoff Rules" },
  { key: "settings", label: "Settings" },
];

export function AutomationTabs({
  active,
  onChange,
}: {
  active: AutomationTab;
  onChange: (tab: AutomationTab) => void;
}) {
  return (
    <nav
      aria-label="Automation sections"
      className="mt-3 flex gap-7 overflow-x-auto border-b border-line"
    >
      {TABS.map((tab) => {
        const selected = active === tab.key;

        return (
          <button
            key={tab.key}
            type="button"
            aria-current={selected ? "page" : undefined}
            onClick={() => onChange(tab.key)}
            className={`relative shrink-0 px-0 pb-2.5 pt-1 text-[15px] leading-5 transition-colors ${
              selected ? "font-semibold text-ink" : "text-subtle hover:text-ink"
            }`}
          >
            {tab.label}
            <span
              aria-hidden="true"
              className={`absolute bottom-[-1px] left-1/2 h-[3px] -translate-x-1/2 rounded-full transition-opacity ${
                selected ? "w-full bg-[#7C3AED] opacity-100" : "w-0 opacity-0"
              }`}
            />
          </button>
        );
      })}
    </nav>
  );
}
