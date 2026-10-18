-- Todo items. owner_id is the user id, or '' when the app runs in local open mode (no login).

create table if not exists todos (
  id bigint generated always as identity primary key,
  owner_id text not null default '',
  title text not null,
  done boolean not null default false,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists todos_owner_idx on todos (owner_id, done, created_at desc);
