create table stickers (
  photo_id text not null references photos (id) on delete cascade,
  shooter_token text not null check (char_length(shooter_token) = 36),
  emoji text not null check (char_length(emoji) between 1 and 32),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (photo_id, shooter_token)
);

create index stickers_shooter_idx on stickers (shooter_token);
