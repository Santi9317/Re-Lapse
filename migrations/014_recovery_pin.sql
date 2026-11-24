-- The recovery PIN is the six digits they chose. The hash is what the gate compares.
alter table cameras add column if not exists pin_code text;
alter table cameras add column if not exists pin_hash text;

create unique index if not exists cameras_pin_code_idx on cameras (pin_code) where pin_code is not null;
create unique index if not exists cameras_pin_hash_idx on cameras (pin_hash) where pin_hash is not null;

-- A PIN that was only a hash on the profile still opens the gate until they choose a new one.
insert into cameras (token, pin_hash)
select shooter_token, pin_hash
from profiles
where pin_hash is not null
on conflict (token) do update
set pin_hash = coalesce(cameras.pin_hash, excluded.pin_hash);

-- Taken PIN tries for one camera. The PIN is not stored here.
create table if not exists pin_choice (
  id text primary key,
  window_start timestamptz not null default now(),
  n integer not null default 0
);
