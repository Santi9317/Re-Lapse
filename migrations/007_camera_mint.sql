-- Minting a brand-new camera id is logged so a script cannot open unlimited windows.

alter table create_log drop constraint if exists create_log_kind_check;
alter table create_log add constraint create_log_kind_check
  check (kind in ('photo', 'album', 'event', 'profile', 'join', 'camera'));
