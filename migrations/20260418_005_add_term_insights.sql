SET @has_vocab_phonetic := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'vocab_entries'
    AND COLUMN_NAME = 'phonetic'
);

SET @ddl := IF(
  @has_vocab_phonetic = 0,
  'ALTER TABLE vocab_entries
     ADD COLUMN phonetic VARCHAR(120) NULL AFTER gloss_cn,
     ADD COLUMN part_of_speech VARCHAR(60) NULL AFTER phonetic,
     ADD COLUMN grammar_tags_json JSON NULL AFTER part_of_speech,
     ADD COLUMN definition_en TEXT NULL AFTER grammar_tags_json,
     ADD COLUMN example_en TEXT NULL AFTER definition_en,
     ADD COLUMN example_cn TEXT NULL AFTER example_en',
  'SELECT 1'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS reading_term_insights (
  id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  text VARCHAR(255) NOT NULL,
  normalized_text VARCHAR(255) NOT NULL,
  detected_kind ENUM('word', 'phrase') NOT NULL,
  gloss_cn VARCHAR(120) NOT NULL,
  phonetic VARCHAR(120) NULL,
  part_of_speech VARCHAR(60) NULL,
  grammar_tags_json JSON NULL,
  definition_en TEXT NULL,
  example_en TEXT NULL,
  example_cn TEXT NULL,
  source_sentence TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_reading_term_insights_user_text (user_id, normalized_text),
  KEY idx_reading_term_insights_user_updated (user_id, updated_at),
  CONSTRAINT fk_reading_term_insights_user
    FOREIGN KEY (user_id)
    REFERENCES users (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
