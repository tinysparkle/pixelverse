/** Wrangler bindings + secrets（参见 wrangler.toml） */
export interface Env {
	AI: Ai;
	SHARED_SECRET: string;
	PIXELVERSE_BASE_URL: string;
	INGEST_SECRET: string;
}
