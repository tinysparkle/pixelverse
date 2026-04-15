import { collectAndFilterNews } from "./collector";
import { runScheduledIngest } from "./scheduled";
import type { CollectRequest, CollectResponse } from "./types";
import type { Env } from "./worker-env";

export type { Env } from "./worker-env";

const handler = {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname === "/" || url.pathname === "/health") {
			return Response.json({
				ok: true,
				service: "news-collector",
				endpoints: [
					"GET /health",
					"POST /api/collect",
					"scheduled: push to PIXELVERSE_BASE_URL",
					"sources: google-news, bing-news, hacker-news, ithome-rss, 36kr-rss",
				],
				note: "POST /api/collect requires Authorization: Bearer <SHARED_SECRET>",
			});
		}

		if (url.pathname === "/api/collect" && request.method === "POST") {
			const authHeader = request.headers.get("Authorization");
			if (authHeader !== `Bearer ${env.SHARED_SECRET}`) {
				return new Response("Unauthorized", { status: 401 });
			}

			let payload: CollectRequest;
			try {
				payload = await request.json();
				if (!payload || !Array.isArray(payload.keywords)) {
					return new Response("Invalid input: expected { keywords: string[] }", {
						status: 400,
					});
				}
			} catch {
				return new Response("Invalid JSON", { status: 400 });
			}

			const keywords = payload.keywords
				.map((item) => (typeof item === "string" ? item.trim() : ""))
				.filter(Boolean);

			if (keywords.length === 0) {
				const emptyResponse: CollectResponse = {
					items: [],
					rawCount: 0,
					filteredCount: 0,
					toolCalls: 0,
				};
				return Response.json(emptyResponse);
			}

			try {
				const collected = await collectAndFilterNews(env.AI, keywords);
				return Response.json(collected satisfies CollectResponse);
			} catch (err) {
				console.error("[collect] AI collection failed:", err);
				return new Response("AI collection failed", { status: 500 });
			}
		}

		return new Response("Not Found", { status: 404 });
	},

	async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
		ctx.waitUntil(runScheduledIngest(env));
	},
};

export default handler;
