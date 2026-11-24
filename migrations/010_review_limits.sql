-- Which browser booth opened a new camera id. Null on rows from before this.
alter table camera_mints add column if not exists booth text;

create index if not exists camera_mints_booth_idx on camera_mints (booth, created_at desc);

-- Failed gate-key guesses. The guessed key is not stored.
create table if not exists gate_guess (
  id text primary key,
  created_at timestamptz not null default now()
);

create index if not exists gate_guess_created_idx on gate_guess (created_at desc);
