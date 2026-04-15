import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getNewsPushEnabled, getUnionEnabledNewsKeywordsDeduped } from "@/lib/db/queries";
import { verifyNewsIngestSecret } from "@/lib/news/ingest-auth";

/** Cloudflare Worker 拉取：是否允许推送 + 全体启用关键词并集（Bearer NEWS_INGEST_SECRET） */
export async function GET(req: NextRequest) {
	if (!verifyNewsIngestSecret(req)) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const pushEnabled = await getNewsPushEnabled();
	const keywords = await getUnionEnabledNewsKeywordsDeduped();
	return NextResponse.json({ pushEnabled, keywords });
}
