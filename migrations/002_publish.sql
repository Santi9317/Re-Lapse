alter table photos add column if not exists published_at timestamptz;

create index if not exists photos_published_idx on photos (published_at desc, created_at desc);
