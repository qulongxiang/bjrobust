// schema 版本管理：migrations/*.sql 按文件名顺序执行，t_migrations 记账
//
//   node tools/db_migrate.mjs status [--local]    # 看哪些已应用、哪些没应用
//   node tools/db_migrate.mjs apply  [--local]    # 依次执行未应用的迁移并记账
//   node tools/db_migrate.mjs apply  --upto 0002  # 只应用到指定版本
//
// 约定：迁移文件必须幂等或自带判断（DDL 用 IF NOT EXISTS），执行失败不记账，修完重跑即可。
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WRANGLER_BIN = path.join(ROOT, "node_modules", "wrangler", "bin", "wrangler.js");
const MIG_DIR = path.join(ROOT, "migrations");
const DB_NAME = process.env.D1_NAME || "bjrobust";
const LOCAL = process.argv.includes("--local");
const cmd = process.argv[2] || "status";
const upto = (() => {
	const i = process.argv.indexOf("--upto");
	return i > 0 ? process.argv[i + 1] : null;
})();

const target = LOCAL ? ["--local"] : ["--remote"];

function wrangler(args, opts = {}) {
	return execFileSync(process.execPath, [WRANGLER_BIN, "d1", "execute", DB_NAME, ...target, ...args], {
		encoding: "utf8",
		maxBuffer: 256 * 1024 * 1024,
		...opts,
	});
}

function query(sql) {
	const out = wrangler(["--json", "--command", sql]);
	const start = out.indexOf("[");
	return JSON.parse(out.slice(start))[0].results || [];
}

function ensureLedger() {
	wrangler(["--command", 'CREATE TABLE IF NOT EXISTS t_migrations ("name" TEXT PRIMARY KEY, "applied_at" TEXT NOT NULL)']);
}

function applied() {
	ensureLedger();
	return new Set(query("SELECT name FROM t_migrations").map((r) => r.name));
}

function files() {
	if (!existsSync(MIG_DIR)) return [];
	return readdirSync(MIG_DIR)
		.filter((f) => f.endsWith(".sql"))
		.sort();
}

function main() {
	const list = files();
	if (!list.length) throw new Error(`migrations 目录里没有 .sql：${MIG_DIR}`);
	const done = applied();

	if (cmd === "status") {
		console.log(`${LOCAL ? "local" : "remote"} 库 ${DB_NAME} 迁移状态：`);
		for (const f of list) console.log(`  ${done.has(f) ? "[x]" : "[ ]"} ${f}`);
		console.log(`已应用 ${done.size} / 共 ${list.length}`);
		return;
	}

	if (cmd === "apply") {
		let n = 0;
		for (const f of list) {
			if (upto && f > `${upto}` && !f.startsWith(upto)) continue;
			if (done.has(f)) {
				console.log(`skip  ${f}（已应用）`);
				continue;
			}
			const file = path.join(MIG_DIR, f);
			const sql = readFileSync(file, "utf8");
			if (!sql.trim()) {
				console.log(`skip  ${f}（空文件）`);
				continue;
			}
			console.log(`apply ${f} …`);
			wrangler([`--file=${file}`], { stdio: "inherit" });
			const now = new Date().toISOString();
			wrangler(["--command", `INSERT INTO t_migrations ("name", "applied_at") VALUES ('${f}', '${now}') ON CONFLICT("name") DO UPDATE SET "applied_at" = '${now}'`]);
			n++;
		}
		console.log(n ? `完成，本次应用 ${n} 个迁移` : "没有需要应用的迁移");
		return;
	}

	throw new Error(`未知命令：${cmd}（可用 status / apply）`);
}

try {
	main();
} catch (e) {
	console.error(String(e.message || e).split("\n").slice(0, 6).join("\n"));
	process.exit(1);
}
