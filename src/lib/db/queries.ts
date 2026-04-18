import { randomUUID } from "node:crypto";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { executeStatement, getPool, queryRows, type SqlValue } from "@/lib/db";
import type {
	DeletedNoteSummary,
	NoteRecord,
	NoteSummary,
	ReadingAnnotationKind,
	ReadingAnnotationRecord,
	ReadingItemRecord,
	ReadingItemSummary,
	ReadingLengthBucket,
	ReadingLevel,
	ReadingReviewCardRecord,
	ReadingStudyCard,
	ReadingSourceType,
	ReadingStatus,
	ReviewForecast,
	ReviewGrade,
	ReviewState,
	TaskPriority,
	TaskRecord,
	TaskSummary,
	UserRecord,
	VocabEntryKind,
	VocabEntryRecord,
	VocabMasteryState,
	VocabSummary,
} from "@/lib/db/types";
import {
	computeNextReviewSchedule,
	createInitialReviewSchedule,
	normalizeVocabText,
} from "@/components/reading/readingUtils";

type UserRow = RowDataPacket & {
	id: string;
	email: string;
	password_hash: string;
	created_at: Date | string;
	updated_at: Date | string;
};

type NoteRow = RowDataPacket & {
	id: string;
	user_id: string;
	title: string;
	content_json: string | null;
	content_text: string | null;
	created_at: Date | string;
	updated_at: Date | string;
	deleted_at: Date | string | null;
};

type TaskRow = RowDataPacket & {
	id: string;
	user_id: string;
	title: string;
	description: string | null;
	due_date: Date | string | null;
	priority: TaskPriority;
	tags: string | null;
	completed_at: Date | string | null;
	created_at: Date | string;
	updated_at: Date | string;
	deleted_at: Date | string | null;
};

type ReadingItemRow = RowDataPacket & {
	id: string;
	user_id: string;
	title: string;
	source_type: ReadingSourceType;
	topic: string;
	level: ReadingLevel;
	length_bucket: ReadingLengthBucket;
	status: ReadingStatus;
	generation_prompt_json: string | null;
	content_text: string;
	content_json: string | null;
	word_count: number;
	created_at: Date | string;
	updated_at: Date | string;
	deleted_at: Date | string | null;
};

type VocabEntryRow = RowDataPacket & {
	id: string;
	user_id: string;
	kind: VocabEntryKind;
	text: string;
	normalized_text: string;
	gloss_cn: string | null;
	note_text: string | null;
	mastery_state: VocabMasteryState;
	created_at: Date | string;
	updated_at: Date | string;
	deleted_at: Date | string | null;
};

type VocabSummaryRow = RowDataPacket & {
	id: string;
	kind: VocabEntryKind;
	text: string;
	gloss_cn: string | null;
	note_text: string | null;
	mastery_state: VocabMasteryState;
	article_count: number;
	occurrence_count: number;
	last_annotated_at: Date | string | null;
	updated_at: Date | string;
};

type ReadingAnnotationRow = RowDataPacket & {
	id: string;
	reading_item_id: string;
	user_id: string;
	kind: ReadingAnnotationKind;
	vocab_entry_id: string | null;
	selected_text: string;
	anchor_start: number;
	anchor_end: number;
	created_at: Date | string;
	deleted_at: Date | string | null;
	vocab_text: string | null;
	vocab_gloss_cn: string | null;
	vocab_kind: VocabEntryKind | null;
	vocab_note_text: string | null;
	vocab_mastery_state: VocabMasteryState | null;
};

type ReadingReviewCardRow = RowDataPacket & {
	id: string;
	user_id: string;
	vocab_entry_id: string;
	review_state: ReviewState;
	interval_days: number | string;
	due_at: Date | string;
	last_reviewed_at: Date | string | null;
	review_count: number;
	lapse_count: number;
	created_at: Date | string;
	updated_at: Date | string;
	deleted_at: Date | string | null;
	vocab_text: string;
	vocab_gloss_cn: string | null;
	vocab_kind: VocabEntryKind;
	vocab_note_text: string | null;
	vocab_mastery_state: VocabMasteryState;
};

type LatestReviewContextRow = RowDataPacket & {
	vocab_entry_id: string;
	annotation_id: string;
	reading_item_id: string;
	reading_item_title: string;
	selected_text: string;
	anchor_start: number;
	anchor_end: number;
	content_text: string;
};

type CountRow = RowDataPacket & { count: number };

function toIsoString(value: Date | string | null) {
	if (!value) {
		return null;
	}

	if (value instanceof Date) {
		return value.toISOString();
	}

	return new Date(value).toISOString();
}

function toNumber(value: string | number | null) {
	if (value === null) return null;
	return typeof value === "number" ? value : Number(value);
}

function parseTags(raw: string | null): string[] {
	if (!raw) return [];
	return raw.split(",").map((t) => t.trim()).filter(Boolean);
}

function escapeLike(value: string) {
	return value.replace(/[\\%_]/g, "\\$&");
}

function createContextSnippet(contentText: string, start: number, end: number) {
	const snippetStart = Math.max(0, start - 48);
	const snippetEnd = Math.min(contentText.length, end + 72);
	const prefix = snippetStart > 0 ? "..." : "";
	const suffix = snippetEnd < contentText.length ? "..." : "";
	return `${prefix}${contentText.slice(snippetStart, snippetEnd).replace(/\s+/g, " ").trim()}${suffix}`;
}

async function withTransaction<T>(handler: (connection: PoolConnection) => Promise<T>) {
	const connection = await getPool().getConnection();

	try {
		await connection.beginTransaction();
		const result = await handler(connection);
		await connection.commit();
		return result;
	} catch (error) {
		await connection.rollback();
		throw error;
	} finally {
		connection.release();
	}
}

