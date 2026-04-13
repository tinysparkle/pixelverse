import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import { executeStatement, queryRows, type SqlValue } from "@/lib/db";
import type { NoteRecord, NoteSummary, DeletedNoteSummary, UserRecord } from "@/lib/db/types";

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