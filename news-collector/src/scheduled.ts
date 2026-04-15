import { collectAndFilterNews } from "./collector";
import type { CollectResponse } from "./types";
import type { Env } from "./worker-env";

export async function runScheduledIngest(env: Env): Promise<void> {
	const base = env.PIXELVERSE_BASE_URL?.trim().replace(/\/$/, "");
	const secret = env.INGEST_SECRET?.trim();
	if (!base || !secret) {
		console.error("[scheduled] Missing PIXELVERSE_BASE_URL or INGEST_SECRET");
		return;
	}

	const configRes = await fetch(`${base}/api/news/worker-config`, {
		headers: { Authorization: `Bearer ${secret}` },
		signal: AbortSignal.timeout(25000),
	});

	if (!configRes.ok) {
		console.error("[scheduled] worker-config failed", configRes.status);
		return;
	}

	const config = (await configRes.json()) as {
		pushEnabled?: boolean;
		keywords?: string[];
	};

	if (!config.pushEnabled) {
		console.info("[scheduled] push disabled, skip");
		return;
	}

	const keywords = Array.isArray(config.keywords)
		? config.keywords.map((k) => (typeof k === "string" ? k.trim() : "")).filter(Boolean)
		: [];

	if (keywords.length === 0) {
		console.info("[scheduled] no keywords, skip");
		return;
	}

	const collected = await collectAndFilterNews(env.AI, keywords);
	const body = JSON.stringify(collected satisfies CollectResponse);

	const ingestRes = await fetch(`${base}/api/news/ingest`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${secret}`,
			"Content-Type": "application/json",
		},
		body,
		signal: AbortSignal.timeout(120000),
	});

	if (!ingestRes.ok) {
		const errText = await ingestRes.text();
		console.error("[scheduled] ingest failed", ingestRes.status, errText);
	}
}
