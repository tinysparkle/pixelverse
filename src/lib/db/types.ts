export interface UserRecord {
	id: string;
	email: string;
	passwordHash: string;
	createdAt: string;
	updatedAt: string;
}

export interface NoteRecord {
	id: string;
	userId: string;
	title: string;
	contentJson: string | null;
	contentText: string;
	createdAt: string;
	updatedAt: string;
	deletedAt: string | null;
}

export interface NoteSummary {
	id: string;
	title: string;
	updatedAt: string;
	excerpt: string;
}

export interface DeletedNoteSummary {
	id: string;
	title: string;
	excerpt: string;
	deletedAt: string;
	updatedAt: string;
}

export type TaskPriority = "high" | "medium" | "low";

export interface TaskRecord {
	id: string;
	userId: string;
	title: string;
	description: string | null;
	dueDate: string | null;
	priority: TaskPriority;
	tags: string[];
	completedAt: string | null;
	createdAt: string;
	updatedAt: string;
	deletedAt: string | null;
}

export interface TaskSummary {
	id: string;
	title: string;
	dueDate: string | null;
	priority: TaskPriority;
	tags: string[];
	completedAt: string | null;
	updatedAt: string;
}
