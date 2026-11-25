alter table photos add column chemistry text check (chemistry in ('default', 'daylight', 'night'));
alter table photos add column date_stamp boolean not null default false;
alter table photos add column captured_at timestamptz;
alter table photos add column graded boolean not null default true;
