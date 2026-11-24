-- A camera asks to come in by name. Accept or decline stays on this row.
create table if not exists join_requests (
  id text primary key,
  camera_token text not null unique check (char_length(camera_token) = 36),
  display_name text not null check (char_length(display_name) between 1 and 40),
  status text not null check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create index if not exists join_requests_status_idx on join_requests (status, created_at);