function mapUser(row: UserRow): UserRecord {
	return {
		id: row.id,
		email: row.email,
		passwordHash: row.password_hash,
		createdAt: toIsoString(row.created_at) ?? new Date().toISOString(),
		updatedAt: toIsoString(row.updated_at) ?? new Date().toISOString(),
	};
}

function mapNote(row: NoteRow): NoteRecord {
	return {
		id: row.id,
		userId: row.user_id,
		title: row.title,
		contentJson: row.content_json,
		contentText: row.content_text ?? "",
		createdAt: toIsoString(row.created_at) ?? new Date().toISOString(),
		updatedAt: toIsoString(row.updated_at) ?? new Date().toISOString(),
		deletedAt: toIsoString(row.deleted_at),
	};
}

function mapTask(row: TaskRow): TaskRecord {
	return {
		id: row.id,
		userId: row.user_id,
		title: row.title,
		description: row.description,
		dueDate: toIsoString(row.due_date),
		priority: row.priority,
		tags: parseTags(row.tags),
		completedAt: toIsoString(row.completed_at),
		createdAt: toIsoString(row.created_at) ?? new Date().toISOString(),
		updatedAt: toIsoString(row.updated_at) ?? new Date().toISOString(),
		deletedAt: toIsoString(row.deleted_at),
	};
}

function mapReadingItem(row: ReadingItemRow): ReadingItemRecord {
	return {
		id: row.id,
		userId: row.user_id,
		title: row.title,
		sourceType: row.source_type,
		topic: row.topic,
		level: row.level,
		lengthBucket: row.length_bucket,
		status: row.status,
		generationPromptJson: row.generation_prompt_json,
		contentText: row.content_text,
		contentJson: row.content_json,
		wordCount: row.word_count,
		createdAt: toIsoString(row.created_at) ?? new Date().toISOString(),
		updatedAt: toIsoString(row.updated_at) ?? new Date().toISOString(),
		deletedAt: toIsoString(row.deleted_at),
	};
}

function mapVocabEntry(row: VocabEntryRow): VocabEntryRecord {
	return {
		id: row.id,
		userId: row.user_id,
		kind: row.kind,
		text: row.text,
		normalizedText: row.normalized_text,
		glossCn: row.gloss_cn,
		noteText: row.note_text,
		masteryState: row.mastery_state,
		createdAt: toIsoString(row.created_at) ?? new Date().toISOString(),
		updatedAt: toIsoString(row.updated_at) ?? new Date().toISOString(),
		deletedAt: toIsoString(row.deleted_at),
	};
}

function mapVocabSummary(row: VocabSummaryRow): VocabSummary {
	return {
		id: row.id,
		kind: row.kind,
		text: row.text,
		glossCn: row.gloss_cn,
		noteText: row.note_text,
		masteryState: row.mastery_state,
		articleCount: row.article_count,
		occurrenceCount: row.occurrence_count,
		lastAnnotatedAt: toIsoString(row.last_annotated_at),
		updatedAt: toIsoString(row.updated_at) ?? new Date().toISOString(),
	};
}

function mapReadingAnnotation(row: ReadingAnnotationRow): ReadingAnnotationRecord {
	return {
		id: row.id,
		readingItemId: row.reading_item_id,
		userId: row.user_id,
		kind: row.kind,
		vocabEntryId: row.vocab_entry_id,
		selectedText: row.selected_text,
		anchorStart: row.anchor_start,
		anchorEnd: row.anchor_end,
		createdAt: toIsoString(row.created_at) ?? new Date().toISOString(),
		deletedAt: toIsoString(row.deleted_at),
		vocabText: row.vocab_text,
		vocabGlossCn: row.vocab_gloss_cn,
		vocabKind: row.vocab_kind,
		vocabNoteText: row.vocab_note_text,
		vocabMasteryState: row.vocab_mastery_state,
	};
}

function mapReadingReviewCard(row: ReadingReviewCardRow): ReadingReviewCardRecord {
	return {
		id: row.id,
		userId: row.user_id,
		vocabEntryId: row.vocab_entry_id,
		reviewState: row.review_state,
		intervalDays: toNumber(row.interval_days) ?? 0,
		dueAt: toIsoString(row.due_at) ?? new Date().toISOString(),
		lastReviewedAt: toIsoString(row.last_reviewed_at),
		reviewCount: row.review_count,
		lapseCount: row.lapse_count,
		createdAt: toIsoString(row.created_at) ?? new Date().toISOString(),
		updatedAt: toIsoString(row.updated_at) ?? new Date().toISOString(),
		deletedAt: toIsoString(row.deleted_at),
		vocabText: row.vocab_text,
		vocabGlossCn: row.vocab_gloss_cn,
		vocabKind: row.vocab_kind,
		vocabNoteText: row.vocab_note_text,
		vocabMasteryState: row.vocab_mastery_state,
		contextAnnotationId: null,
		contextReadingItemId: null,
		contextReadingItemTitle: null,
		contextSnippet: null,
	};
}

export async function getUserByEmail(email: string) {
	const rows = await queryRows<UserRow[]>(
		`SELECT id, email, password_hash, created_at, updated_at
		 FROM users
		 WHERE email = ?
		 LIMIT 1`,
		[email]
	);

	return rows[0] ? mapUser(rows[0]) : null;
}

export async function upsertSeedUser(email: string, passwordHash: string) {
	const existing = await getUserByEmail(email);

	if (existing) {
		await executeStatement(
			`UPDATE users
			 SET password_hash = ?, updated_at = UTC_TIMESTAMP()
			 WHERE id = ?`,
			[passwordHash, existing.id]
		);

		return { action: "updated" as const, userId: existing.id };
	}

	const userId = randomUUID();

	await executeStatement(
		`INSERT INTO users (id, email, password_hash)
		 VALUES (?, ?, ?)`,
		[userId, email, passwordHash]
	);

	return { action: "created" as const, userId };
}

