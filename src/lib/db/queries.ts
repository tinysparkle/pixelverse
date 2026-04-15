import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import { executeStatement, queryRows, type SqlValue } from "@/lib/db";
import type { NoteRecord, NoteSummary, DeletedNoteSummary, UserRecord, TaskRecord, TaskSummary, TaskPriority, NewsItemRecord, NewsItemSummary, NewsKeywordRecord, NewsItemDetail } from "@/lib/db/types";

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

function toIsoString(value: Date | string | null) {
	if (!value) {
		return null;
	}

	if (value instanceof Date) {
		return value.toISOString();
	}

	return new Date(value).toISOString();
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

function escapeLike(value: string) {
	return value.replace(/[\\%_]/g, "\\$&");
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

/* ── Tasks ── */

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

function parseTags(raw: string | null): string[] {
	if (!raw) return [];
	return raw.split(",").map((t) => t.trim()).filter(Boolean);
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

/* ── News ── */

type NewsRow = RowDataPacket & {
	id: string;
	source: string;
	source_url: string;
	title: string;
	title_zh: string | null;
	summary: string | null;
	summary_zh: string | null;
	content: string | null;
	relevance_score: number;
	tags: string | null;
	search_keyword: string | null;
	published_at: Date | string | null;
	expires_at: Date | string | null;
	fetched_at: Date | string;
	created_at: Date | string;
	is_read?: number;
};

type NewsKeywordRow = RowDataPacket & {
	id: string;
	user_id: string;
	keyword: string;
	enabled: number;
	created_at: Date | string;
};

function mapNewsItem(row: NewsRow): NewsItemRecord {
	return {
		id: row.id,
		source: row.source,
		sourceUrl: row.source_url,
		title: row.title,
		titleZh: row.title_zh,
		summary: row.summary,
		summaryZh: row.summary_zh,
		content: row.content,
		relevanceScore: Number(row.relevance_score),
		tags: parseTags(row.tags),
		searchKeyword: row.search_keyword ?? null,
		publishedAt: toIsoString(row.published_at),
		expiresAt: toIsoString(row.expires_at),
		fetchedAt: toIsoString(row.fetched_at) ?? new Date().toISOString(),
		createdAt: toIsoString(row.created_at) ?? new Date().toISOString(),
	};
}

function mapNewsKeyword(row: NewsKeywordRow): NewsKeywordRecord {
	return {
		id: row.id,
		userId: row.user_id,
		keyword: row.keyword,
		enabled: row.enabled === 1,
		createdAt: toIsoString(row.created_at) ?? new Date().toISOString(),
	};
}

export async function insertNewsItems(
	items: Array<{
		id: string;
		source: string;
		sourceUrl: string;
		title: string;
		titleZh?: string | null;
		summary?: string | null;
		summaryZh?: string | null;
		content?: string | null;
		relevanceScore?: number;
		tags?: string[];
		searchKeyword?: string | null;
		publishedAt?: string | null;
	}>
) {
	const insertedIds: string[] = [];
	// 7天后过期
	const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
		.toISOString()
		.slice(0, 19)
		.replace("T", " ");
	for (const item of items) {
		const tagsStr = item.tags?.length ? item.tags.join(",") : null;
		try {
			const result = await executeStatement(
				`INSERT IGNORE INTO news_items (id, source, source_url, title, title_zh, summary, summary_zh, content, relevance_score, tags, search_keyword, published_at, expires_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				[
					item.id,
					item.source,
					item.sourceUrl,
					item.title,
					item.titleZh ?? null,
					item.summary ?? null,
					item.summaryZh ?? null,
					item.content ?? null,
					item.relevanceScore ?? 0,
					tagsStr,
					item.searchKeyword ?? null,
					item.publishedAt ?? null,
					expiresAt,
				]
			);
			if (result.affectedRows > 0) {
				insertedIds.push(item.id);
			}
		} catch {
			// duplicate source_url, skip
		}
	}
	return insertedIds;
}

export async function getNewsItemsByIdsForUser(userId: string, ids: string[]) {
	if (ids.length === 0) {
		return [];
	}

	const placeholders = ids.map(() => "?").join(", ");
	const rows = await queryRows<NewsRow[]>(
		`SELECT n.id, n.source, n.source_url, n.title, n.title_zh, n.summary, n.summary_zh,
		        n.relevance_score, n.tags, n.search_keyword, n.published_at, n.fetched_at, n.created_at,
		        CASE WHEN r.news_id IS NOT NULL THEN 1 ELSE 0 END AS is_read
		 FROM news_items n
		 LEFT JOIN news_read r ON r.news_id = n.id AND r.user_id = ?
		 WHERE n.id IN (${placeholders})
		 ORDER BY n.published_at DESC, n.fetched_at DESC`,
		[userId, ...ids]
	);

	return rows.map((row): NewsItemSummary => {
		const item = mapNewsItem(row);
		return {
			id: item.id,
			source: item.source,
			sourceUrl: item.sourceUrl,
			title: item.title,
			titleZh: item.titleZh,
			summary: item.summary,
			summaryZh: item.summaryZh,
			relevanceScore: item.relevanceScore,
			tags: item.tags,
			searchKeyword: item.searchKeyword,
			publishedAt: item.publishedAt,
			read: row.is_read === 1,
		};
	});
}

export async function getNewsItems(
	userId: string,
	filters?: {
		keyword?: string;
		source?: string;
		unread?: boolean;
		limit?: number;
		offset?: number;
	}
) {
	const conditions: string[] = [];
	const values: SqlValue[] = [userId];

	if (filters?.keyword) {
		const pattern = `%${escapeLike(filters.keyword)}%`;
		conditions.push(
			"(n.title LIKE ? ESCAPE '\\\\' OR n.title_zh LIKE ? ESCAPE '\\\\' OR n.summary LIKE ? ESCAPE '\\\\' OR n.summary_zh LIKE ? ESCAPE '\\\\' OR n.tags LIKE ? ESCAPE '\\\\' OR n.search_keyword LIKE ? ESCAPE '\\\\')"
		);
		values.push(pattern, pattern, pattern, pattern, pattern, pattern);
	}

	if (filters?.source) {
		conditions.push("n.source = ?");
		values.push(filters.source);
	}

	if (filters?.unread) {
		conditions.push("r.news_id IS NULL");
	}

	const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
	const limit = filters?.limit ?? 50;
	const offset = filters?.offset ?? 0;

	const rows = await queryRows<NewsRow[]>(
		`SELECT n.id, n.source, n.source_url, n.title, n.title_zh, n.summary, n.summary_zh,
		        n.relevance_score, n.tags, n.search_keyword, n.published_at, n.fetched_at, n.created_at,
		        CASE WHEN r.news_id IS NOT NULL THEN 1 ELSE 0 END AS is_read
		 FROM news_items n
		 LEFT JOIN news_read r ON r.news_id = n.id AND r.user_id = ?
		 ${where}
		 ORDER BY n.published_at DESC, n.fetched_at DESC
		 LIMIT ${limit} OFFSET ${offset}`,
		values
	);

	return rows.map((row): NewsItemSummary => {
		const item = mapNewsItem(row);
		return {
			id: item.id,
			source: item.source,
			sourceUrl: item.sourceUrl,
			title: item.title,
			titleZh: item.titleZh,
			summary: item.summary,
			summaryZh: item.summaryZh,
			relevanceScore: item.relevanceScore,
			tags: item.tags,
			searchKeyword: item.searchKeyword,
			publishedAt: item.publishedAt,
			read: row.is_read === 1,
		};
	});
}

export async function getNewsItemByIdForUser(newsId: string, userId: string) {
	const rows = await queryRows<NewsRow[]>(
		`SELECT n.id, n.source, n.source_url, n.title, n.title_zh, n.summary, n.summary_zh,
		        n.content, n.relevance_score, n.tags, n.search_keyword, n.published_at, n.fetched_at, n.created_at,
		        CASE WHEN r.news_id IS NOT NULL THEN 1 ELSE 0 END AS is_read
		 FROM news_items n
		 LEFT JOIN news_read r ON r.news_id = n.id AND r.user_id = ?
		 WHERE n.id = ?
		 LIMIT 1`,
		[userId, newsId]
	);

	if (!rows[0]) {
		return null;
	}

	const item = mapNewsItem(rows[0]);
	return {
		id: item.id,
		source: item.source,
		sourceUrl: item.sourceUrl,
		title: item.title,
		titleZh: item.titleZh,
		summary: item.summary,
		summaryZh: item.summaryZh,
		content: item.content,
		relevanceScore: item.relevanceScore,
		tags: item.tags,
		searchKeyword: item.searchKeyword,
		publishedAt: item.publishedAt,
		fetchedAt: item.fetchedAt,
		createdAt: item.createdAt,
		read: rows[0].is_read === 1,
	} satisfies NewsItemDetail;
}

export async function markNewsAsRead(newsId: string, userId: string) {
	await executeStatement(
		`INSERT IGNORE INTO news_read (user_id, news_id) VALUES (?, ?)`,
		[userId, newsId]
	);
}

export async function cleanupExpiredNews() {
	const result = await executeStatement(
		`DELETE FROM news_items WHERE expires_at IS NOT NULL AND expires_at < NOW()`
	);
	return result.affectedRows;
}

export async function getNewItemsSince(userId: string, since: Date) {
	const sinceStr = since.toISOString().slice(0, 19).replace("T", " ");
	const rows = await queryRows<NewsRow[]>(
		`SELECT n.id, n.source, n.source_url, n.title, n.title_zh, n.summary, n.summary_zh,
		        n.relevance_score, n.tags, n.search_keyword, n.published_at, n.fetched_at, n.created_at,
		        CASE WHEN r.news_id IS NOT NULL THEN 1 ELSE 0 END AS is_read
		 FROM news_items n
		 LEFT JOIN news_read r ON r.news_id = n.id AND r.user_id = ?
		 WHERE n.created_at > ?
		 ORDER BY n.published_at DESC, n.fetched_at DESC`,
		[userId, sinceStr]
	);

	return rows.map((row): NewsItemSummary => {
		const item = mapNewsItem(row);
		return {
			id: item.id,
			source: item.source,
			sourceUrl: item.sourceUrl,
			title: item.title,
			titleZh: item.titleZh,
			summary: item.summary,
			summaryZh: item.summaryZh,
			relevanceScore: item.relevanceScore,
			tags: item.tags,
			searchKeyword: item.searchKeyword,
			publishedAt: item.publishedAt,
			read: row.is_read === 1,
		};
	});
}

export async function getUserNewsKeywords(userId: string) {
	const rows = await queryRows<NewsKeywordRow[]>(
		`SELECT id, user_id, keyword, enabled, created_at
		 FROM news_keywords
		 WHERE user_id = ?
		 ORDER BY created_at ASC`,
		[userId]
	);
	return rows.map(mapNewsKeyword);
}

export async function upsertNewsKeyword(userId: string, keyword: string) {
	const id = randomUUID();
	await executeStatement(
		`INSERT INTO news_keywords (id, user_id, keyword)
		 VALUES (?, ?, ?)
		 ON DUPLICATE KEY UPDATE enabled = 1`,
		[id, userId, keyword]
	);
	return getUserNewsKeywords(userId);
}

export async function deleteNewsKeyword(keywordId: string, userId: string) {
	const result = await executeStatement(
		`DELETE FROM news_keywords WHERE id = ? AND user_id = ?`,
		[keywordId, userId]
	);
	return result.affectedRows > 0;
}

type KeywordUnionRow = RowDataPacket & { keyword: string };

type NewsSettingsRow = RowDataPacket & { push_enabled: number };

/** 全体用户已启用关键词并集，大小写去重规则与 buildNewsCollectRequest 一致 */
export async function getUnionEnabledNewsKeywordsDeduped(): Promise<string[]> {
	const rows = await queryRows<KeywordUnionRow[]>(
		`SELECT keyword FROM news_keywords WHERE enabled = 1`
	);
	const seen = new Set<string>();
	const out: string[] = [];
	for (const row of rows) {
		const k = row.keyword.trim();
		if (!k) continue;
		const key = k.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(k);
	}
	return out;
}

export async function getNewsPushEnabled(): Promise<boolean> {
	const rows = await queryRows<NewsSettingsRow[]>(
		`SELECT push_enabled FROM news_settings WHERE id = 1 LIMIT 1`
	);
	if (!rows[0]) {
		return true;
	}
	return rows[0].push_enabled === 1;
}

export async function setNewsPushEnabled(enabled: boolean) {
	await executeStatement(
		`INSERT INTO news_settings (id, push_enabled) VALUES (1, ?)
		 ON DUPLICATE KEY UPDATE push_enabled = VALUES(push_enabled)`,
		[enabled ? 1 : 0]
	);
}