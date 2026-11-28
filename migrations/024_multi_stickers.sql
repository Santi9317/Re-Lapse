-- A camera can stick more than one emoji on the same frame.
alter table stickers add column id text;
update stickers set id = gen_random_uuid()::text where id is null;
alter table stickers alter column id set not null;
alter table stickers alter column id set default gen_random_uuid()::text;
alter table stickers drop constraint stickers_pkey;
alter table stickers add primary key (id);

alter table stickers add column x real;
alter table stickers add column y real;

create index stickers_photo_idx on stickers (photo_id, created_at);
