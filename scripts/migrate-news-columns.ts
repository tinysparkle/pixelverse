import { loadEnvConfig } from "@next/env";
import mysql from "mysql2/promise";

loadEnvConfig(process.cwd());

async function main() {
	const url = new URL(process.env.DATABASE_URL!);
	const conn = await mysql.createConnection({
		host: url.hostname,
		port: Number(url.port) || 3306,
		user: decodeURIComponent(url.username),
		password: decodeURIComponent(url.password),
		database: url.pathname.replace(/^\//, ""),
		charset: "utf8mb4",
		multipleStatements: true,
	});

	try {
		const [colRows] = await conn.query<mysql.RowDataPacket[]>(
		`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
		 WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'news_items'
		 AND COLUMN_NAME IN ('search_keyword', 'expires_at')`,
		[url.pathname.replace(/^\//, "")]
	);
	const existingCols = new Set((colRows as { COLUMN_NAME: string }[]).map((r) => r.COLUMN_NAME));

	const alters: string[] = [];
	if (!existingCols.has("search_keyword")) alters.push("ADD COLUMN search_keyword VARCHAR(100) NULL AFTER tags");
	if (!existingCols.has("expires_at")) alters.push("ADD COLUMN expires_at DATETIME NULL AFTER published_at");

	if (alters.length > 0) {
		await conn.query(`ALTER TABLE news_items ${alters.join(", ")}`);
		console.log("✓ 字段已添加:", alters.join(", "));
	} else {
		console.log("  字段已存在，无需修改");
	}

		try {
			await conn.query("ALTER TABLE news_items ADD INDEX idx_news_expires (expires_at)");
			console.log("✓ 索引 idx_news_expires 已添加");
		} catch { console.log("  索引 idx_news_expires 已存在，跳过"); }

		try {
			await conn.query("ALTER TABLE news_items ADD INDEX idx_news_keyword (search_keyword)");
			console.log("✓ 索引 idx_news_keyword 已添加");
		} catch { console.log("  索引 idx_news_keyword 已存在，跳过"); }
	} finally {
		await conn.end();
	}
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
