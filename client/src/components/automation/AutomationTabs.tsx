import { useRef } from "react";

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
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % TABS.length;
    if (event.key === "ArrowLeft") nextIndex = (index - 1 + TABS.length) % TABS.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = TABS.length - 1;

    if (nextIndex !== null) {
      event.preventDefault();
      tabRefs.current[nextIndex]?.focus();
    }
  }

  return (
    <div
      role="tablist"
      aria-label="Automation sections"
      className="mt-3 flex gap-5 overflow-x-auto border-b border-line md:gap-7"
    >
      {TABS.map((tab, index) => {
        const selected = active === tab.key;

        return (
          <button
            key={tab.key}
            ref={(element) => { tabRefs.current[index] = element; }}
            id={`automation-tab-${tab.key}`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls="automation-tabpanel"
            tabIndex={selected ? 0 : -1}
            onKeyDown={(event) => handleKeyDown(event, index)}
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
    </div>
  );
}
