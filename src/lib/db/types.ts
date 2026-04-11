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