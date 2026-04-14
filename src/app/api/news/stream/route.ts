import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
	cleanupExpiredNews,
	getNewsItemsByIdsForUser,
	getNewsItems,
	getUserNewsKeywords,
	insertNewsItems,
} from "@/lib/db/queries";
import {
	buildNewsCollectRequest,
	requestNewsCollectFromWorker,
} from "@/lib/news/worker-client";

const HEARTBEAT_INTERVAL_MS = 25 * 1000;
const DEFAULT_REFRESH_INTERVAL_MS = 10 * 60 * 1000;
const MIN_REFRESH_MINUTES = process.env.NODE_ENV === "development" ? 1 : 5;
const MAX_REFRESH_MINUTES = 60;
export async function GET(req: NextRequest) {
	const session = await auth();
	if (!session?.user?.id) {
		return NextResponse.json({ error: "未登录" }, { status: 401 });
	}

	const userId = session.user.id;
	const autoRefresh = req.nextUrl.searchParams.get("autoRefresh") === "1";
	const requestedMinutes = Number.parseInt(
		req.nextUrl.searchParams.get("intervalMinutes") ?? "",
		10
	);
	const intervalMinutes = Number.isFinite(requestedMinutes)
		? Math.min(MAX_REFRESH_MINUTES, Math.max(MIN_REFRESH_MINUTES, requestedMinutes))
		: DEFAULT_REFRESH_INTERVAL_MS / 60000;
	const refreshIntervalMs = intervalMinutes * 60 * 1000;
	const encoder = new TextEncoder();
	let refreshTimer: ReturnType<typeof setInterval> | undefined;
	let heartbeatTimer: ReturnType<typeof setInterval> | undefined;

	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			const sendEvent = (event: string, data: unknown) => {
				controller.enqueue(
					encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
				);
			};

			const sendHeartbeat = () => {
				controller.enqueue(encoder.encode(`: ping\n\n`));
			};

			const runRefresh = async () => {
				try {
					sendEvent("refreshing", { at: new Date().toISOString() });
					const keywordRows = await getUserNewsKeywords(userId);
					const collectRequest = buildNewsCollectRequest(keywordRows);
					const enabledKeywordCount = keywordRows.filter((item) => item.enabled).length;

					if (collectRequest.keywords.length === 0) {
						console.info("[NewsStream] skip refresh", {
							userId,
							enabledKeywordCount,
							queryCount: collectRequest.keywords.length,
							reason: "no_keywords",
						});
						await cleanupExpiredNews();
						sendEvent("update", {
							items: [],
							count: 0,
							reason: "no_keywords",
						});
						return;
					}

					const workerResult = await requestNewsCollectFromWorker({
						workerUrl: process.env.CF_WORKER_URL ?? "",
						workerSecret: process.env.CF_WORKER_SECRET ?? "",
						keywords: collectRequest.keywords,
					});
					let newItems = [] as Awaited<ReturnType<typeof getNewsItemsByIdsForUser>>;
					let insertedIds: string[] = [];

					if (workerResult.items.length > 0) {
						insertedIds = await insertNewsItems(workerResult.items);
						newItems = await getNewsItemsByIdsForUser(userId, insertedIds);
					}

					await cleanupExpiredNews();
					console.info("[NewsStream] refresh summary", {
						userId,
						enabledKeywordCount,
						queryCount: collectRequest.keywords.length,
						rawCount: workerResult.rawCount,
						toolCalls: workerResult.toolCalls,
						filteredCount: workerResult.filteredCount,
						insertedCount: insertedIds.length,
						newCount: newItems.length,
					});
					sendEvent("update", {
						items: newItems,
						count: newItems.length,
						rawCount: workerResult.rawCount,
						toolCalls: workerResult.toolCalls,
						filteredCount: workerResult.filteredCount,
					});
				} catch (err) {
					const message = err instanceof Error ? err.message : "未知错误";
					console.error("[NewsStream] refresh failed", {
						userId,
						message,
					});
					sendEvent("error", { message });
				}
			};

			(async () => {
				try {
					const items = await getNewsItems(userId, { limit: 100 });
					sendEvent("init", { items });
					if (autoRefresh) {
						await runRefresh();
					}
				} catch (err) {
					const message = err instanceof Error ? err.message : "未知错误";
					sendEvent("error", { message });
				}
			})();

			if (autoRefresh) {
				refreshTimer = setInterval(() => {
					void runRefresh();
				}, refreshIntervalMs);
			}

			heartbeatTimer = setInterval(() => {
				sendHeartbeat();
			}, HEARTBEAT_INTERVAL_MS);
		},
		cancel() {
			if (refreshTimer) clearInterval(refreshTimer);
			if (heartbeatTimer) clearInterval(heartbeatTimer);
		},
	});

	return new Response(stream, {
		headers: {
			"Content-Type": "text/event-stream; charset=utf-8",
			"Cache-Control": "no-cache, no-transform",
			Connection: "keep-alive",
			"X-Accel-Buffering": "no",
		},
	});
}
