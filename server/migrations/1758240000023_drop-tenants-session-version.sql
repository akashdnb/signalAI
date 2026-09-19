-- Up Migration
-- Identity Refactor U8 cleanup: session_version moved to users (U1/U3) —
-- sessions identify a person, so revocation belongs there, not on the
-- tenant they happen to be looking at. Done as part of this same
-- implementation pass rather than left dangling until a later deploy:
-- there is no staged rollout here for it to protect, and an unused column
-- describing a superseded design is exactly what U8 warns against keeping
-- around ("will otherwise outlive the design it describes").
alter table tenants drop column session_version;

-- Down Migration
alter table tenants add column session_version integer not null default 1;
