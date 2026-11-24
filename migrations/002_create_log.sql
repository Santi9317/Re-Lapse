create table create_log (
  id text primary key,
  kind text not null check (kind in ('photo', 'album', 'event')),
  source_hash text not null default '',
  created_at timestamptz not null default now()
);

create index create_log_kind_time_idx on create_log (kind, created_at desc);
create index create_log_source_idx on create_log (kind, source_hash, created_at desc);
