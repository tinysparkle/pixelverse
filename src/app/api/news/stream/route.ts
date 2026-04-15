import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { cleanupExpiredNews, getNewsItems } from "@/lib/db/queries";

const HEARTBEAT_INTERVAL_MS = 25 * 1000;
/** 仅轮询数据库以合并 Worker 已写入的新条目（不访问境外 Worker） */
const DB_POLL_INTERVAL_MS = 2 * 60 * 1000;

export async function GET(req: NextRequest) {
	const session = await auth();
	if (!session?.user?.id) {
		return NextResponse.json({ error: "未登录" }, { status: 401 });
	}

	const userId = session.user.id;
	const autoRefresh = req.nextUrl.searchParams.get("autoRefresh") === "1";
	const encoder = new TextEncoder();
	let refreshTimer: ReturnType<typeof setInterval> | undefined;
	let heartbeatTimer: ReturnType<typeof setInterval> | undefined;

	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			const knownItemIds = new Set<string>();

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
					await cleanupExpiredNews();
					const allItems = await getNewsItems(userId, { limit: 100 });
					const newItems = allItems.filter((item) => !knownItemIds.has(item.id));
					for (const item of allItems) {
						knownItemIds.add(item.id);
					}

					console.info("[NewsStream] db poll", {
						userId,
						total: allItems.length,
						newCount: newItems.length,
					});
					sendEvent("update", {
						items: newItems,
						count: newItems.length,
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
					for (const item of items) {
						knownItemIds.add(item.id);
					}
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
				}, DB_POLL_INTERVAL_MS);
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
