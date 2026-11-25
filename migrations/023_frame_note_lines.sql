-- A camera can sign more than one note on the same frame.
alter table frame_notes add column id text;
update frame_notes set id = gen_random_uuid()::text where id is null;
alter table frame_notes alter column id set not null;
alter table frame_notes alter column id set default gen_random_uuid()::text;
alter table frame_notes drop constraint frame_notes_pkey;
alter table frame_notes add primary key (id);

alter table frame_notes add column hand text not null default 'caveat';
alter table frame_notes add constraint frame_notes_hand_chk check (hand in ('caveat', 'patrick', 'kalam'));

create index frame_notes_photo_idx on frame_notes (photo_id, created_at);
