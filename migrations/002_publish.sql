alter table photos add column if not exists published_at timestamptz;

update photos
set published_at = developed_at
where published_at is null
  and developed_at is not null
  and event_id is null;

create index if not exists photos_published_idx on photos (published_at desc, created_at desc);
