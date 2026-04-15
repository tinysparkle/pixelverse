import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { cleanupExpiredNews, insertNewsItems } from "@/lib/db/queries";
import { verifyNewsIngestSecret } from "@/lib/news/ingest-auth";
import type { WorkerCollectedItem } from "@/lib/news/worker-client";

function normalizeIngestItem(item: Partial<WorkerCollectedItem>): WorkerCollectedItem {
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

/** Cloudflare Worker 推送采集结果（Bearer NEWS_INGEST_SECRET） */
export async function POST(req: NextRequest) {
	if (!verifyNewsIngestSecret(req)) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	let body: unknown;
	try {
		body = await req.json();
	} catch {
		return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
	}

	const data = body as { items?: unknown[] };
	const rawItems = Array.isArray(data.items) ? data.items : [];
	const items = rawItems.map((row) => normalizeIngestItem(row as Partial<WorkerCollectedItem>));
	const validItems = items.filter((item) => item.id && item.sourceUrl);

	const insertedIds =
		validItems.length > 0 ? await insertNewsItems(validItems) : [];
	await cleanupExpiredNews();

	return NextResponse.json({
		ok: true,
		insertedCount: insertedIds.length,
		rawCount: typeof (data as { rawCount?: number }).rawCount === "number"
			? (data as { rawCount: number }).rawCount
			: validItems.length,
	});
}
