-- One row counts wrong gate keys for the current window.
-- The guessed key is not stored. A lock on this row makes the count and the
-- increment a single step.
create table if not exists gate_guess_slot (
  id integer primary key,
  window_start timestamptz not null default now(),
  n integer not null default 0
);

insert into gate_guess_slot (id, window_start, n)
values (1, now(), 0)
on conflict (id) do nothing;