export async function listNotesForUser(userId: string, searchQuery?: string) {
	const conditions = ["user_id = ?", "deleted_at IS NULL"];
	const values: SqlValue[] = [userId];

	if (searchQuery) {
		const pattern = `%${escapeLike(searchQuery)}%`;
		conditions.push("(title LIKE ? ESCAPE '\\\\' OR content_text LIKE ? ESCAPE '\\\\')");
		values.push(pattern, pattern);
	}

	const rows = await queryRows<NoteRow[]>(
		`SELECT id, user_id, title, content_json, content_text, created_at, updated_at, deleted_at
		 FROM notes
		 WHERE ${conditions.join(" AND ")}
		 ORDER BY updated_at DESC`,
		values
	);

	return rows.map((row): NoteSummary => {
		const note = mapNote(row);
		return {
			id: note.id,
			title: note.title,
			updatedAt: note.updatedAt,
			excerpt: note.contentText.slice(0, 120),
		};
	});
}

export async function getNoteByIdForUser(noteId: string, userId: string) {
	const rows = await queryRows<NoteRow[]>(
		`SELECT id, user_id, title, content_json, content_text, created_at, updated_at, deleted_at
		 FROM notes
		 WHERE id = ? AND user_id = ? AND deleted_at IS NULL
		 LIMIT 1`,
		[noteId, userId]
	);

	return rows[0] ? mapNote(rows[0]) : null;
}

export async function createNoteForUser(userId: string) {
	const noteId = randomUUID();

	await executeStatement(
		`INSERT INTO notes (id, user_id, title, content_json, content_text)
		 VALUES (?, ?, ?, NULL, '')`,
		[noteId, userId, "未命名笔记"]
	);

	return getNoteByIdForUser(noteId, userId);
}

export async function updateNoteForUser(
	noteId: string,
	userId: string,
	updates: {
		title?: string;
		contentJson?: string | null;
		contentText?: string;
	}
) {
	const fields: string[] = ["updated_at = UTC_TIMESTAMP()"];
	const values: SqlValue[] = [];

	if (updates.title !== undefined) {
		fields.push("title = ?");
		values.push(updates.title);
	}

	if (updates.contentJson !== undefined) {
		fields.push("content_json = ?");
		values.push(updates.contentJson);
	}

	if (updates.contentText !== undefined) {
		fields.push("content_text = ?");
		values.push(updates.contentText);
	}

	values.push(noteId, userId);

	const result = await executeStatement(
		`UPDATE notes
		 SET ${fields.join(", ")}
		 WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
		values
	);

	if (result.affectedRows === 0) {
		return null;
	}

	return getNoteByIdForUser(noteId, userId);
}

export async function softDeleteNoteForUser(noteId: string, userId: string) {
	const result = await executeStatement(
		`UPDATE notes
		 SET deleted_at = UTC_TIMESTAMP(), updated_at = UTC_TIMESTAMP()
		 WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
		[noteId, userId]
	);

	return result.affectedRows > 0;
}

export async function getDeletedNotesForUser(userId: string) {
	const rows = await queryRows<NoteRow[]>(
		`SELECT id, user_id, title, content_json, content_text, created_at, updated_at, deleted_at
		 FROM notes
		 WHERE user_id = ? AND deleted_at IS NOT NULL
		   AND deleted_at > DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY)
		 ORDER BY deleted_at DESC`,
		[userId]
	);

	return rows.map((row): DeletedNoteSummary => {
		const note = mapNote(row);
		return {
			id: note.id,
			title: note.title,
			excerpt: note.contentText.slice(0, 120),
			deletedAt: note.deletedAt!,
			updatedAt: note.updatedAt,
		};
	});
}

export async function restoreNoteForUser(noteId: string, userId: string) {
	const result = await executeStatement(
		`UPDATE notes
		 SET deleted_at = NULL, updated_at = UTC_TIMESTAMP()
		 WHERE id = ? AND user_id = ? AND deleted_at IS NOT NULL`,
		[noteId, userId]
	);
	return result.affectedRows > 0;
}

export async function permanentlyDeleteNoteForUser(noteId: string, userId: string) {
	const result = await executeStatement(
		`DELETE FROM notes
		 WHERE id = ? AND user_id = ? AND deleted_at IS NOT NULL`,
		[noteId, userId]
	);
	return result.affectedRows > 0;
}

export async function purgeExpiredNotes() {
	const result = await executeStatement(
		`DELETE FROM notes
		 WHERE deleted_at IS NOT NULL
		   AND deleted_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY)`
	);
	return result.affectedRows;
}

export async function listTasksForUser(
	userId: string,
	filters?: { tag?: string; priority?: TaskPriority; status?: "pending" | "completed" }
) {
	const conditions = ["user_id = ?", "deleted_at IS NULL"];
	const values: SqlValue[] = [userId];

	if (filters?.tag) {
		conditions.push("FIND_IN_SET(?, tags) > 0");
		values.push(filters.tag);
	}

	if (filters?.priority) {
		conditions.push("priority = ?");
		values.push(filters.priority);
	}

	if (filters?.status === "completed") {
		conditions.push("completed_at IS NOT NULL");
	} else if (filters?.status === "pending") {
		conditions.push("completed_at IS NULL");
	}

	const rows = await queryRows<TaskRow[]>(
		`SELECT id, user_id, title, description, due_date, priority, tags,
		        completed_at, created_at, updated_at, deleted_at
		 FROM tasks
		 WHERE ${conditions.join(" AND ")}
		 ORDER BY completed_at IS NOT NULL ASC,
		          due_date IS NULL ASC,
		          due_date ASC,
		          priority = 'high' DESC,
		          updated_at DESC`,
		values
	);

	return rows.map((row): TaskSummary => {
		const task = mapTask(row);
		return {
			id: task.id,
			title: task.title,
			dueDate: task.dueDate,
			priority: task.priority,
			tags: task.tags,
			completedAt: task.completedAt,
			updatedAt: task.updatedAt,
		};
	});
}

