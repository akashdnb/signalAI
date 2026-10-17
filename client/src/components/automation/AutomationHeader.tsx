import { FileTextIcon } from "../icons";

export function AutomationHeader() {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="m-0 text-[26px] font-bold leading-[1.12] tracking-[-0.025em] text-ink">Automation</h1>
        <p className="muted m-0 mt-1 max-w-2xl text-[14px] leading-5">
          Turn Instagram conversations into qualified leads without building a complicated flow.
        </p>
      </div>
      <a href="/docs/introduction" target="_blank" rel="noopener noreferrer" className="hidden shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-ink hover:bg-chip md:flex" aria-label="Open SignalAI documentation in a new tab">
        <FileTextIcon className="h-4 w-4" />
        Docs ↗
      </a>
      <a href="/docs/quick-start" target="_blank" rel="noopener noreferrer" aria-label="Open SignalAI quick start documentation in a new tab" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-line bg-card text-ink md:hidden">
        <FileTextIcon className="h-4.5 w-4.5" />
      </a>
    </div>
  );
}
