import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
	cleanupExpiredNews,
	getNewsItemsByIdsForUser,
	getUserNewsKeywords,
	insertNewsItems,
} from "@/lib/db/queries";
import {
	buildNewsCollectRequest,
	requestNewsCollectFromWorker,
} from "@/lib/news/worker-client";

// 仅开发环境可用的手动触发刷新接口
export async function POST() {
	if (process.env.NODE_ENV !== "development") {
		return NextResponse.json({ error: "仅开发环境可用" }, { status: 403 });
	}

	const session = await auth();
	if (!session?.user?.id) {
		return NextResponse.json({ error: "未登录" }, { status: 401 });
	}

	const userId = session.user.id;

	const keywordRows = await getUserNewsKeywords(userId);
	const collectRequest = buildNewsCollectRequest(keywordRows);
	const enabledKeywordCount = keywordRows.filter((item) => item.enabled).length;

	if (collectRequest.keywords.length === 0) {
		console.info("[NewsRefresh] skip refresh", {
			userId,
			enabledKeywordCount,
			queryCount: collectRequest.keywords.length,
			reason: "no_keywords",
		});
		return NextResponse.json({ items: [], count: 0, reason: "no_keywords" });
	}

	let workerResult: Awaited<ReturnType<typeof requestNewsCollectFromWorker>>;
	try {
		workerResult = await requestNewsCollectFromWorker({
			workerUrl: process.env.CF_WORKER_URL ?? "",
			workerSecret: process.env.CF_WORKER_SECRET ?? "",
			keywords: collectRequest.keywords,
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : "未知错误";
		return NextResponse.json({ error: `采集失败: ${message}` }, { status: 500 });
	}

	const insertedIds =
		workerResult.items.length > 0 ? await insertNewsItems(workerResult.items) : [];

	await cleanupExpiredNews();

	const newItems = await getNewsItemsByIdsForUser(userId, insertedIds);
	console.info("[NewsRefresh] refresh summary", {
		userId,
		enabledKeywordCount,
		queryCount: collectRequest.keywords.length,
		rawCount: workerResult.rawCount,
		toolCalls: workerResult.toolCalls,
		filteredCount: workerResult.filteredCount,
		insertedCount: insertedIds.length,
		newCount: newItems.length,
	});
	return NextResponse.json({
		items: newItems,
		count: newItems.length,
		rawCount: workerResult.rawCount,
		toolCalls: workerResult.toolCalls,
		filteredCount: workerResult.filteredCount,
	});
}
