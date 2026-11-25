-- A timecapsule opens at a chosen start. The hours already chosen run from
-- that start, and the frames stay sealed until a day after those hours end.
-- Capsules that already exist opened when they were created, which is the
-- end minus the hours they were given.

alter table events add column if not exists starts_at timestamptz;

update events
set starts_at = ends_at - (duration_hours * interval '1 hour')
where starts_at is null;

alter table events alter column starts_at set not null;

alter table events drop constraint if exists events_start_before_end;

alter table events add constraint events_start_before_end check (starts_at <= ends_at);
