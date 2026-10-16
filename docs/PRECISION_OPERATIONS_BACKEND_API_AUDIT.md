# Precision Operations backend API audit

Roadmap item: **Complete Missing Backend APIs for Precision Operations**

**Status:** Implemented on `main`; this document describes the post-merge implementation and the verification status of the stabilization pass. Endpoint behavior below was checked against the current route and application wiring.

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

The profile handler implementation exists in `server/src/routes/profile.ts`, and the client Settings page calls `GET/PATCH /me/profile`. During this stabilization audit, the current `server/src/app.ts` was inspected and **does not import or mount `profileRouter`**. This means router-level tests can pass while production requests through `createApp()` return 404. The route-registration regression is being corrected by mounting `profileRouter` in the actual application and adding a `createApp()`-level regression test.

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
- No MCP, automation-builder lifecycle, billing, team/multi-account feature, or unrelated analytics changes are part of this stabilization fix.

## Tests

Existing Knowledge Base integration coverage targets preview/retrieval validation and provider configuration, tenant-scoped access, foreign-tenant detail/preview/source requests, private storage metadata, and deletion isolation.

Existing profile route tests cover authenticated own-profile reads/updates, validation, unsupported fields, persistence, explicit clearing, and unauthenticated access. Because those tests exercise the router via `createApp()` only if the router is mounted, a dedicated application-wiring regression test has been added to protect both GET and PATCH registration through `createApp()`.

## Verification status

The stabilization branch adds a test that exercises the real application wiring. The local execution environment in this session cannot clone the repository because GitHub DNS/network access is unavailable; therefore this pass does not claim local test, typecheck, lint, or build results. The repository's server and client GitHub Actions workflows use `workflow_dispatch`; the available GitHub connector does not provide workflow dispatch. The PR must remain unmerged until these workflows are manually dispatched and pass.
