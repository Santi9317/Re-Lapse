alter table create_log drop constraint if exists create_log_kind_check;
alter table create_log add constraint create_log_kind_check
  check (kind in ('photo', 'album', 'event', 'profile'));
