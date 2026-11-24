create table profiles (
  id text primary key,
  shooter_token text not null unique check (char_length(shooter_token) = 36),
  username text not null check (char_length(username) between 1 and 24),
  emoji_1 text not null check (char_length(emoji_1) between 1 and 32),
  emoji_2 text not null check (char_length(emoji_2) between 1 and 32),
  emoji_3 text not null check (char_length(emoji_3) between 1 and 32),
  avatar_photo_id text references photos (id) on delete set null,
  avatar_image text check (avatar_image is null or char_length(avatar_image) between 100 and 700000),
  carousel text not null default '[]',
  updated_at timestamptz not null default now()
);

create index profiles_shooter_idx on profiles (shooter_token);
