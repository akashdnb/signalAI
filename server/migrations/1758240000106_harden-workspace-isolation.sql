-- Up Migration
-- Keep only the newest active invitation for each normalized tenant/email
-- before adding the database-enforced uniqueness rule. Expired invitations
-- are also treated as inactive by revoking them during this cleanup.
with ranked as (
  select id,
         row_number() over (
           partition by tenant_id, lower(email)
           order by created_at desc, id desc
         ) as rn
    from tenant_invitations
   where accepted_at is null
     and revoked_at is null
)
update tenant_invitations ti
   set revoked_at = now(),
       updated_at = now()
 where ti.id in (select id from ranked where rn > 1);

update tenant_invitations
   set revoked_at = now(),
       updated_at = now()
 where accepted_at is null
   and revoked_at is null
   and expires_at <= now();

create unique index tenant_invitations_active_email_unique
  on tenant_invitations (tenant_id, lower(email))
  where accepted_at is null and revoked_at is null;

-- Down Migration

drop index tenant_invitations_active_email_unique;
