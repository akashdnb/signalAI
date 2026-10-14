-- Store profile information collected from a verified Google OIDC identity.
-- Email remains the canonical, normalized sign-in identifier.
alter table users
  add column first_name text,
  add column last_name text,
  add column profile_picture_url text,
  add column google_subject text;

create unique index users_google_subject_idx on users (google_subject) where google_subject is not null;

-- Down Migration
drop index if exists users_google_subject_idx;
alter table users drop column google_subject;
alter table users drop column profile_picture_url;
alter table users drop column last_name;
alter table users drop column first_name;
