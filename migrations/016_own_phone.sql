-- The same digits can belong to different profile names. A choice must not
-- reveal that another camera already holds them.
drop index if exists cameras_pin_hash_idx;
drop index if exists profiles_pin_hash_idx;

-- Each phone's own join requests. Older rows have no booth.
alter table join_requests add column if not exists booth text;
create index if not exists join_requests_booth_idx on join_requests (booth, created_at desc);

-- A rescue asks to put an existing profile on the phone that asked.
-- Santiago decides it. The PIN is not stored here.
create table if not exists recovery_requests (
  id text primary key,
  camera_token text not null check (char_length(camera_token) = 36),
  booth text not null,
  status text not null check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create index if not exists recovery_requests_booth_idx on recovery_requests (booth, created_at desc);
create index if not exists recovery_requests_status_idx on recovery_requests (status, created_at);
