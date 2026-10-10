# SignalAI documentation content

User-facing help articles are stored as Markdown files under this directory. The documentation portal imports files from the articles folder at build time; it does not make a network request or call a new content API to render them.

## Add a guide

1. Create a new Markdown file in articles/ with a lowercase kebab-case filename, for example comment-keywords.md.
2. Add the required frontmatter below.
3. Write article sections using level-two Markdown headings.
4. Add a dedicated Best practices section to feature guides.
5. Add the article's slug to related fields in relevant guides.
6. Check the sidebar order, search results, related links, and previous/next navigation in the portal.

## Required frontmatter

    ---
    title: Guide title
    slug: route-slug
    group: Navigation group
    description: One-sentence search and page summary.
    order: 20
    related: slug-one, slug-two
    ---

- **title:** user-facing article title.
- **slug:** unique URL at /docs/<slug>. Use lowercase kebab-case.
- **group:** visible sidebar group.
- **description:** short summary, ideally one sentence.
- **order:** numeric sort order for the sidebar and previous/next navigation.
- **related:** optional comma-separated slugs of related articles.

## Recommended article structure

Use level-two headings for the major sections. A useful guide usually includes:

- Overview and when to use the feature.
- Prerequisites and step-by-step configuration.
- A realistic example or recipe.
- Best practices and common mistakes.
- Troubleshooting and related reading.

Feature guides should use the exact heading **Best practices** so the guidance is discoverable and consistent. Prefer numbered lists for actions and unordered lists for options, checks, and recommendations. Use **bold** for interface labels or important terms, and ordinary paragraphs for context.

## Supported Markdown in the portal

The documentation renderer supports headings, paragraphs, bold text, inline code, links, unordered lists, numbered lists, and blockquotes. Keep content within this set so articles render predictably.

- Link to another article with a relative docs route, such as [Journey Builder](/docs/journey-builder).
- For external links, include the full https URL.
- Use blockquotes for a concise note or beta warning.
- Avoid raw HTML, embedded scripts, and custom Markdown extensions.

## Accuracy and safety

- Do not document a control as available if the UI shows it as coming soon or offers no configuration.
- Keep examples representative and avoid promising platform behavior that hasn't been verified.
- Never include access tokens, credentials, personal customer data, or live account identifiers.
- Keep instructions aligned with the product UI. Update the corresponding article in the same pull request that changes a feature.
- Re-test navigation and search when adding, renaming, or removing slugs.

No additional runtime dependency is needed to write documentation content.
