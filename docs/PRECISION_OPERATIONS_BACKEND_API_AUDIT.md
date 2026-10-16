# Precision Operations backend API audit

Roadmap item: **Complete Missing Backend APIs for Precision Operations**

**Status:** Feature implementation is merged. This document records the current endpoint contracts, the profile registration regression found during post-merge stabilization, and the verification status of PR #73.

## Implementation map

| Screen/action | Frontend API | Backend route/service | Persistence / integration | Authorization / outcome |
| --- | --- | --- | --- | --- |
| Knowledge source list | `getKnowledgeBaseDocumentsPage` | `GET /tenants/:tenantId/knowledge-base` in `paginationRouter` | `knowledge_base_documents` | Tenant-scoped; pagination preserved; storage object key omitted |
| Knowledge source detail | `getKnowledgeBaseDocument` | `GET /tenants/:tenantId/knowledge-base/:documentId` | Existing knowledge-base DB helper | Tenant-scoped lookup; private object key omitted |
| Knowledge source preview | `previewKnowledgeBaseDocument` | `GET /tenants/:tenantId/knowledge-base/:documentId/preview` | Existing indexed chunks | Only ready/non-superseded documents; 404 missing/foreign, 409 unavailable state; bounded to 100,000 characters |
| Knowledge retrieval check | `retrieveKnowledgeBase` | `POST /tenants/:tenantId/knowledge-base/retrieval` | Existing embedding provider + tenant-filtered pgvector query | Validated query/limit; 503 when unconfigured; invalid provider output returns 502; provider/database errors are not reported as successful empty results |
| Knowledge source download | Server route | `GET /tenants/:tenantId/knowledge-base/:documentId/source` | Existing object storage | Tenant-scoped; storage key remains server-controlled; unavailable/failed storage has explicit error responses |
| Upload/delete source | Existing client APIs | Existing Knowledge Base routes | Existing ingestion + object storage | Existing behavior retained; chunk deletion includes tenant condition and is transactional with document deletion |
| Personal profile read/update | `api.getProfile` / `api.updateProfile` | `GET/PATCH /me/profile` in `profileRouter` | Existing `users` row and `getUserById` / `updateUserProfile` | Session identifies the only user that can be changed; no target user ID accepted; validation and explicit-null clearing supported |
| Workspace settings | Existing tenant/workspace UI and APIs | Existing tenant/workspace routes | Existing tenant row and current config models | Existing membership and owner/admin restrictions retained |
| Instagram content metadata | Existing `listObservedMedia` | Existing `GET /tenants/:tenantId/observed-media` and enrichment paths | Existing media metadata + Instagram Graph integration | Existing integration and tenant/account scoping remain the source of truth |
| Notification preferences | UI labels notifications as coming soon | No preferences API | No preference persistence or backed notification event/delivery workflow | Intentionally not implemented; do not create mock preferences |

## Post-merge audit findings

### Profile route mounting

The profile handlers in `server/src/routes/profile.ts` exist, and the Settings page calls `GET/PATCH /me/profile`. The audited `main` revision of `server/src/app.ts` did not import or mount `profileRouter`. Thus router implementation and route-level coverage alone did not guarantee the endpoint was reachable through the production `createApp()`.

**Fix in PR #73:** imports and mounts `profileRouter` in `createApp()`, with a dedicated application-wiring test covering authenticated GET/PATCH and rejection of an unauthenticated read. The code is committed on the stabilization branch but remains unmerged pending review and CI.

### API security and behavior

- Profile reads/updates derive the user identity from the authenticated bearer session. The request cannot choose another user ID.
- Profile updates accept only `firstName`, `lastName`, and `profilePictureUrl`; unsupported fields are rejected.
- Omitted fields retain stored values; explicit `null` clears supported profile values.
- Knowledge Base access continues to be tenant-scoped. Source storage keys are not part of public list/detail/preview responses, and clients cannot select an arbitrary object-storage key for download.
- Retrieval returns real results from the current embedding/vector path. Unconfigured retrieval and upstream failures remain visible errors, not fabricated matches or empty-success fallbacks.
- Content remains backed by the existing observed-media integration; no parallel content abstraction is introduced.

## Deliberate non-changes

- **Notifications:** preferences remain unimplemented. The app has no persisted preference model or backed preference/event workflow. Adding apparently saved settings without a defined set of categories/channels, source events, delivery provider, defaults, opt-out/consent semantics, and retention policy would be misleading.
- **Workspace settings:** existing backed rename/description and tenant-wide settings are reused rather than adding duplicate endpoints.
- No MCP, automation-builder lifecycle, billing, team/multi-account feature, or unrelated analytics changes are part of PR #73.

## Tests and verification

Existing Knowledge Base integration coverage targets preview/retrieval validation and provider configuration, tenant-scoped access, foreign-tenant detail/preview/source requests, private storage metadata, and deletion isolation.

Existing profile route tests cover authenticated own-profile reads/updates, validation, unsupported fields, persistence, explicit clearing, and unauthenticated access. PR #73 adds a distinct `createApp()`-level test to prevent profile routes being implemented but left unmounted.

The code and diff have been inspected through GitHub. Local tests, typecheck, lint, and build have **not** been run in this session because the execution environment cannot resolve GitHub for cloning. The repository's server and client CI workflows require manual `workflow_dispatch`; the available GitHub connector does not expose a dispatch action, and no CI run is currently associated with the PR head. Keep PR #73 unmerged until server and client workflows are manually dispatched and pass.
