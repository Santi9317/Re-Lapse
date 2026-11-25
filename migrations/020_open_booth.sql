-- The booth a browser without a cookie shares. It is not a private phone.
alter table booth_issue_lock add column if not exists open_id text;
