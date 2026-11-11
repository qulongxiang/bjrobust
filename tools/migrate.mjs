// tools/migrate.mjs — 把 data.json（tools/export_data.php 生成）写入 D1
// 用法:
//   node tools/migrate.mjs local   写入本地 D1（miniflare 库文件，node:sqlite 直连，无语句长度限制）
//   node tools/migrate.mjs remote  写入远端 D1（D1 REST API + 绑定参数，需环境变量
//                                  CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID / D1_DATABASE_ID）
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const mode = process.argv[2] || "local";
const data = JSON.parse(readFileSync(new URL("./data.json", import.meta.url), "utf8"));

if (mode === "local") {
	const dir = path.join(process.cwd(), ".wrangler/state/v3/d1/miniflare-D1DatabaseObject");
	// D1 配置（如 database_id）变更后 miniflare 会新建本地库文件：排除 metadata，取最近更新的
	const { statSync } = await import("node:fs");
	const files = readdirSync(dir)
		.filter((f) => f.endsWith(".sqlite") && !f.startsWith("metadata"))
		.map((f) => [f, statSync(path.join(dir, f)).mtimeMs])
		.sort((a, b) => b[1] - a[1])
		.map((f) => f[0]);
	if (!files.length) {
		console.error("未找到本地 D1 库文件，请先运行: npx wrangler d1 execute bjrobust-db --local --command 'SELECT 1'");
		process.exit(1);
	}
	if (files.length > 1) console.log(`注意: 存在 ${files.length} 个本地 D1 文件，使用最近更新的: ${files[0]}`);
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
 const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
 const databaseId = process.env.D1_DATABASE_ID;
 // OAuth 访问令牌有效期短：优先每次请求时从 wrangler 凭据文件读最新值；401/403 时触发 wrangler 刷新
 const tomlPath =
  process.env.WRANGLER_TOKEN_TOML || "C:/Users/qlx/AppData/Roaming/xdg.config/.wrangler/config/default.toml";
 const readToken = () => {
  try {
   const m = readFileSync(tomlPath, "utf8").match(/oauth_token\s*=\s*"([^"]+)"/);
   return m ? m[1] : null;
  } catch {
   return null;
  }
 };
 const refreshToken = () => {
  try {
   execSync("npx wrangler whoami", { stdio: "ignore", timeout: 90_000 });
  } catch {
   /* 刷新失败则沿用旧 token，由重试循环兜底 */
  }
 };
 const token = process.env.CLOUDFLARE_API_TOKEN || readToken();
 if (!token || !accountId || !databaseId) {
  console.error("remote 模式需要凭据: CLOUDFLARE_API_TOKEN 环境变量或 wrangler 登录（凭据文件）, CLOUDFLARE_ACCOUNT_ID, D1_DATABASE_ID");
  process.exit(1);
 }
 const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;
 const post = async (sql, params) => {
  // 网络到 CF API 可能不稳定：30s 超时 + 最多 5 次退避重试（INSERT OR REPLACE 幂等，重试安全）
  let lastErr;
  for (let attempt = 0; attempt < 5; attempt++) {
   try {
    const t = readToken() || token; // 每次取最新 token
    const res = await fetch(url, {
     method: "POST",
     headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
     body: JSON.stringify({ sql, params: params ?? [] }),
     signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
     const msg = `D1 API ${res.status}: ${(await res.text()).slice(0, 300)}`;
     if (res.status === 401 || res.status === 403) {
      refreshToken(); // 令牌过期：刷新后重试
      lastErr = new Error(msg);
     } else if (res.status >= 400 && res.status < 500 && res.status !== 429) {
      throw new Error(msg); // 其他 4xx 重试无意义
     } else lastErr = new Error(msg);
    } else return;
   } catch (e) {
    if (e.message.startsWith("D1 API 4")) throw e;
    lastErr = e;
   }
   const wait = 2000 * (attempt + 1);
   console.error(`  请求失败（${String(lastErr).slice(0, 80)}），${wait / 1000}s 后重试 ${attempt + 1}/4…`);
   await new Promise((r) => setTimeout(r, wait));
  }
  throw lastErr;
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
