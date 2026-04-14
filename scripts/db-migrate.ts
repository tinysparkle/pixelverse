import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import mysql from "mysql2/promise";

loadEnvConfig(process.cwd());

type MigrationRow = {
	filename: string;
};

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

async function ensureMigrationsTable(connection: mysql.Connection) {
	await connection.query(`
		CREATE TABLE IF NOT EXISTS schema_migrations (
			id BIGINT NOT NULL AUTO_INCREMENT,
			filename VARCHAR(255) NOT NULL,
			executed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
			PRIMARY KEY (id),
			UNIQUE KEY uk_schema_migrations_filename (filename)
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
	`);
}

async function getExecutedMigrations(connection: mysql.Connection) {
	const [rows] = await connection.query<mysql.RowDataPacket[]>(
		`SELECT filename FROM schema_migrations ORDER BY id ASC`
	);

	return new Set((rows as MigrationRow[]).map((row) => row.filename));
}

async function getMigrationFiles(migrationsDir: string) {
	const entries = await readdir(migrationsDir, { withFileTypes: true });
	return entries
		.filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
		.map((entry) => entry.name)
		.sort((a, b) => a.localeCompare(b));
}

async function applyMigration(
	connection: mysql.Connection,
	migrationsDir: string,
	filename: string
) {
	const migrationPath = path.join(migrationsDir, filename);
	const sql = await readFile(migrationPath, "utf8");

	console.log(`→ 执行迁移: ${filename}`);
	await connection.beginTransaction();
	try {
		await connection.query(sql);
		await connection.execute(`INSERT INTO schema_migrations (filename) VALUES (?)`, [filename]);
		await connection.commit();
		console.log(`✓ 完成迁移: ${filename}`);
	} catch (error) {
		await connection.rollback();
		throw error;
	}
}

async function main() {
	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) {
		throw new Error("DATABASE_URL 未配置。请先复制 .env.example 为 .env.local 并填写 MySQL 连接。");
	}

	const migrationsDir = path.join(process.cwd(), "migrations");
	const connection = await mysql.createConnection({
		...parseDatabaseUrl(databaseUrl),
		charset: "utf8mb4",
		multipleStatements: true,
		timezone: "Z",
	});

	try {
		await ensureMigrationsTable(connection);
		const files = await getMigrationFiles(migrationsDir);
		const executed = await getExecutedMigrations(connection);

		const pending = files.filter((file) => !executed.has(file));
		if (pending.length === 0) {
			console.log("没有待执行的迁移。");
			return;
		}

		for (const filename of pending) {
			await applyMigration(connection, migrationsDir, filename);
		}

		console.log(`迁移完成，共执行 ${pending.length} 条。`);
	} finally {
		await connection.end();
	}
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
