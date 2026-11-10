// tools/migrate.mjs — 把 data.json（tools/export_data.php 生成）写入 D1
// 用法:
//   node tools/migrate.mjs local   写入本地 D1（miniflare 库文件，node:sqlite 直连，无语句长度限制）
//   node tools/migrate.mjs remote  写入远端 D1（D1 REST API + 绑定参数，需环境变量
//                                  CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID / D1_DATABASE_ID）
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const mode = process.argv[2] || "local";
const data = JSON.parse(readFileSync(new URL("./data.json", import.meta.url), "utf8"));

if (mode === "local") {
	const dir = path.join(process.cwd(), ".wrangler/state/v3/d1/miniflare-D1DatabaseObject");
	const files = readdirSync(dir).filter((f) => f.endsWith(".sqlite"));
	if (!files.length) {
		console.error("未找到本地 D1 库文件，请先运行: npx wrangler d1 execute bjrobust-db --local --command 'SELECT 1'");
		process.exit(1);
	}
	const dbFile = path.join(dir, files[0]);
	console.log("库文件:", dbFile);
	const db = new DatabaseSync(dbFile);
	db.exec("BEGIN");
	for (const t of data.tables) {
		db.exec(t.ddl);
		for (const idx of t.indexes) db.exec(idx);
		if (!t.rows.length) continue;
		const colList = t.columns.map((c) => `"${c.name}"`).join(",");
		const ph = t.columns.map(() => "?").join(",");
		const stmt = db.prepare(`INSERT OR REPLACE INTO ${t.name} (${colList}) VALUES (${ph})`);
		for (const row of t.rows) stmt.run(...row);
		console.log("  " + t.name, "rows=" + t.rows.length);
	}
	db.exec("COMMIT");
	console.log("本地迁移完成");
} else if (mode === "remote") {
	const token = process.env.CLOUDFLARE_API_TOKEN;
	const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
	const databaseId = process.env.D1_DATABASE_ID;
	if (!token || !accountId || !databaseId) {
		console.error("remote 模式需要环境变量: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, D1_DATABASE_ID");
		process.exit(1);
	}
	const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;
	const post = async (sql, params) => {
		const res = await fetch(url, {
			method: "POST",
			headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
			body: JSON.stringify({ sql, params: params ?? [] }),
		});
		if (!res.ok) throw new Error(`D1 API ${res.status}: ${(await res.text()).slice(0, 300)}`);
	};
	for (const t of data.tables) {
		await post(t.ddl);
		for (const idx of t.indexes) await post(idx);
		if (!t.rows.length) continue;
		const colList = t.columns.map((c) => `"${c.name}"`).join(",");
		const ph = t.columns.map(() => "?").join(",");
		const sql = `INSERT OR REPLACE INTO ${t.name} (${colList}) VALUES (${ph})`;
		let done = 0;
		for (const row of t.rows) {
			await post(sql, row);
			done++;
			if (done % 200 === 0) {
				console.log(`  ${t.name} ${done}/${t.rows.length}`);
				await new Promise((r) => setTimeout(r, 200));
			}
		}
		console.log("  " + t.name, "rows=" + t.rows.length);
	}
	console.log("远端迁移完成");
} else {
	console.error("未知模式: " + mode + "（local | remote）");
	process.exit(1);
}
