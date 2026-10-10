import { Link } from "react-router-dom";
import { FileTextIcon, SparkleIcon } from "../icons";

export function AutomationHeader() {
  return (
    <div className="automation-hero">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="automation-hero__eyebrow"><SparkleIcon className="h-3.5 w-3.5" /> AI automation for Instagram</div>
          <h1>Turn comments and DMs into conversations — automatically.</h1>
          <p>Create, customize and activate intelligent Instagram journeys that reply instantly, qualify leads and hand off the right conversations to your team.</p>
        </div>

        <Link
          to="/docs/introduction"
          className="hidden shrink-0 items-center gap-2 rounded-lg border border-line bg-card/80 px-3 py-2 text-sm font-medium text-ink no-underline hover:bg-card md:flex"
          aria-label="Open SignalAI documentation"
        >
          <FileTextIcon className="h-4 w-4" />
          Docs
        </Link>

        <Link
          to="/docs/quick-start"
          aria-label="Open SignalAI quick start documentation"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-line bg-card text-ink md:hidden"
        >
          <FileTextIcon className="h-4.5 w-4.5" />
        </Link>
      </div>
    </div>
  );
}
