CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) NOT NULL,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notes (
  id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  title VARCHAR(255) NOT NULL DEFAULT '未命名笔记',
  content_json LONGTEXT NULL,
  content_text LONGTEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_notes_user_deleted_updated (user_id, deleted_at, updated_at),
  CONSTRAINT fk_notes_user
    FOREIGN KEY (user_id)
    REFERENCES users (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tasks (
  id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  due_date DATETIME NULL,
  priority ENUM('high', 'medium', 'low') NOT NULL DEFAULT 'medium',
  tags VARCHAR(500) NULL,
  completed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_tasks_user_deleted (user_id, deleted_at),
  KEY idx_tasks_due_date (user_id, due_date, deleted_at, completed_at),
  CONSTRAINT fk_tasks_user
    FOREIGN KEY (user_id)
    REFERENCES users (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reading_items (
  id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  title VARCHAR(255) NOT NULL,
  source_type ENUM('ai') NOT NULL DEFAULT 'ai',
  topic VARCHAR(100) NOT NULL,
  level ENUM('cet4', 'b1', 'b2') NOT NULL DEFAULT 'cet4',
  length_bucket ENUM('short', 'medium', 'long') NOT NULL DEFAULT 'medium',
  status ENUM('new', 'reading', 'reviewed', 'trained') NOT NULL DEFAULT 'new',
  generation_prompt_json LONGTEXT NULL,
  content_text LONGTEXT NOT NULL,
  content_json LONGTEXT NULL,
  word_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_reading_items_user_deleted_updated (user_id, deleted_at, updated_at),
  KEY idx_reading_items_user_status (user_id, status, deleted_at),
  CONSTRAINT fk_reading_items_user
    FOREIGN KEY (user_id)
    REFERENCES users (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
