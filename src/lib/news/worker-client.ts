import type { NewsKeywordRecord } from "@/lib/db/types";
import { fetchWithOptionalProxy } from "@/lib/net/fetch";

export type WorkerCollectedItem = {
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
	publishedAt?: string | null;
	searchKeyword?: string | null;
};

export type NewsCollectRequest = {
	keywords: string[];
};

export type NewsCollectResponse = {
	items: WorkerCollectedItem[];
	rawCount: number;
	filteredCount: number;
	toolCalls: number;
};

type FetchImpl = typeof fetchWithOptionalProxy;

export function buildNewsCollectRequest(
	keywords: Array<Pick<NewsKeywordRecord, "keyword" | "enabled">>
): NewsCollectRequest {
	const seen = new Set<string>();
	const normalizedKeywords: string[] = [];

	for (const item of keywords) {
		if (item.enabled === false) {
			continue;
		}

		const keyword = item.keyword.trim();
		if (!keyword) {
			continue;
		}

		const dedupeKey = keyword.toLowerCase();
		if (seen.has(dedupeKey)) {
			continue;
		}

		seen.add(dedupeKey);
		normalizedKeywords.push(keyword);
	}

	return { keywords: normalizedKeywords };
}

function normalizeCollectedItem(item: Partial<WorkerCollectedItem>): WorkerCollectedItem {
	return {
		id: item.id ?? "",
		source: item.source ?? "unknown",
		sourceUrl: item.sourceUrl ?? "",
		title: item.title ?? "",
		titleZh: item.titleZh ?? null,
		summary: item.summary ?? null,
		summaryZh: item.summaryZh ?? null,
		content: item.content ?? null,
		relevanceScore: item.relevanceScore ?? 0.6,
		tags: Array.isArray(item.tags) ? item.tags : [],
		publishedAt: item.publishedAt ?? null,
		searchKeyword: item.searchKeyword ?? null,
	};
}

export async function requestNewsCollectFromWorker(
	input: {
		workerUrl: string;
		workerSecret: string;
		keywords: string[];
	},
	fetchImpl: FetchImpl = fetchWithOptionalProxy
): Promise<NewsCollectResponse> {
	const workerUrl = input.workerUrl.trim();
	const workerSecret = input.workerSecret.trim();

	if (!workerUrl || !workerSecret) {
		throw new Error("热点抓取 Worker 未配置");
	}

	const payload = {
		keywords: input.keywords.map((keyword) => keyword.trim()).filter(Boolean),
	};

	if (payload.keywords.length === 0) {
		return {
			items: [],
			rawCount: 0,
			filteredCount: 0,
			toolCalls: 0,
		};
	}

	const url = new URL("/api/collect", workerUrl);
	const res = await fetchImpl(url.toString(), {
		method: "POST",
		headers: {
			Authorization: `Bearer ${workerSecret}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(payload),
		signal: AbortSignal.timeout(55000),
	});

	if (!res.ok) {
		const errText = await res.text();
		throw new Error(`Worker 抓取失败 ${res.status}: ${errText}`);
	}

	const data = (await res.json()) as Partial<NewsCollectResponse>;
	const items = Array.isArray(data.items)
		? data.items.map((item) => normalizeCollectedItem(item))
		: [];

	return {
		items,
		rawCount: typeof data.rawCount === "number" ? data.rawCount : items.length,
		filteredCount:
			typeof data.filteredCount === "number" ? data.filteredCount : items.length,
		toolCalls: typeof data.toolCalls === "number" ? data.toolCalls : 0,
	};
}

export async function collectNewsViaWorker(
	input: {
		workerUrl: string;
		workerSecret: string;
		keywords: string[];
	},
	fetchImpl: FetchImpl = fetchWithOptionalProxy
) {
	const result = await requestNewsCollectFromWorker(input, fetchImpl);
	return result.items;
}
