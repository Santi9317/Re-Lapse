create table frame_notes (
  photo_id text not null references photos (id) on delete cascade,
  shooter_token text not null check (char_length(shooter_token) = 36),
  body text not null check (char_length(body) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (photo_id, shooter_token)
);

create index frame_notes_shooter_idx on frame_notes (shooter_token);
