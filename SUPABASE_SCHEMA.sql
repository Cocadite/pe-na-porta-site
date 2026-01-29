-- Rode no Supabase SQL Editor

create table if not exists form_tokens (
  token text primary key,
  user_id text not null,
  discord_tag text,
  used boolean not null default false,
  created_at bigint not null,
  used_at bigint
);

create table if not exists submissions (
  id bigserial primary key,
  token text not null,
  user_id text not null,
  discord_tag text,
  nick text not null,
  idade int not null,
  motivo text not null,
  link_bonde text not null,
  status text not null default 'PENDING', -- PENDING/APPROVED/REJECTED
  posted_to_discord boolean not null default false,
  created_at bigint not null,
  reviewed_by text,
  reviewed_via text,
  reviewed_at bigint
);

create index if not exists idx_submissions_status on submissions(status);
create index if not exists idx_submissions_posted on submissions(posted_to_discord);

create table if not exists dashboard_actions (
  id bigserial primary key,
  type text not null, -- approve
  user_id text not null,
  submission_id bigint not null,
  created_at bigint not null,
  done boolean not null default false
);

create index if not exists idx_actions_done on dashboard_actions(done);

create table if not exists audit_log (
  id bigserial primary key,
  actor text,
  action text not null,
  payload jsonb,
  created_at bigint not null
);
