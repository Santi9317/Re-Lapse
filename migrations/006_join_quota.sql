-- Join attempts are counted per camera. The kind check has to allow that row.

alter table create_log drop constraint if exists create_log_kind_check;
alter table create_log add constraint create_log_kind_check
  check (kind in ('photo', 'album', 'event', 'profile', 'join'));

-- The proof on a camera id is an HMAC of this secret. The secret stays in the
-- database. It is not a camera id, and it is not read from an address header.
create table if not exists camera_secret (
  id integer primary key check (id = 1),
  secret text not null check (char_length(secret) = 64)
);
