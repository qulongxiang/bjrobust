// tools/update_footer.mjs — 整理 t_content「底部版权」片段
// 去掉旧站残留的 float 内联样式 / 空 src 图 / 空行 / 百度统计 script，保留备案链接与警徽图标
// 用法: node tools/update_footer.mjs [local | remote | all]
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const mode = process.argv[2] || "all";
const PROJECT = "D:/softdata/text/bjrobust";

// ---- 从本地库读当前片段，提取警徽 base64 ----
const dir = path.join(PROJECT, ".wrangler/state/v3/d1/miniflare-D1DatabaseObject/");
const f = readdirSync(dir)
	.filter((x) => x.endsWith(".sqlite") && !x.startsWith("metadata"))
	.map((x) => [x, statSync(path.join(dir, x)).mtimeMs])
	.sort((a, b) => b[1] - a[1])[0][0];
const ro = new DatabaseSync(path.join(dir, f), { readOnly: true });
const row = ro.prepare("SELECT Content FROM t_content WHERE Language = 'cn' AND Called = '底部版权'").get();
ro.close();
if (!row) {
	console.error("未找到本地「底部版权」片段");
	process.exit(1);
}
const old = String(row.Content);
const badge = old.match(/<img src="(data:image\/png;base64,[A-Za-z0-9+/=]+)"[^>]*>/)?.[1] ?? "";

const newContent = `<p>版权所有 &copy; 北京罗巴斯特科技有限公司</p>\n<p><a href="https://beian.miit.gov.cn" target="_blank" rel="noopener">京ICP备18025598号-1</a>&nbsp;&nbsp;&nbsp;${badge ? `<img src="${badge}" alt="" /> ` : ""}<a href="https://www.beian.gov.cn/portal/registerSystemInfo?recordcode=11011502006754" target="_blank" rel="noopener">京公网安备 11011502006754号</a></p>`;
console.log("新片段长度:", newContent.length, "| 警徽图标保留:", Boolean(badge));

if (mode === "local" || mode === "all") {
	const db = new DatabaseSync(path.join(dir, f));
	const r = db.prepare("UPDATE t_content SET Content = ? WHERE Language = 'cn' AND Called = '底部版权'").run(newContent);
	db.close();
	console.log("本地更新完成, changes =", r.changes);
}

if (mode === "remote" || mode === "all") {
	const accountId = "ea1fab4be92f6b0809efef4bd03c5341";
	const databaseId = "d2e1886b-2684-4774-b97d-6925446b5b3b";
	const tomlPath = "C:/Users/qlx/AppData/Roaming/xdg.config/.wrangler/config/default.toml";
	const readToken = () => {
		try {
			const s = readFileSync(tomlPath, "utf8");
			const m = s.match(/oauth_token\s*=\s*"([^"]+)"/) ?? s.match(/token\s*=\s*"([^"]+)"/);
			return m ? m[1] : null;
		} catch {
			return null;
		}
	};
	const refreshToken = () => {
		try {
			execSync("npx wrangler whoami", { stdio: "ignore", timeout: 90_000 });
		} catch {
			/* 刷新失败由重试循环兜底 */
		}
	};
	const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;
	const sql = "UPDATE t_content SET Content = ? WHERE Language = 'cn' AND Called = '底部版权'";
	let lastErr;
	let done = false;
	for (let attempt = 0; attempt < 5 && !done; attempt++) {
		try {
			const t = readToken();
			if (!t) throw new Error("未读到 wrangler token");
			const res = await fetch(url, {
				method: "POST",
				headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
				body: JSON.stringify({ sql, params: [newContent] }),
				signal: AbortSignal.timeout(30_000),
			});
			if (res.ok) {
				const d = await res.json();
				console.log("远端更新完成:", JSON.stringify(d.results ?? d).slice(0, 200));
				done = true;
			} else if (res.status === 401 || res.status === 403) {
				refreshToken();
				lastErr = new Error(`D1 API ${res.status}`);
			} else {
				throw new Error(`D1 API ${res.status}: ${(await res.text()).slice(0, 200)}`);
			}
		} catch (e) {
			lastErr = e;
		}
		if (!done) {
			const w = 2000 * (attempt + 1);
			console.error(`请求失败（${String(lastErr).slice(0, 60)}），${w / 1000}s 后重试 ${attempt + 1}/4…`);
			await new Promise((r) => setTimeout(r, w));
		}
	}
	if (!done) {
		console.error("远端更新失败:", lastErr);
		process.exit(1);
	}
}
console.log("全部完成");