export async function getTaskByIdForUser(taskId: string, userId: string) {
	const rows = await queryRows<TaskRow[]>(
		`SELECT id, user_id, title, description, due_date, priority, tags,
		        completed_at, created_at, updated_at, deleted_at
		 FROM tasks
		 WHERE id = ? AND user_id = ? AND deleted_at IS NULL
		 LIMIT 1`,
		[taskId, userId]
	);

	return rows[0] ? mapTask(rows[0]) : null;
}

export async function createTaskForUser(
	userId: string,
	data: {
		title: string;
		description?: string | null;
		dueDate?: string | null;
		priority?: TaskPriority;
		tags?: string[];
	}
) {
	const taskId = randomUUID();
	const tagsStr = data.tags?.length ? data.tags.join(",") : null;

	await executeStatement(
		`INSERT INTO tasks (id, user_id, title, description, due_date, priority, tags)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		[
			taskId,
			userId,
			data.title,
			data.description ?? null,
			data.dueDate ?? null,
			data.priority ?? "medium",
			tagsStr,
		]
	);

	return getTaskByIdForUser(taskId, userId);
}

export async function updateTaskForUser(
	taskId: string,
	userId: string,
	updates: {
		title?: string;
		description?: string | null;
		dueDate?: string | null;
		priority?: TaskPriority;
		tags?: string[];
	}
) {
	const fields: string[] = ["updated_at = UTC_TIMESTAMP()"];
	const values: SqlValue[] = [];

	if (updates.title !== undefined) {
		fields.push("title = ?");
		values.push(updates.title);
	}

	if (updates.description !== undefined) {
		fields.push("description = ?");
		values.push(updates.description);
	}

	if (updates.dueDate !== undefined) {
		fields.push("due_date = ?");
		values.push(updates.dueDate);
	}

	if (updates.priority !== undefined) {
		fields.push("priority = ?");
		values.push(updates.priority);
	}

	if (updates.tags !== undefined) {
		fields.push("tags = ?");
		values.push(updates.tags.length ? updates.tags.join(",") : null);
	}

	values.push(taskId, userId);

	const result = await executeStatement(
		`UPDATE tasks
		 SET ${fields.join(", ")}
		 WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
		values
	);

	if (result.affectedRows === 0) return null;

	return getTaskByIdForUser(taskId, userId);
}

export async function toggleTaskComplete(taskId: string, userId: string) {
	const task = await getTaskByIdForUser(taskId, userId);
	if (!task) return null;

	if (task.completedAt) {
		await executeStatement(
			`UPDATE tasks SET completed_at = NULL, updated_at = UTC_TIMESTAMP()
			 WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
			[taskId, userId]
		);
	} else {
		await executeStatement(
			`UPDATE tasks SET completed_at = UTC_TIMESTAMP(), updated_at = UTC_TIMESTAMP()
			 WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
			[taskId, userId]
		);
	}

	return getTaskByIdForUser(taskId, userId);
}

