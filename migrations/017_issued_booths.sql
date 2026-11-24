-- Booth ids the server handed out. A cookie the caller invented is not listed,
-- so it does not receive its own camera or join allowance.
create table if not exists issued_booths (
  id text primary key,
  created_at timestamptz not null default now()
);

create index if not exists issued_booths_created_idx on issued_booths (created_at desc);

create table if not exists booth_issue_lock (
  id integer primary key
);

insert into booth_issue_lock (id) values (1) on conflict (id) do nothing;
