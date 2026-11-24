-- Every camera id the server hands out is stored here first. The row is the
-- record that a new window was opened, and the recent rows are the mint limit.
create table if not exists camera_mints (
  token text primary key check (char_length(token) = 36),
  created_at timestamptz not null default now()
);

create index if not exists camera_mints_created_idx on camera_mints (created_at desc);
