create table if not exists cameras (
  token text primary key check (char_length(token) = 36),
  created_at timestamptz not null default now()
);

create index if not exists cameras_created_idx on cameras (created_at desc);
