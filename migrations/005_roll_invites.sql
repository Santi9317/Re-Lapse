-- Active rolls can stay open from 1 hour through 24. Rolls created after this
-- migration are invite-only: other people join, then the starter picks which
-- developed frames go on the feed. Rolls that already exist stay open to anyone.

do $$
declare
  cons text;
begin
  for cons in
    select c.conname
    from pg_constraint c
    join pg_class r on r.oid = c.conrelid
    where r.relname = 'events'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%duration_hours%'
  loop
    execute format('alter table events drop constraint %I', cons);
  end loop;
end $$;

alter table events add constraint events_duration_hours_check check (duration_hours between 1 and 24);

alter table events add column if not exists invite_only boolean not null default true;

update events set invite_only = false;

create table if not exists event_members (
  event_id text not null references events (id) on delete cascade,
  shooter_token text not null check (char_length(shooter_token) = 36),
  joined_at timestamptz not null default now(),
  primary key (event_id, shooter_token)
);

create index if not exists event_members_shooter_idx on event_members (shooter_token, event_id);

create table if not exists event_invites (
  code text primary key check (char_length(code) between 4 and 12),
  event_id text not null unique references events (id) on delete cascade,
  created_at timestamptz not null default now()
);

insert into event_members (event_id, shooter_token)
select id, owner_token
from events
where owner_token is not null
  and char_length(owner_token) = 36
on conflict (event_id, shooter_token) do nothing;
