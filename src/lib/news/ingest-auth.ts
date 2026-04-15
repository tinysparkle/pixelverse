import type { NextRequest } from "next/server";

export function verifyNewsIngestSecret(request: NextRequest): boolean {
	const secret = process.env.NEWS_INGEST_SECRET?.trim();
	if (!secret) {
		return false;
	}
	const auth = request.headers.get("Authorization");
	return auth === `Bearer ${secret}`;
}
