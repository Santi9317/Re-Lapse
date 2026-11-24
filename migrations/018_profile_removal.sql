-- Santiago removed this profile from the gate. The camera can save a new one.
-- Opening the app must not put the removed profile back. The PIN stays on the camera.
create table if not exists profile_removals (
  shooter_token text primary key check (char_length(shooter_token) = 36),
  removed_at timestamptz not null default now()
);
