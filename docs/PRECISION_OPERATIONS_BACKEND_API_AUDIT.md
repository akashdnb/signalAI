# Precision Operations backend API audit

Roadmap item: **Complete Missing Backend APIs for Precision Operations**

This audit records the backend/API gaps verified while working on `feat/precision-operations-backend-apis`. It is intentionally limited to the existing Precision Operations experience.

## Implementation map

| Screen/action | Frontend API | Backend route/service | Persistence / integration | Authorization / outcome |
| --- | --- | --- | --- | --- |
| Knowledge source list | `getKnowledgeBaseDocumentsPage` | `GET /tenants/:tenantId/knowledge-base` in `paginationRouter` | `knowledge_base_documents` | Existing tenant session middleware; pagination preserved; response omits storage object key |
| Knowledge source detail | New `getKnowledgeBaseDocument` | `GET /tenants/:tenantId/knowledge-base/:documentId` | Existing knowledge-base DB helper | Tenant-scoped lookup; private object key omitted |
| Knowledge source preview | New `previewKnowledgeBaseDocument` | `GET /tenants/:tenantId/knowledge-base/:documentId/preview` | Existing indexed chunks | Only ready/non-superseded docs; 404 missing/foreign, 409 unavailable state; bounded to 100,000 characters |
| Knowledge retrieval check | New `retrieveKnowledgeBase` | `POST /tenants/:tenantId/knowledge-base/retrieval` | Existing embedding provider + tenant-filtered pgvector query | Validated query/limit; 503 when unconfigured; provider/database errors are errors, not empty success |
| Knowledge source download | Server route only | `GET /tenants/:tenantId/knowledge-base/:documentId/source` | Existing object storage | Tenant-scoped; source storage key is never caller-controlled; explicit 404/409/503/502 responses |
| Upload/delete source | Existing client APIs | Existing Knowledge Base routes | Existing ingestion + object storage | Existing behavior retained; chunk deletion now includes tenant condition and is transactional |
| Personal profile read/update | New `getProfile` / `updateProfile` | `GET/PATCH /me/profile` | Existing `users` row and `getUserById`/`updateUserProfile` | Session identifies the only user that can be changed; no user ID is accepted from request; input validation; no new model/table |
| Workspace settings | Existing tenant/workspace UI and APIs | Existing tenant/workspace routes | Existing tenant row and current config models | Existing membership and owner/admin restrictions retained |
| Instagram content metadata | Existing `listObservedMedia` | Existing `GET /tenants/:tenantId/observed-media` and enrichment paths | Existing media metadata + Instagram Graph integration | Real integration and tenant/account scoping already exist; no parallel content abstraction added |
| Notification preferences | UI currently labels notifications as coming soon | No preferences API found | No notification preference persistence/event workflow found | Deliberately not replaced with mock data or arbitrary preference categories |

## Changes in this branch

- Exposed source detail, indexed text preview, retrieval test, and authenticated source download using the existing Knowledge Base models, embedding provider, object storage, and vector retrieval.
- Added the current user’s profile GET/PATCH API and wired it to the existing Settings page.
- Fixed explicit profile-field clearing: an omitted field is preserved while an explicit `null` clears it.
- Fixed a tenant-isolation issue in Knowledge Base deletion: indexed chunks are now deleted only when both the document ID and tenant ID match, in the same transaction as the scoped document deletion.
- Removed internal storage object keys from the paginated Knowledge Base list response.
- Reused existing registered UI primitives. No duplicate component library or new DB model/table was introduced.

## Deliberate non-changes

- **Content listing/metadata:** already uses the Instagram integration and persisted observed-media metadata. The existing unavailable-thumbnail fallback is a legitimate disconnected/unavailable state, not fake data.
- **Workspace settings:** rename/description and existing tenant-wide configuration are already backed by persistence and authorization. No settings were added that the current product does not expose.
- **Notifications:** missing. The current app does not expose functional notification preferences or a backed notification event/delivery flow. Implementing this safely requires product decisions about the supported notification categories/channels, source of events, delivery provider, defaults, opt-out/consent semantics, and retention. Until those are defined, showing a saved-but-ineffective preference would be misleading.
- No MCP, billing, team/multi-account, automation-builder, or unrelated analytics behavior was changed.

## Tests added/updated

- Knowledge Base integration tests for preview, retrieval validation/unconfigured behavior, tenant-scoped retrieval, cross-tenant detail/preview/source access, failed/missing source states, storage-key omission, and cross-tenant delete not removing indexed chunks.
- Profile API tests for own-profile reads, persistence, explicit field clearing, validation, rejection of unsupported fields, and unauthenticated requests.

## Verification limitations

The available execution environment could not clone the GitHub repository (DNS lookup for `github.com` failed), so local unit/integration tests, TypeScript typecheck, lint, and build were **not run** in this session. GitHub Actions had no workflow runs available for the feature branch when checked. The PR must remain unmerged until these checks are run in a connected development/CI environment and any failures are addressed.
