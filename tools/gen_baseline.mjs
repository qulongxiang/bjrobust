// 从线上库导出 schema，生成 migrations/0001_baseline.sql（一次性工具，可保留）
// 用法：node tools/gen_baseline.mjs <schema.json> <idx.json> > migrations/0001_baseline.sql
import { readFileSync } from "node:fs";

const pick = (p) => {
	const raw = readFileSync(p, "utf8");
	const start = raw.indexOf("[");
	return JSON.parse(raw.slice(start))[0].results;
};
const tables = pick(process.argv[2]);
const others = pick(process.argv[3]);

const skip = new Set(["_cf_KV"]); // Cloudflare 内部表，不进迁移
const sqlish = (name) => /^sqlite_/.test(name);

const out = [];
out.push("-- migrations/0001_baseline.sql");
out.push("-- 由 tools/gen_baseline.mjs 从线上库 schema 导出，用于新库/新环境重建。");
out.push("-- 全部语句幂等（IF NOT EXISTS），可安全重复执行。");
out.push("");

for (const t of tables) {
	if (!t.sql || skip.has(t.name) || sqlish(t.name)) continue;
	const ddl = t.sql
		.replace(/^CREATE TABLE\s+/i, "CREATE TABLE IF NOT EXISTS ")
		.replace(/^CREATE VIRTUAL TABLE\s+/i, "CREATE VIRTUAL TABLE IF NOT EXISTS ");
	out.push(ddl.trim().endsWith(";") ? ddl.trim() : ddl.trim() + ";");
	out.push("");
}

for (const o of others) {
	if (!o.sql || skip.has(o.tbl_name) || sqlish(o.name)) continue;
	let ddl = o.sql.trim();
	if (o.type === "index" && /^CREATE\s+(UNIQUE\s+)?INDEX\s+/i.test(ddl)) {
		ddl = ddl.replace(/^CREATE\s+(UNIQUE\s+)?INDEX\s+/i, (m) => m.replace(/\s+INDEX\s+/i, " INDEX IF NOT EXISTS ").replace(/INDEX IF NOT EXISTS\s+/i, "INDEX IF NOT EXISTS "));
	}
	out.push(ddl.endsWith(";") ? ddl : ddl + ";");
}

out.push("");
out.push("-- 迁移记账表");
out.push("CREATE TABLE IF NOT EXISTS t_migrations (");
out.push("\tname TEXT PRIMARY KEY,");
out.push("\tapplied_at TEXT NOT NULL");
out.push(");");

process.stdout.write(out.join("\n") + "\n");
