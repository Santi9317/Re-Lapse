-- A developed frame stays private until its shooter sends it to the feed.
-- An earlier copy of 002_publish.sql copied developed_at into published_at,
-- which is the only way those two timestamps are equal.
update photos
set published_at = null
where event_id is null
  and developed_at is not null
  and published_at = developed_at;

alter table create_log add column if not exists camera_key text not null default '';

create index if not exists create_log_camera_idx on create_log (kind, camera_key, created_at desc);
