-- The allowance follows the phone. A booth claimed later stores that same phone,
-- so a new booth does not open a new count. A booth that already had its own
-- id keeps the phone it was already using.
alter table issued_booths add column if not exists phone text;

update issued_booths set phone = id where phone is null;

alter table issued_booths alter column phone set not null;

create index if not exists issued_booths_phone_idx on issued_booths (phone);
