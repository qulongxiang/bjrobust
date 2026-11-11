// tools/reset_local_db.mjs — 一键重建本地 D1 数据（先停 dev）
// 流程：清空全部表 → 从 tools/data.json 重新导入 → 重置本地测试管理员密码
// 用法: node tools/reset_local_db.mjs [测试密码]   （默认 Bjrobust@2026）
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";

const PROJECT = "D:/softdata/text/bjrobust";
const TEST_PASSWORD = process.argv[2] || "Bjrobust@2026";

const dir = path.join(PROJECT, ".wrangler/state/v3/d1/miniflare-D1DatabaseObject");
// D1 配置（如 database_id）变更后 miniflare 会新建本地库文件：取最近更新的为当前 dev 所用文件
const dataFiles = readdirSync(dir)
	.filter((x) => x.endsWith(".sqlite") && !x.startsWith("metadata"))
	.map((x) => [x, statSync(path.join(dir, x)).mtimeMs])
	.sort((a, b) => b[1] - a[1]);
if (!dataFiles.length) {
	console.error("未找到本地 D1 文件，请先运行一次: npm run dev（Ctrl+C 停止后再执行本脚本）");
	process.exit(1);
}
if (dataFiles.length > 1) {
	console.log(`注意: 存在 ${dataFiles.length} 个本地 D1 文件，使用最近更新的: ${dataFiles[0][0]}`);
	console.log("其余为配置变更留下的旧库文件，确认无用后可直接删除。");
}
const dbFile = path.join(dir, dataFiles[0][0]);
const db = new DatabaseSync(dbFile);

// 1) 清空全部表
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);
for (const t of tables) db.exec(`DROP TABLE IF EXISTS "${t.replace(/"/g, '""')}"`);
console.log(`已清空 ${tables.length} 张表`);

// 2) 从 data.json 重建（表结构 + 索引 + 数据）
const data = JSON.parse(readFileSync(path.join(PROJECT, "tools/data.json"), "utf8"));
db.exec("BEGIN");
for (const t of data.tables) {
	db.exec(t.ddl);
	for (const idx of t.indexes) db.exec(idx);
	if (!t.rows.length) continue;
	const colList = t.columns.map((c) => `"${c.name}"`).join(",");
	const ph = t.columns.map(() => "?").join(",");
	const stmt = db.prepare(`INSERT OR REPLACE INTO ${t.name} (${colList}) VALUES (${ph})`);
	for (const row of t.rows) stmt.run(...row);
}
db.exec("COMMIT");
console.log("数据导入完成");

// 3) 重置本地测试管理员（生产用原数据库密码，不受影响）
const hash = bcrypt.hashSync(TEST_PASSWORD, 10);
const r = db.prepare("UPDATE t_admin SET PassWord = ?, IsLock = 0 WHERE id = 1").run(hash);
console.log(r.changes ? `本地管理员 admin 密码已重置为: ${TEST_PASSWORD}` : "警告: t_admin 无 id=1 记录");

// 4) 行数核对
for (const t of ["t_news", "t_products", "t_feedback", "t_content", "t_img"]) {
	console.log(`  ${t}: ${db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n} 行`);
}
db.close();
console.log("完成。现在可 npm run dev 启动。");
