-- A photo can sit in more than one gallery. album_id stays the first one.
create table if not exists album_photos (
  album_id text not null references albums (id) on delete cascade,
  photo_id text not null references photos (id) on delete cascade,
  primary key (album_id, photo_id)
);

insert into album_photos (album_id, photo_id)
select album_id, id from photos
where album_id is not null
on conflict do nothing;

create index if not exists album_photos_photo_idx on album_photos (photo_id);
