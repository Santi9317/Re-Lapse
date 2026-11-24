-- A gallery keeps one cover the owner picked. Empty means the first photo.

alter table albums
  add column if not exists cover_photo_id text references photos (id) on delete set null;
