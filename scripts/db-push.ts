import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import mysql from "mysql2/promise";

loadEnvConfig(process.cwd());

function parseDatabaseUrl(databaseUrl: string) {
	const url = new URL(databaseUrl);

	if (!["mysql:", "mysql2:"].includes(url.protocol)) {
		throw new Error("DATABASE_URL 必须使用 mysql:// 或 mysql2:// 协议。");
	}

	const database = url.pathname.replace(/^\//, "");

	if (!database) {
		throw new Error("DATABASE_URL 缺少数据库名。");
	}

	return {
		host: url.hostname,
		port: url.port ? Number(url.port) : 3306,
		user: decodeURIComponent(url.username),
		password: decodeURIComponent(url.password),
		database,
	};
}

async function main() {
	const databaseUrl = process.env.DATABASE_URL;

	if (!databaseUrl) {
		throw new Error("DATABASE_URL 未配置。请先复制 .env.example 为 .env.local 并填写 MySQL 连接。");
	}

	const schemaPath = path.join(process.cwd(), "sql", "schema.sql");
	const schemaSql = await readFile(schemaPath, "utf8");
	const connection = await mysql.createConnection({
		...parseDatabaseUrl(databaseUrl),
		charset: "utf8mb4",
		multipleStatements: true,
		timezone: "Z",
	});

	try {
		await connection.query(schemaSql);
		console.log("MySQL schema applied: sql/schema.sql");
	} finally {
		await connection.end();
	}
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});