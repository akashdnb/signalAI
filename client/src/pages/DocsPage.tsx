import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import "../styles/docs.css";

type DocMetadata = {
  title: string;
  slug: string;
  group: string;
  description: string;
  order: number;
  related: string[];
  source: string;
  body: string;
};
type DocSection = { title: string; id: string; body: string };
type Doc = DocMetadata & { sections: DocSection[] };

const markdownModules = import.meta.glob("../content/docs/articles/*.md", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

function readFrontmatter(source: string): { metadata: Record<string, string>; body: string } {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { metadata: {}, body: source.trim() };

  const metadata: Record<string, string> = {};
  for (const line of match[1]!.split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    metadata[key] = value;
  }
  return { metadata, body: match[2]!.trim() };
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function parseSections(body: string, docSlug: string): DocSection[] {
  const headingPattern = /^##\s+(.+)$/gm;
  const matches = Array.from(body.matchAll(headingPattern));
  if (matches.length === 0) return [{ title: "Overview", id: docSlug + "-overview", body }];

  const sections: DocSection[] = [];
  const preamble = body.slice(0, matches[0]!.index).trim();
  if (preamble) sections.push({ title: "Overview", id: docSlug + "-overview", body: preamble });

  matches.forEach((match, index) => {
    const title = match[1]!.trim();
    const start = match.index! + match[0].length;
    const end = index + 1 < matches.length ? matches[index + 1]!.index! : body.length;
    sections.push({
      title,
      id: docSlug + "-" + slugify(title) + "-" + (index + 1),
      body: body.slice(start, end).trim(),
    });
  });
  return sections;
}

function parseDoc(path: string, source: string): Doc {
  const frontmatter = readFrontmatter(source);
  const metadata = frontmatter.metadata;
  const fallbackSlug = path.split("/").pop()?.replace(/\.md$/, "") ?? "introduction";
  const slug = metadata.slug || fallbackSlug;
  return {
    title: metadata.title || slug,
    slug,
    group: metadata.group || "Documentation",
    description: metadata.description || "",
    order: Number(metadata.order) || 999,
    related: (metadata.related || "").split(",").map((value) => value.trim()).filter(Boolean),
    source,
    body: frontmatter.body,
    sections: parseSections(frontmatter.body, slug),
  };
}

const docs: Doc[] = Object.entries(markdownModules)
  .map(([path, source]) => parseDoc(path, source))
  .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
const docsBySlug = new Map<string, Doc>(docs.map((doc) => [doc.slug, doc]));

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const pattern = /(\*\*[^*]+\*\*|\u0060[^\u0060]+\u0060|\[[^\]]+\]\([^)]+\))/g;
  const parts = text.split(pattern).filter((part) => part.length > 0);
  return parts.map((part, index) => {
    const key = keyPrefix + "-" + index;
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={key}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("\u0060") && part.endsWith("\u0060")) {
      return <code key={key}>{part.slice(1, -1)}</code>;
    }
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      const label = link[1]!;
      const href = link[2]!;
      if (href.startsWith("/docs/")) return <Link key={key} to={href}>{label}</Link>;
      return <a key={key} href={href} target="_blank" rel="noreferrer">{label}</a>;
    }
    return part;
  });
}

function isBlockStart(line: string): boolean {
  return /^#{1,3}\s|^>\s?|^[-*]\s+|^\d+[.)]\s+/.test(line);
}

function MarkdownContent({ source, idPrefix }: { source: string; idPrefix: string }) {
  const lines = source.split(/\r?\n/);
  const nodes: ReactNode[] = [];
  let index = 0;
  let sequence = 0;

  while (index < lines.length) {
    const line = lines[index]!.trim();
    if (!line) { index += 1; continue; }

    const key = idPrefix + "-" + sequence++;
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const children = renderInline(heading[2]!, key);
      if (heading[1]!.length === 1) nodes.push(<h2 key={key}>{children}</h2>);
      else if (heading[1]!.length === 2) nodes.push(<h3 key={key} className="docs-inline-heading">{children}</h3>);
      else nodes.push(<h4 key={key} className="docs-inline-subheading">{children}</h4>);
      index += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index]!.trim())) {
        quote.push(lines[index]!.trim().replace(/^>\s?/, ""));
        index += 1;
      }
      nodes.push(<blockquote key={key} className="docs-md-callout">{quote.map((part, quoteIndex) => <p key={quoteIndex}>{renderInline(part, key + "-q" + quoteIndex)}</p>)}</blockquote>);
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index]!.trim())) {
        items.push(lines[index]!.trim().replace(/^[-*]\s+/, ""));
        index += 1;
      }
      nodes.push(<ul key={key} className="docs-bullets">{items.map((item, itemIndex) => <li key={itemIndex}>{renderInline(item, key + "-li" + itemIndex)}</li>)}</ul>);
      continue;
    }

    if (/^\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\d+[.)]\s+/.test(lines[index]!.trim())) {
        items.push(lines[index]!.trim().replace(/^\d+[.)]\s+/, ""));
        index += 1;
      }
      nodes.push(<ol key={key} className="docs-steps">{items.map((item, itemIndex) => <li key={itemIndex}><span>{itemIndex + 1}</span>{renderInline(item, key + "-li" + itemIndex)}</li>)}</ol>);
      continue;
    }

    const paragraph: string[] = [line];
    index += 1;
    while (index < lines.length) {
      const next = lines[index]!.trim();
      if (!next || isBlockStart(next)) break;
      paragraph.push(next);
      index += 1;
    }
    nodes.push(<p key={key}>{renderInline(paragraph.join(" "), key)}</p>);
  }

  return <>{nodes}</>;
}