export async function softDeleteTaskForUser(taskId: string, userId: string) {
	const result = await executeStatement(
		`UPDATE tasks
		 SET deleted_at = UTC_TIMESTAMP(), updated_at = UTC_TIMESTAMP()
		 WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
		[taskId, userId]
	);

	return result.affectedRows > 0;
}

export async function getUpcomingTasksForUser(userId: string, days: number = 7) {
	const rows = await queryRows<TaskRow[]>(
		`SELECT id, user_id, title, description, due_date, priority, tags,
		        completed_at, created_at, updated_at, deleted_at
		 FROM tasks
		 WHERE user_id = ?
		   AND deleted_at IS NULL
		   AND completed_at IS NULL
		   AND due_date IS NOT NULL
		   AND due_date <= DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? DAY)
		 ORDER BY due_date ASC`,
		[userId, days]
	);

	return rows.map((row): TaskSummary => {
		const task = mapTask(row);
		return {
			id: task.id,
			title: task.title,
			dueDate: task.dueDate,
			priority: task.priority,
			tags: task.tags,
			completedAt: task.completedAt,
			updatedAt: task.updatedAt,
		};
	});
}

export async function listReadingItemsForUser(
	userId: string,
	filters?: { level?: ReadingLevel; status?: ReadingStatus; topic?: string }
) {
	const conditions = ["user_id = ?", "deleted_at IS NULL"];
	const values: SqlValue[] = [userId];

	if (filters?.level) {
		conditions.push("level = ?");
		values.push(filters.level);
	}

	if (filters?.status) {
		conditions.push("status = ?");
		values.push(filters.status);
	}

	if (filters?.topic) {
		const pattern = `%${escapeLike(filters.topic)}%`;
		conditions.push("topic LIKE ? ESCAPE '\\\\'");
		values.push(pattern);
	}

	const rows = await queryRows<ReadingItemRow[]>(
		`SELECT id, user_id, title, source_type, topic, level, length_bucket, status,
		        generation_prompt_json, content_text, content_json, word_count,
		        created_at, updated_at, deleted_at
		 FROM reading_items
		 WHERE ${conditions.join(" AND ")}
		 ORDER BY updated_at DESC`,
		values
	);

	return rows.map((row): ReadingItemSummary => {
		const item = mapReadingItem(row);
		return {
			id: item.id,
			title: item.title,
			topic: item.topic,
			level: item.level,
			lengthBucket: item.lengthBucket,
			status: item.status,
			wordCount: item.wordCount,
			updatedAt: item.updatedAt,
			excerpt: item.contentText.slice(0, 160),
		};
	});
}

export async function getReadingItemByIdForUser(readingItemId: string, userId: string) {
	const rows = await queryRows<ReadingItemRow[]>(
		`SELECT id, user_id, title, source_type, topic, level, length_bucket, status,
		        generation_prompt_json, content_text, content_json, word_count,
		        created_at, updated_at, deleted_at
		 FROM reading_items
		 WHERE id = ? AND user_id = ? AND deleted_at IS NULL
		 LIMIT 1`,
		[readingItemId, userId]
	);

	return rows[0] ? mapReadingItem(rows[0]) : null;
}

export async function createReadingItemForUser(
	userId: string,
	data: {
		title: string;
		topic: string;
		level: ReadingLevel;
		lengthBucket: ReadingLengthBucket;
		status?: ReadingStatus;
		generationPromptJson?: string | null;
		contentText: string;
		contentJson?: string | null;
		wordCount: number;
	}
) {
	const readingItemId = randomUUID();

	await executeStatement(
		`INSERT INTO reading_items (
			id, user_id, title, source_type, topic, level, length_bucket, status,
			generation_prompt_json, content_text, content_json, word_count
		 ) VALUES (?, ?, ?, 'ai', ?, ?, ?, ?, ?, ?, ?, ?)`,
		[
			readingItemId,
			userId,
			data.title,
			data.topic,
			data.level,
			data.lengthBucket,
			data.status ?? "new",
			data.generationPromptJson ?? null,
			data.contentText,
			data.contentJson ?? null,
			data.wordCount,
		]
	);

	return getReadingItemByIdForUser(readingItemId, userId);
}

export async function updateReadingItemForUser(
	readingItemId: string,
	userId: string,
	updates: {
		title?: string;
		topic?: string;
		level?: ReadingLevel;
		lengthBucket?: ReadingLengthBucket;
		status?: ReadingStatus;
		generationPromptJson?: string | null;
		contentText?: string;
		contentJson?: string | null;
		wordCount?: number;
	}
) {
	const fields: string[] = ["updated_at = UTC_TIMESTAMP()"];
	const values: SqlValue[] = [];

	if (updates.title !== undefined) {
		fields.push("title = ?");
		values.push(updates.title);
	}
	if (updates.topic !== undefined) {
		fields.push("topic = ?");
		values.push(updates.topic);
	}
	if (updates.level !== undefined) {
		fields.push("level = ?");
		values.push(updates.level);
	}
	if (updates.lengthBucket !== undefined) {
		fields.push("length_bucket = ?");
		values.push(updates.lengthBucket);
	}
	if (updates.status !== undefined) {
		fields.push("status = ?");
		values.push(updates.status);
	}
	if (updates.generationPromptJson !== undefined) {
		fields.push("generation_prompt_json = ?");
		values.push(updates.generationPromptJson);
	}
	if (updates.contentText !== undefined) {
		fields.push("content_text = ?");
		values.push(updates.contentText);
	}
	if (updates.contentJson !== undefined) {
		fields.push("content_json = ?");
		values.push(updates.contentJson);
	}
	if (updates.wordCount !== undefined) {
		fields.push("word_count = ?");
		values.push(updates.wordCount);
	}

	values.push(readingItemId, userId);

	const result = await executeStatement(
		`UPDATE reading_items
		 SET ${fields.join(", ")}
		 WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
		values
	);

	if (result.affectedRows === 0) return null;

	return getReadingItemByIdForUser(readingItemId, userId);
}

