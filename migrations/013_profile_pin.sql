-- The PIN is stored as a hash. The six digits are not written.
alter table profiles add column if not exists pin_hash text;

create unique index if not exists profiles_pin_hash_idx on profiles (pin_hash) where pin_hash is not null;

-- One row serializes PIN guesses. The PIN is not stored.
create table if not exists pin_guess_slot (
  id integer primary key,
  window_start timestamptz not null default now(),
  n integer not null default 0
);

insert into pin_guess_slot (id, window_start, n)
values (1, now(), 0)
on conflict (id) do nothing;

-- Wrong PIN tries for one browser. The PIN is not stored.
create table if not exists pin_client (
  id text primary key,
  window_start timestamptz not null default now(),
  n integer not null default 0
);

create index if not exists pin_client_window_idx on pin_client (window_start desc);
