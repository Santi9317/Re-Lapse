-- A left swipe hides the frame at once, so undo can put that same frame back.
-- Leaving the decision drops the row. A right swipe is a normal publish.
alter table photos add column if not exists discarded_at timestamptz;