export function DocsPage() {
  const { "*": splat } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const current = docsBySlug.get(splat || "introduction") ?? docs[0]!;
  const [query, setQuery] = useState("");
  const [mobileNav, setMobileNav] = useState(false);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [location.pathname]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        document.getElementById("docs-search")?.focus();
      }
      if (event.key === "Escape") setQuery("");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return [];
    return docs.filter((doc) =>
      doc.source.toLowerCase().includes(normalized) ||
      (doc.title + " " + doc.description + " " + doc.group).toLowerCase().includes(normalized)
    ).slice(0, 8);
  }, [query]);

  const currentIndex = docs.findIndex((doc) => doc.slug === current.slug);
  const previous = currentIndex > 0 ? docs[currentIndex - 1] : undefined;
  const next = currentIndex < docs.length - 1 ? docs[currentIndex + 1] : undefined;
  const relatedDocs = current.related.map((slug) => docsBySlug.get(slug)).filter((doc): doc is Doc => Boolean(doc));

  function openDoc(slug: string) {
    setQuery("");
    setMobileNav(false);
    navigate("/docs/" + slug);
  }

  return (
    <div className="docs-shell">
      <header className="docs-topbar">
        <Link to="/docs/introduction" className="docs-brand" aria-label="SignalAI Docs home">
          <span className="docs-logo">S</span>
          <span>SignalAI <b>/ Docs</b></span>
        </Link>
        <div className="docs-search-wrap">
          <span className="docs-search-icon" aria-hidden="true">⌕</span>
          <input id="docs-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search documentation..." aria-label="Search documentation" aria-expanded={Boolean(query)} aria-controls="docs-search-results" autoComplete="off" />
          <kbd>⌘ K</kbd>
          {query && <div className="docs-search-results" id="docs-search-results" role="listbox">
            {results.length ? results.map((doc) => <button key={doc.slug} role="option" aria-selected="false" onClick={() => openDoc(doc.slug)}>
              <span>{doc.group}</span><strong>{doc.title}</strong><small>{doc.description}</small>
            </button>) : <div className="docs-no-results">No matching docs</div>}
          </div>}
        </div>
        <div className="docs-actions">
          <Link to="/" className="docs-app-link">Open app <span>↗</span></Link>
          <button className="docs-mobile-button" onClick={() => setMobileNav((value) => !value)} aria-label="Toggle documentation navigation" aria-expanded={mobileNav}>☰</button>
        </div>
      </header>

      <div className={"docs-layout " + (mobileNav ? "docs-mobile-open" : "")}>
        <aside className="docs-sidebar" aria-label="Documentation navigation">
          <div className="docs-sidebar-inner">
            {Array.from(new Set(docs.map((doc) => doc.group))).map((group) => <div className="docs-nav-group" key={group}>
              <div className="docs-nav-label">{group}</div>
              {docs.filter((doc) => doc.group === group).map((doc) => <button key={doc.slug} className={"docs-nav-item " + (doc.slug === current.slug ? "active" : "")} aria-current={doc.slug === current.slug ? "page" : undefined} onClick={() => openDoc(doc.slug)}>{doc.title}</button>)}
            </div>)}
            <div className="docs-sidebar-footer">SignalAI beta documentation<br /><span>Guidance for teams automating Instagram conversations.</span></div>
          </div>
        </aside>

        <main className="docs-main">
          <article className="docs-article">
            <div className="docs-kicker">{current.group}</div>
            <h1>{current.title}</h1>
            <p className="docs-lede">{current.description}</p>
            {current.sections.map((section) => <section className="docs-section" key={section.id} id={section.id}>
              <h2>{section.title}</h2>
              <MarkdownContent source={section.body} idPrefix={section.id} />
            </section>)}

            {relatedDocs.length > 0 && <section id="related-documentation" className="docs-related">
              <h2>Related documentation</h2>
              <div className="docs-related-grid">{relatedDocs.map((doc) => <button key={doc.slug} onClick={() => openDoc(doc.slug)}>
                <span>{doc.group}</span><strong>{doc.title}</strong><small>{doc.description}</small><b aria-hidden="true">Read guide →</b>
              </button>)}</div>
            </section>}

            <div className="docs-callout"><strong>Need help?</strong><span>Use Troubleshooting to isolate the stage where a conversation stopped. Redact private prospect information before sharing logs or screenshots.</span></div>
            <nav className="docs-pagination" aria-label="Documentation pagination">
              {previous ? <button onClick={() => openDoc(previous.slug)}><small>Previous</small><strong>← {previous.title}</strong></button> : <span />}
              {next ? <button className="next" onClick={() => openDoc(next.slug)}><small>Next</small><strong>{next.title} →</strong></button> : <span />}
            </nav>
          </article>
        </main>

        <aside className="docs-toc" aria-label="On this page">
          <div className="docs-toc-title">On this page</div>
          {current.sections.map((section) => <a href={"#" + section.id} key={section.id}>{section.title}</a>)}
          {relatedDocs.length > 0 && <a href="#related-documentation">Related documentation</a>}
        </aside>
      </div>
    </div>
  );
}
