-- The recovery PIN is only the hash. The digits are not kept.
drop index if exists cameras_pin_code_idx;
alter table cameras drop column if exists pin_code;