export async function softDeleteReadingItemForUser(readingItemId: string, userId: string) {
	return withTransaction(async (connection) => {
		const [result] = await connection.execute<ResultSetHeader>(
			`UPDATE reading_items
			 SET deleted_at = UTC_TIMESTAMP(), updated_at = UTC_TIMESTAMP()
			 WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
			[readingItemId, userId]
		);

		if (result.affectedRows === 0) return false;

		await connection.execute(
			`UPDATE reading_annotations
			 SET deleted_at = UTC_TIMESTAMP()
			 WHERE reading_item_id = ? AND user_id = ? AND deleted_at IS NULL`,
			[readingItemId, userId]
		);

		return true;
	});
}

export async function getVocabEntryByIdForUser(vocabEntryId: string, userId: string) {
	const rows = await queryRows<VocabEntryRow[]>(
		`SELECT id, user_id, kind, text, normalized_text, gloss_cn, note_text, mastery_state,
		        created_at, updated_at, deleted_at
		 FROM vocab_entries
		 WHERE id = ? AND user_id = ? AND deleted_at IS NULL
		 LIMIT 1`,
		[vocabEntryId, userId]
	);

	return rows[0] ? mapVocabEntry(rows[0]) : null;
}

export async function upsertVocabEntryForUser(
	userId: string,
	data: {
		kind: VocabEntryKind;
		text: string;
		noteText?: string | null;
	}
) {
	const normalizedText = normalizeVocabText(data.text);
	const displayText = data.text.trim().slice(0, 255);
	if (!normalizedText || !displayText) {
		return { entry: null, created: false };
	}

	return withTransaction(async (connection) => {
		const [existingRows] = await connection.query<VocabEntryRow[]>(
			`SELECT id, user_id, kind, text, normalized_text, gloss_cn, note_text, mastery_state,
			        created_at, updated_at, deleted_at
			 FROM vocab_entries
			 WHERE user_id = ? AND kind = ? AND normalized_text = ? AND deleted_at IS NULL
			 LIMIT 1
			 FOR UPDATE`,
			[userId, data.kind, normalizedText]
		);

			const existing = existingRows[0];
		if (existing) {
			if (data.noteText !== undefined) {
				await connection.execute(
					`UPDATE vocab_entries
					 SET note_text = ?, updated_at = UTC_TIMESTAMP()
					 WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
					[data.noteText, existing.id, userId]
				);
			}

			const [freshRows] = await connection.query<VocabEntryRow[]>(
				`SELECT id, user_id, kind, text, normalized_text, gloss_cn, note_text, mastery_state,
				        created_at, updated_at, deleted_at
				 FROM vocab_entries
				 WHERE id = ? AND user_id = ? AND deleted_at IS NULL
				 LIMIT 1`,
				[existing.id, userId]
			);

			return {
				entry: freshRows[0] ? mapVocabEntry(freshRows[0]) : null,
				created: false,
			};
		}

		const vocabEntryId = randomUUID();
		await connection.execute(
			`INSERT INTO vocab_entries (
				id, user_id, kind, text, normalized_text, gloss_cn, note_text
			 ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
			[vocabEntryId, userId, data.kind, displayText, normalizedText, null, data.noteText ?? null]
		);

		const [createdRows] = await connection.query<VocabEntryRow[]>(
			`SELECT id, user_id, kind, text, normalized_text, gloss_cn, note_text, mastery_state,
			        created_at, updated_at, deleted_at
			 FROM vocab_entries
			 WHERE id = ? AND user_id = ?
			 LIMIT 1`,
			[vocabEntryId, userId]
		);

		return {
			entry: createdRows[0] ? mapVocabEntry(createdRows[0]) : null,
			created: true,
		};
	});
}

export async function listVocabEntriesForUser(
	userId: string,
	filters?: {
		kind?: VocabEntryKind;
		masteryState?: VocabMasteryState;
		query?: string;
	}
) {
	const conditions = ["v.user_id = ?", "v.deleted_at IS NULL"];
	const values: SqlValue[] = [userId];

	if (filters?.kind) {
		conditions.push("v.kind = ?");
		values.push(filters.kind);
	}

	if (filters?.masteryState) {
		conditions.push("v.mastery_state = ?");
		values.push(filters.masteryState);
	}

	if (filters?.query) {
		const pattern = `%${escapeLike(filters.query)}%`;
		conditions.push("(v.text LIKE ? ESCAPE '\\\\' OR COALESCE(v.note_text, '') LIKE ? ESCAPE '\\\\')");
		values.push(pattern, pattern);
	}

	const rows = await queryRows<VocabSummaryRow[]>(
		`SELECT v.id, v.kind, v.text, v.gloss_cn, v.note_text, v.mastery_state,
		        COUNT(DISTINCT ri.id) AS article_count,
		        COUNT(ri.id) AS occurrence_count,
		        MAX(ra.created_at) AS last_annotated_at,
		        v.updated_at
		 FROM vocab_entries v
		 LEFT JOIN reading_annotations ra
		   ON ra.vocab_entry_id = v.id
		  AND ra.deleted_at IS NULL
		 LEFT JOIN reading_items ri
		   ON ri.id = ra.reading_item_id
		  AND ri.deleted_at IS NULL
		 WHERE ${conditions.join(" AND ")}
		 GROUP BY v.id, v.kind, v.text, v.gloss_cn, v.note_text, v.mastery_state, v.updated_at
		 ORDER BY COALESCE(MAX(ra.created_at), v.updated_at) DESC, v.updated_at DESC`,
		values
	);

	return rows.map(mapVocabSummary);
}

export async function updateVocabEntryForUser(
	vocabEntryId: string,
	userId: string,
	updates: {
		glossCn?: string | null;
		noteText?: string | null;
		masteryState?: VocabMasteryState;
	}
) {
	const fields: string[] = [];
	const values: SqlValue[] = [];

	if (updates.glossCn !== undefined) {
		fields.push("gloss_cn = ?");
		values.push(updates.glossCn);
	}

	if (updates.noteText !== undefined) {
		fields.push("note_text = ?");
		values.push(updates.noteText);
	}

	if (updates.masteryState !== undefined) {
		fields.push("mastery_state = ?");
		values.push(updates.masteryState);
	}

	if (fields.length === 0) {
		return getVocabEntryByIdForUser(vocabEntryId, userId);
	}

	values.push(vocabEntryId, userId);

	const result = await executeStatement(
		`UPDATE vocab_entries
		 SET ${fields.join(", ")}, updated_at = UTC_TIMESTAMP()
		 WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
		values
	);

	if (result.affectedRows === 0) return null;

	return getVocabEntryByIdForUser(vocabEntryId, userId);
}

export async function listReadingAnnotationsForItem(readingItemId: string, userId: string) {
	const rows = await queryRows<ReadingAnnotationRow[]>(
		`SELECT ra.id, ra.reading_item_id, ra.user_id, ra.kind, ra.vocab_entry_id,
		        ra.selected_text, ra.anchor_start, ra.anchor_end, ra.created_at, ra.deleted_at,
		        v.text AS vocab_text, v.gloss_cn AS vocab_gloss_cn, v.kind AS vocab_kind, v.note_text AS vocab_note_text,
		        v.mastery_state AS vocab_mastery_state
		 FROM reading_annotations ra
		 LEFT JOIN vocab_entries v
		   ON v.id = ra.vocab_entry_id
		  AND v.deleted_at IS NULL
		 WHERE ra.reading_item_id = ? AND ra.user_id = ? AND ra.deleted_at IS NULL
		 ORDER BY ra.anchor_start ASC, ra.created_at ASC`,
		[readingItemId, userId]
	);

	return rows.map(mapReadingAnnotation);
}

export async function getReadingAnnotationByIdForUser(annotationId: string, userId: string) {
	const rows = await queryRows<ReadingAnnotationRow[]>(
		`SELECT ra.id, ra.reading_item_id, ra.user_id, ra.kind, ra.vocab_entry_id,
		        ra.selected_text, ra.anchor_start, ra.anchor_end, ra.created_at, ra.deleted_at,
		        v.text AS vocab_text, v.gloss_cn AS vocab_gloss_cn, v.kind AS vocab_kind, v.note_text AS vocab_note_text,
		        v.mastery_state AS vocab_mastery_state
		 FROM reading_annotations ra
		 LEFT JOIN vocab_entries v
		   ON v.id = ra.vocab_entry_id
		  AND v.deleted_at IS NULL
		 WHERE ra.id = ? AND ra.user_id = ? AND ra.deleted_at IS NULL
		 LIMIT 1`,
		[annotationId, userId]
	);

	return rows[0] ? mapReadingAnnotation(rows[0]) : null;
}

