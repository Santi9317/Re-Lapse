-- A frame shot from a gallery remembers that gallery, but it is not a member yet.
-- Membership is album_id, and that is set when the developed frame is kept.
alter table photos
  add column if not exists for_album_id text references albums (id) on delete set null;
