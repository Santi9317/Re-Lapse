create table albums (
  id text primary key,
  name text not null check (char_length(name) between 1 and 40),
  created_at timestamptz not null default now()
);

create table events (
  id text primary key,
  name text not null check (char_length(name) between 1 and 40),
  duration_hours integer not null check (duration_hours between 8 and 24),
  created_at timestamptz not null default now(),
  ends_at timestamptz not null,
  reveal_at timestamptz not null,
  check (reveal_at >= ends_at)
);

create table photos (
  id text primary key,
  shooter_token text not null check (char_length(shooter_token) = 36),
  caption text not null default '' check (char_length(caption) <= 80),
  image_b64 text not null check (char_length(image_b64) between 100 and 1600000),
  created_at timestamptz not null default now(),
  ready_at timestamptz not null,
  developed_at timestamptz,
  album_id text references albums (id),
  event_id text references events (id),
  check (album_id is null or event_id is null)
);

create index photos_feed_idx on photos (developed_at desc, created_at desc);
create index photos_shooter_idx on photos (shooter_token, created_at desc);
create index photos_album_idx on photos (album_id);
create index photos_event_idx on photos (event_id);
create index albums_created_idx on albums (created_at desc);
create index events_created_idx on events (created_at desc);