export async function createReadingAnnotationForUser(
	userId: string,
	data: {
		readingItemId: string;
		kind: ReadingAnnotationKind;
		vocabEntryId?: string | null;
		selectedText: string;
		anchorStart: number;
		anchorEnd: number;
	}
) {
	const annotationId = randomUUID();

	await executeStatement(
		`INSERT INTO reading_annotations (
			id, reading_item_id, user_id, kind, vocab_entry_id, selected_text, anchor_start, anchor_end
		 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		[
			annotationId,
			data.readingItemId,
			userId,
			data.kind,
			data.vocabEntryId ?? null,
			data.selectedText,
			data.anchorStart,
			data.anchorEnd,
		]
	);

	return getReadingAnnotationByIdForUser(annotationId, userId);
}

export async function updateReadingAnnotationForUser(
	annotationId: string,
	userId: string,
	updates: {
		kind?: ReadingAnnotationKind;
		vocabEntryId?: string | null;
		selectedText?: string;
		anchorStart?: number;
		anchorEnd?: number;
	}
) {
	const fields: string[] = [];
	const values: SqlValue[] = [];

	if (updates.kind !== undefined) {
		fields.push("kind = ?");
		values.push(updates.kind);
	}
	if (updates.vocabEntryId !== undefined) {
		fields.push("vocab_entry_id = ?");
		values.push(updates.vocabEntryId);
	}
	if (updates.selectedText !== undefined) {
		fields.push("selected_text = ?");
		values.push(updates.selectedText);
	}
	if (updates.anchorStart !== undefined) {
		fields.push("anchor_start = ?");
		values.push(updates.anchorStart);
	}
	if (updates.anchorEnd !== undefined) {
		fields.push("anchor_end = ?");
		values.push(updates.anchorEnd);
	}

	if (fields.length === 0) {
		return getReadingAnnotationByIdForUser(annotationId, userId);
	}

	values.push(annotationId, userId);

	const result = await executeStatement(
		`UPDATE reading_annotations
		 SET ${fields.join(", ")}
		 WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
		values
	);

	if (result.affectedRows === 0) return null;

	return getReadingAnnotationByIdForUser(annotationId, userId);
}

export async function softDeleteReadingAnnotationForUser(
	annotationId: string,
	readingItemId: string,
	userId: string
) {
	const result = await executeStatement(
		`UPDATE reading_annotations
		 SET deleted_at = UTC_TIMESTAMP()
		 WHERE id = ? AND reading_item_id = ? AND user_id = ? AND deleted_at IS NULL`,
		[annotationId, readingItemId, userId]
	);

	return result.affectedRows > 0;
}

async function attachLatestContextsToReviewCards(cards: ReadingReviewCardRecord[]) {
	if (cards.length === 0) return cards;

	const placeholders = cards.map(() => "?").join(", ");
	const rows = await queryRows<LatestReviewContextRow[]>(
		`SELECT ra.vocab_entry_id,
		        ra.id AS annotation_id,
		        ra.reading_item_id,
		        ri.title AS reading_item_title,
		        ra.selected_text,
		        ra.anchor_start,
		        ra.anchor_end,
		        ri.content_text
		 FROM reading_annotations ra
		 INNER JOIN reading_items ri
		   ON ri.id = ra.reading_item_id
		  AND ri.deleted_at IS NULL
		 WHERE ra.deleted_at IS NULL
		   AND ra.vocab_entry_id IN (${placeholders})
		 ORDER BY ra.created_at DESC`,
		cards.map((card) => card.vocabEntryId)
	);

	const contextByVocab = new Map<string, LatestReviewContextRow>();
	for (const row of rows) {
		if (!contextByVocab.has(row.vocab_entry_id)) {
			contextByVocab.set(row.vocab_entry_id, row);
		}
	}

	return cards.map((card) => {
		const context = contextByVocab.get(card.vocabEntryId);
		if (!context) return card;

		return {
			...card,
			contextAnnotationId: context.annotation_id,
			contextReadingItemId: context.reading_item_id,
			contextReadingItemTitle: context.reading_item_title,
			contextSnippet: createContextSnippet(context.content_text, context.anchor_start, context.anchor_end),
		};
	});
}

export async function listReadingStudyCardsForUser(userId: string) {
	const rows = await queryRows<ReadingReviewCardRow[]>(
		`SELECT rrc.id, rrc.user_id, rrc.vocab_entry_id, rrc.review_state, rrc.interval_days,
		        rrc.due_at, rrc.last_reviewed_at, rrc.review_count, rrc.lapse_count,
		        rrc.created_at, rrc.updated_at, rrc.deleted_at,
		        v.text AS vocab_text, v.gloss_cn AS vocab_gloss_cn, v.kind AS vocab_kind, v.note_text AS vocab_note_text,
		        v.mastery_state AS vocab_mastery_state
		 FROM reading_review_cards rrc
		 INNER JOIN vocab_entries v
		   ON v.id = rrc.vocab_entry_id
		  AND v.deleted_at IS NULL
		 WHERE rrc.user_id = ? AND rrc.deleted_at IS NULL
		 ORDER BY
		   CASE WHEN rrc.due_at <= UTC_TIMESTAMP() THEN 0 ELSE 1 END ASC,
		   rrc.due_at ASC,
		   rrc.updated_at DESC,
		   rrc.created_at DESC`,
		[userId]
	);

	const cards = await attachLatestContextsToReviewCards(rows.map(mapReadingReviewCard));
	const now = Date.now();

	return cards.map((card): ReadingStudyCard => ({
		...card,
		isDue: new Date(card.dueAt).getTime() <= now,
	}));
}

