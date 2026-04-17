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

export type ReadingSourceType = "ai";
export type ReadingLevel = "cet4" | "b1" | "b2";
export type ReadingLengthBucket = "short" | "medium" | "long";
export type ReadingStatus = "new" | "reading" | "reviewed" | "trained";
export type VocabEntryKind = "word" | "phrase";
export type VocabMasteryState = "new" | "learning" | "known";
export type ReadingAnnotationKind = VocabEntryKind;
export type ReadingPracticeType = "vocab" | "grammar" | "mixed";
export type ReviewState = "new" | "learning" | "review" | "relearning";
export type ReviewGrade = "again" | "hard" | "good" | "easy";

export interface ReadingItemRecord {
	id: string;
	userId: string;
	title: string;
	sourceType: ReadingSourceType;
	topic: string;
	level: ReadingLevel;
	lengthBucket: ReadingLengthBucket;
	status: ReadingStatus;
	generationPromptJson: string | null;
	contentText: string;
	contentJson: string | null;
	wordCount: number;
	createdAt: string;
	updatedAt: string;
	deletedAt: string | null;
}

export interface ReadingItemSummary {
	id: string;
	title: string;
	topic: string;
	level: ReadingLevel;
	lengthBucket: ReadingLengthBucket;
	status: ReadingStatus;
	wordCount: number;
	updatedAt: string;
	excerpt: string;
}

export interface VocabEntryRecord {
	id: string;
	userId: string;
	kind: VocabEntryKind;
	text: string;
	normalizedText: string;
	glossCn: string | null;
	noteText: string | null;
	masteryState: VocabMasteryState;
	createdAt: string;
	updatedAt: string;
	deletedAt: string | null;
}

export interface VocabSummary {
	id: string;
	kind: VocabEntryKind;
	text: string;
	glossCn: string | null;
	noteText: string | null;
	masteryState: VocabMasteryState;
	articleCount: number;
	occurrenceCount: number;
	lastAnnotatedAt: string | null;
	updatedAt: string;
}

export interface VocabContext {
	annotationId: string;
	readingItemId: string;
	readingItemTitle: string;
	selectedText: string;
	anchorStart: number;
	anchorEnd: number;
	snippet: string;
	createdAt: string;
}

export interface ReadingAnnotationRecord {
	id: string;
	readingItemId: string;
	userId: string;
	kind: ReadingAnnotationKind;
	vocabEntryId: string | null;
	selectedText: string;
	anchorStart: number;
	anchorEnd: number;
	createdAt: string;
	deletedAt: string | null;
	vocabText: string | null;
	vocabGlossCn: string | null;
	vocabKind: VocabEntryKind | null;
	vocabNoteText: string | null;
	vocabMasteryState: VocabMasteryState | null;
}

export interface ReadingPracticeRecord {
	id: string;
	readingItemId: string;
	userId: string;
	practiceType: ReadingPracticeType;
	questionJson: string;
	resultJson: string | null;
	score: number | null;
	createdAt: string;
	updatedAt: string;
	deletedAt: string | null;
}

export interface ReadingReviewCardRecord {
	id: string;
	userId: string;
	vocabEntryId: string;
	reviewState: ReviewState;
	intervalDays: number;
	dueAt: string;
	lastReviewedAt: string | null;
	reviewCount: number;
	lapseCount: number;
	createdAt: string;
	updatedAt: string;
	deletedAt: string | null;
	vocabText: string;
	vocabGlossCn: string | null;
	vocabKind: VocabEntryKind;
	vocabNoteText: string | null;
	vocabMasteryState: VocabMasteryState;
	contextAnnotationId: string | null;
	contextReadingItemId: string | null;
	contextReadingItemTitle: string | null;
	contextSnippet: string | null;
}

export interface ReviewForecast {
	within7Days: number;
	within30Days: number;
	overdue: number;
}
