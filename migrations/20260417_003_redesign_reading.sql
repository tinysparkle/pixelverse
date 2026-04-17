DROP TABLE IF EXISTS reading_review_cards;
DROP TABLE IF EXISTS reading_annotations;
DROP TABLE IF EXISTS vocab_entries;

CREATE TABLE IF NOT EXISTS vocab_entries (
  id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  kind ENUM('word', 'phrase') NOT NULL,
  text VARCHAR(255) NOT NULL,
  normalized_text VARCHAR(255) NOT NULL,
  gloss_cn VARCHAR(120) NULL,
  note_text TEXT NULL,
  mastery_state ENUM('new', 'learning', 'known') NOT NULL DEFAULT 'new',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  active_normalized_text VARCHAR(255) GENERATED ALWAYS AS (
    CASE
      WHEN deleted_at IS NULL THEN normalized_text
      ELSE NULL
    END
  ) STORED,
  PRIMARY KEY (id),
  UNIQUE KEY uk_vocab_entries_user_active_text (user_id, kind, active_normalized_text),
  KEY idx_vocab_entries_user_deleted_updated (user_id, deleted_at, updated_at),
  CONSTRAINT fk_vocab_entries_user
    FOREIGN KEY (user_id)
    REFERENCES users (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reading_annotations (
  id CHAR(36) NOT NULL,
  reading_item_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  kind ENUM('word', 'phrase') NOT NULL,
  vocab_entry_id CHAR(36) NULL,
  selected_text TEXT NOT NULL,
  anchor_start INT NOT NULL,
  anchor_end INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_reading_annotations_item_deleted (reading_item_id, deleted_at, created_at),
  KEY idx_reading_annotations_user_kind (user_id, kind, deleted_at),
  KEY idx_reading_annotations_vocab_deleted (vocab_entry_id, deleted_at),
  CONSTRAINT fk_reading_annotations_item
    FOREIGN KEY (reading_item_id)
    REFERENCES reading_items (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_reading_annotations_vocab
    FOREIGN KEY (vocab_entry_id)
    REFERENCES vocab_entries (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_reading_annotations_user
    FOREIGN KEY (user_id)
    REFERENCES users (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reading_review_cards (
  id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  vocab_entry_id CHAR(36) NOT NULL,
  review_state ENUM('new', 'learning', 'review', 'relearning') NOT NULL DEFAULT 'new',
  interval_days DECIMAL(8,3) NOT NULL DEFAULT 0,
  due_at DATETIME NOT NULL,
  last_reviewed_at DATETIME NULL,
  review_count INT NOT NULL DEFAULT 0,
  lapse_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_reading_review_cards_vocab (vocab_entry_id),
  KEY idx_reading_review_cards_user_due (user_id, deleted_at, due_at),
  CONSTRAINT fk_reading_review_cards_vocab
    FOREIGN KEY (vocab_entry_id)
    REFERENCES vocab_entries (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_reading_review_cards_user
    FOREIGN KEY (user_id)
    REFERENCES users (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
