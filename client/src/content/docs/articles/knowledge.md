---
title: Knowledge Base
slug: knowledge
group: AI
description: Upload business documents that can ground AI replies in your own product information, FAQs, and pricing.
order: 8
related: ai-automation, preview-test-publish, troubleshooting
---

## What to upload

Open Knowledge Base from the dashboard. Upload PDF, plain-text (.txt), or Markdown (.md) documents containing facts the AI needs to answer questions.

Good source material includes:

- FAQs and product or service descriptions.
- Current pricing sheets and plan comparisons.
- Policies, service areas, eligibility rules, and common objections.
- Product catalogs or source material that is safe to share with a prospect.

## Upload and check processing

1. Open Knowledge Base.
2. Choose a PDF, TXT, or Markdown file.
3. Wait for the document to appear in the list.
4. Check its status: Processing, Ready, or Failed.
5. If a failure reason is shown, correct the source file and upload it again.

A document should be Ready before you rely on it in a live workflow. Re-uploading a file with the same name supersedes the prior version, so keep names meaningful and avoid using one filename for unrelated documents.

## Enable knowledge for a journey

1. Open the journey's Details tab or select its message node in Builder.
2. Enable Use knowledge base for context.
3. Save the change.
4. Preview questions whose answers are explicitly covered in the uploaded content.

Uploading a file alone does not mean every journey will use it. The journey's knowledge-base setting must be enabled.

## Keep answers reliable

- Use direct, factual language and clear headings in source documents.
- Remove conflicting or expired offers before uploading a new version.
- Separate factual source material from behavior instructions.
- Do not upload credentials, secrets, or information you would not want used in customer conversations.
- If a document is Failed or still Processing, resolve that status before diagnosing answer quality.

## Best practices

- Keep one source document focused on one topic when possible.
- Put an effective date or version near changing policies and pricing so outdated facts are easy to spot.
- Write FAQs as real questions followed by unambiguous answers.
- Remove duplicate or contradictory statements before uploading.
- Test with questions covered by the source and questions it does not answer; the AI should not guess beyond available information.
- Re-test affected journeys after changing a source document.

## Delete or replace a document

Use Delete on the document row to remove it from the knowledge-base list. To update a source, upload the revised document and check its status again. Test affected journeys to confirm that responses use the current facts.