export async function getReviewCardByIdForUser(cardId: string, userId: string) {
	const rows = await queryRows<ReadingReviewCardRow[]>(
		`SELECT rrc.id, rrc.user_id, rrc.vocab_entry_id, rrc.review_state, rrc.interval_days,
		        rrc.due_at, rrc.last_reviewed_at, rrc.review_count, rrc.lapse_count,
		        rrc.created_at, rrc.updated_at, rrc.deleted_at,
		        v.text AS vocab_text, v.gloss_cn AS vocab_gloss_cn, v.kind AS vocab_kind, v.note_text AS vocab_note_text,
		        v.mastery_state AS vocab_mastery_state
		 FROM reading_review_cards rrc
		 INNER JOIN vocab_entries v
		   ON v.id = rrc.vocab_entry_id
		  AND v.deleted_at IS NULL
		 WHERE rrc.id = ? AND rrc.user_id = ? AND rrc.deleted_at IS NULL
		 LIMIT 1`,
		[cardId, userId]
	);

	if (!rows[0]) return null;

	const [card] = await attachLatestContextsToReviewCards([mapReadingReviewCard(rows[0])]);
	return card ?? null;
}

export async function createReviewCardForVocabEntry(userId: string, vocabEntryId: string) {
	const existingRows = await queryRows<ReadingReviewCardRow[]>(
		`SELECT rrc.id, rrc.user_id, rrc.vocab_entry_id, rrc.review_state, rrc.interval_days,
		        rrc.due_at, rrc.last_reviewed_at, rrc.review_count, rrc.lapse_count,
		        rrc.created_at, rrc.updated_at, rrc.deleted_at,
		        v.text AS vocab_text, v.gloss_cn AS vocab_gloss_cn, v.kind AS vocab_kind, v.note_text AS vocab_note_text,
		        v.mastery_state AS vocab_mastery_state
		 FROM reading_review_cards rrc
		 INNER JOIN vocab_entries v
		   ON v.id = rrc.vocab_entry_id
		 WHERE rrc.vocab_entry_id = ? AND rrc.user_id = ?
		 LIMIT 1`,
		[vocabEntryId, userId]
	);

	const existing = existingRows[0];
	if (existing && existing.deleted_at === null) {
		return getReviewCardByIdForUser(existing.id, userId);
	}

	const schedule = createInitialReviewSchedule();
	if (existing) {
		await executeStatement(
			`UPDATE reading_review_cards
			 SET deleted_at = NULL,
			     review_state = ?,
			     interval_days = ?,
			     due_at = ?,
			     last_reviewed_at = NULL,
			     review_count = ?,
			     lapse_count = ?,
			     updated_at = UTC_TIMESTAMP()
			 WHERE id = ? AND user_id = ?`,
			[
				schedule.reviewState,
				schedule.intervalDays,
				new Date(schedule.dueAt),
				schedule.reviewCount,
				schedule.lapseCount,
				existing.id,
				userId,
			]
		);

		return getReviewCardByIdForUser(existing.id, userId);
	}

	const cardId = randomUUID();
	await executeStatement(
		`INSERT INTO reading_review_cards (
			id, user_id, vocab_entry_id, review_state, interval_days, due_at,
			review_count, lapse_count
		 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		[
			cardId,
			userId,
			vocabEntryId,
			schedule.reviewState,
			schedule.intervalDays,
			new Date(schedule.dueAt),
			schedule.reviewCount,
			schedule.lapseCount,
		]
	);

	return getReviewCardByIdForUser(cardId, userId);
}

export async function gradeReviewCardForUser(cardId: string, userId: string, grade: ReviewGrade) {
	const current = await getReviewCardByIdForUser(cardId, userId);
	if (!current) return null;

	const schedule = computeNextReviewSchedule(
		{
			reviewState: current.reviewState,
			intervalDays: current.intervalDays,
			reviewCount: current.reviewCount,
			lapseCount: current.lapseCount,
		},
		grade
	);

	await executeStatement(
		`UPDATE reading_review_cards
		 SET review_state = ?, interval_days = ?, due_at = ?, last_reviewed_at = UTC_TIMESTAMP(),
		     review_count = ?, lapse_count = ?, updated_at = UTC_TIMESTAMP()
		 WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
		[
			schedule.reviewState,
			schedule.intervalDays,
			new Date(schedule.dueAt),
			schedule.reviewCount,
			schedule.lapseCount,
			cardId,
			userId,
		]
	);

	return getReviewCardByIdForUser(cardId, userId);
}

export async function getReviewForecastForUser(userId: string): Promise<ReviewForecast> {
	const [overdueRows, within7Rows, within30Rows] = await Promise.all([
		queryRows<CountRow[]>(
			`SELECT COUNT(*) AS count
			 FROM reading_review_cards
			 WHERE user_id = ? AND deleted_at IS NULL AND due_at <= UTC_TIMESTAMP()`,
			[userId]
		),
		queryRows<CountRow[]>(
			`SELECT COUNT(*) AS count
			 FROM reading_review_cards
			 WHERE user_id = ? AND deleted_at IS NULL
			   AND due_at <= DATE_ADD(UTC_TIMESTAMP(), INTERVAL 7 DAY)`,
			[userId]
		),
		queryRows<CountRow[]>(
			`SELECT COUNT(*) AS count
			 FROM reading_review_cards
			 WHERE user_id = ? AND deleted_at IS NULL
			   AND due_at <= DATE_ADD(UTC_TIMESTAMP(), INTERVAL 30 DAY)`,
			[userId]
		),
	]);

	return {
		overdue: overdueRows[0]?.count ?? 0,
		within7Days: within7Rows[0]?.count ?? 0,
		within30Days: within30Rows[0]?.count ?? 0,
	};
}
