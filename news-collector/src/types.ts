export interface NewsEntry {
	id: string;
	source: string;
	sourceUrl: string;
	title: string;
	titleZh?: string | null;
	summary?: string | null;
	summaryZh?: string | null;
	content?: string | null;
	relevanceScore: number;
	tags?: string[];
	publishedAt?: string | null;
	searchKeyword?: string | null;
}

export interface CollectRequest {
	keywords: string[];
}

export interface CollectResponse {
	items: NewsEntry[];
	rawCount: number;
	filteredCount: number;
	toolCalls: number;
}

export type CollectionTool = "google-news" | "bing-news" | "hacker-news";

export interface CollectionPlanStep {
	tool: CollectionTool;
	query: string;
	label: string;
	limit?: number;
}
