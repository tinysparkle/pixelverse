ALTER TABLE vocab_entries
  ADD COLUMN gloss_cn VARCHAR(120) NULL AFTER normalized_text;
