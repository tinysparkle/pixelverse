import mysql, { type Pool, type ResultSetHeader, type RowDataPacket } from "mysql2/promise";

export type SqlValue = string | number | boolean | Date | Buffer | null;

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

declare global {
	var __pixelversePool: Pool | undefined;
}

const poolConfig = {
	charset: "utf8mb4",
	connectionLimit: 10,
	queueLimit: 0,
	waitForConnections: true,
	timezone: "Z",
};

function getPool() {
	if (globalThis.__pixelversePool) {
		return globalThis.__pixelversePool;
	}

	const connectionString = process.env.DATABASE_URL;

	if (!connectionString) {
		throw new Error("DATABASE_URL 未配置。请先复制 .env.example 为 .env.local 并填写 MySQL 连接。");
	}

	const pool = mysql.createPool({
		...poolConfig,
		...parseDatabaseUrl(connectionString),
	});

	if (process.env.NODE_ENV !== "production") {
		globalThis.__pixelversePool = pool;
	}

	return pool;
}

export async function queryRows<T extends RowDataPacket[]>(sql: string, values: SqlValue[] = []) {
	const pool = getPool();
	const [rows] = await pool.query<T>(sql, values);
	return rows;
}

export async function executeStatement(sql: string, values: SqlValue[] = []) {
	const pool = getPool();
	const [result] = await pool.execute<ResultSetHeader>(sql, values);
	return result;
}

export async function closePool() {
	if (globalThis.__pixelversePool) {
		await globalThis.__pixelversePool.end();
		globalThis.__pixelversePool = undefined;
	}
}

export { getPool, parseDatabaseUrl };
