-- Core users table for my_kaneki JWT authentication.
-- Emails are normalized (trimmed and lowercased) before insertion.

create sequence if not exists user_id_seq;

create table if not exists users (
  id text primary key default ('U-' || nextval('user_id_seq')) check (id ~ '^U-[0-9]+$'),
  name text not null default '',
  email text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now()
);

alter sequence user_id_seq owned by users.id;
