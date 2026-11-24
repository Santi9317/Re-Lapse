-- Serializes new join requests and new camera ids.
create table if not exists join_queue_lock (
  id integer primary key
);

insert into join_queue_lock (id) values (1) on conflict (id) do nothing;

-- Wrong gate keys for one browser. The guessed key is not stored.
create table if not exists gate_client (
  id text primary key,
  window_start timestamptz not null default now(),
  n integer not null default 0
);

create index if not exists gate_client_window_idx on gate_client (window_start desc);
