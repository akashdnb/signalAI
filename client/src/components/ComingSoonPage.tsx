interface ComingSoonPageProps {
  title: string;
}

/** Placeholder for nav destinations the sidebar already links to (matching the target IA) but that don't have a real page yet — later revamp phases replace these one at a time. */
export function ComingSoonPage({ title }: ComingSoonPageProps) {
  return (
    <div className="page">
      <h1>{title}</h1>
      <div className="card">
        <p className="muted">{title} is coming in a future update.</p>
      </div>
    </div>
  );
}
