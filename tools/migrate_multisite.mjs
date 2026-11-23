// tools/migrate_multisite.mjs —— 把单站点库改造成多站点（多租户）结构
// 用法:
//   node tools/migrate_multisite.mjs local   写入本地 D1（miniflare 库文件，node:sqlite 直连）
//   node tools/migrate_multisite.mjs remote  写入远端 D1（D1 REST API，需要
//                                  CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID / D1_DATABASE_ID）
// 幂等：可重复执行。ALTER 前会先查 PRAGMA table_info，已存在则跳过。
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

// ---------- 站点种子数据（Code 必须小写；hosts 为对外域名） ----------
export const SITES = [
	{
		id: 1,
		code: "bjrobust",
		name: "罗巴斯特",
		companyName: "北京罗巴斯特科技有限公司",
		hotline: "+86 10 61252911 / 15810050111",
		email: "sales@bjrobust.com",
		logoUrl: "/assets/cn-images/logo-di.jpg",
		theme: { primary: "#14508c", primaryDark: "#0e3c6e", accent: "#ff9f00" },
		hosts: ["bjrobust.qlxtools.asia"],
	},
	{
		id: 2,
		code: "aaaa",
		name: "站点 A",
		companyName: "站点 A 有限公司",
		hotline: "",
		email: "",
		logoUrl: "",
		theme: { primary: "#1f7a5c", primaryDark: "#14603f", accent: "#f2a104" },
		hosts: ["aaaa.qlxtools.asia"],
	},
	{
		id: 3,
		code: "bbbb",
		name: "站点 B",
		companyName: "站点 B 有限公司",
		hotline: "",
		email: "",
		logoUrl: "",
		theme: { primary: "#7a2f4f", primaryDark: "#5c1f37", accent: "#e0a300" },
		hosts: ["bbbb.qlxtools.asia"],
	},
];

// 需要加 SiteId 的内容表
const CONTENT_TABLES = [
	"t_news",
	"t_products",
	"t_protype",
	"t_img",
	"t_content",
	"t_global",
	"t_feedback",
	"t_log",
];

const DDL = [
	`CREATE TABLE IF NOT EXISTS "t_sites" (
	"id" INTEGER NOT NULL PRIMARY KEY,
	"Code" TEXT NOT NULL,
	"Name" TEXT NOT NULL,
	"CompanyName" TEXT NOT NULL,
	"Hotline" TEXT NOT NULL,
	"Email" TEXT NOT NULL,
	"LogoUrl" TEXT NOT NULL,
	"Theme" TEXT NOT NULL,
	"IsActive" INTEGER NOT NULL,
	"Sort" INTEGER NOT NULL,
	"CreatedAt" TEXT NOT NULL,
	"UpdatedAt" TEXT NOT NULL
)`,
	`CREATE UNIQUE INDEX IF NOT EXISTS "ux_t_sites_Code" ON "t_sites" ("Code")`,
	`CREATE TABLE IF NOT EXISTS "t_site_domain" (
	"id" INTEGER NOT NULL PRIMARY KEY,
	"SiteId" INTEGER NOT NULL,
	"Host" TEXT NOT NULL,
	"IsPrimary" INTEGER NOT NULL,
	"CreatedAt" TEXT NOT NULL
)`,
	`CREATE UNIQUE INDEX IF NOT EXISTS "ux_t_site_domain_Host" ON "t_site_domain" ("Host")`,
	`CREATE INDEX IF NOT EXISTS "idx_t_site_domain_SiteId" ON "t_site_domain" ("SiteId")`,
	// 登录限流计数（跨节点生效）
	`CREATE TABLE IF NOT EXISTS "t_throttle" (
	"Key" TEXT NOT NULL PRIMARY KEY,
	"Count" INTEGER NOT NULL,
	"WindowStart" TEXT NOT NULL
)`,
	// 内页头图：每站每个页面一行（Pic 为空 = 该页不配图，前台用主题渐变底）
	`CREATE TABLE IF NOT EXISTS "t_banner" (
	"id" INTEGER NOT NULL PRIMARY KEY,
	"SiteId" INTEGER NOT NULL,
	"Page" TEXT NOT NULL,
	"Title" TEXT NOT NULL,
	"Pic" TEXT NOT NULL,
	"OrderBy" INTEGER NOT NULL,
	"IsShow" INTEGER NOT NULL,
	"NoteTime" TEXT NOT NULL
)`,
	`CREATE UNIQUE INDEX IF NOT EXISTS "ux_t_banner_site_page" ON "t_banner" ("SiteId", "Page")`,
];

// bjrobust 存量内页头图（R2 里的老文件），迁移时写成数据库初始值
const BANNER_SEED = [
	["about", "公司概况", "cn-banner/banner1.jpg"],
	["products", "产品中心", "cn-banner/banner2.jpg"],
	["news", "新闻资讯", "cn-banner/banner3.jpg"],
	["cases", "成功案例", "cn-banner/banner4.jpg"],
	["support", "技术支持", "cn-banner/banner5.jpg"],
	["contact", "联系我们", "cn-banner/banner6.jpg"],
];

function nowSql() {
	const d = new Date(Date.now() + 8 * 3600 * 1000);
	const p = (n) => String(n).padStart(2, "0");
	return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

// ---------- 适配器 ----------
function localAdapter(dbFile) {
	const db = new DatabaseSync(dbFile);
	return {
		label: dbFile,
		async exec(sql, params = []) {
			if (params.length) db.prepare(sql).run(...params);
			else db.exec(sql);
		},
		async all(sql, params = []) {
			try {
				return db.prepare(sql).all(...params);
			} catch {
				return [];
			}
		},
		close() {
			db.close();
		},
	};
}

function remoteAdapter() {
	const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
	const databaseId = process.env.D1_DATABASE_ID;
	const tomlPath =
		process.env.WRANGLER_TOKEN_TOML ||
		"C:/Users/qlx/AppData/Roaming/xdg.config/.wrangler/config/default.toml";
	const readToken = () => {
		try {
			const m = readFileSync(tomlPath, "utf8").match(/oauth_token\s*=\s*"([^"]+)"/);
			return m ? m[1] : null;
		} catch {
			return null;
		}
	};
	const seedToken = process.env.CLOUDFLARE_API_TOKEN || readToken();
	if (!seedToken || !accountId || !databaseId) {
		console.error(
			"remote 模式需要凭据: CLOUDFLARE_API_TOKEN 环境变量或 wrangler 登录凭据, CLOUDFLARE_ACCOUNT_ID, D1_DATABASE_ID",
		);
		process.exit(1);
	}
	const refreshToken = () => {
		try {
			execSync("npx wrangler whoami", { stdio: "ignore", timeout: 90_000 });
		} catch {
			/* 忽略 */
		}
	};
	const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;
	const post = async (sql, params = []) => {
		let lastErr;
		for (let attempt = 0; attempt < 5; attempt++) {
			try {
				const t = readToken() || seedToken;
				const res = await fetch(url, {
					method: "POST",
					headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
					body: JSON.stringify({ sql, params }),
					signal: AbortSignal.timeout(30_000),
				});
				if (!res.ok) {
					const msg = `D1 API ${res.status}: ${(await res.text()).slice(0, 200)}`;
					if (res.status === 401 || res.status === 403) {
						refreshToken();
						lastErr = new Error(msg);
					} else if (res.status >= 400 && res.status < 500 && res.status !== 429) throw new Error(msg);
					else lastErr = new Error(msg);
				} else {
					const body = await res.json();
					return (body?.result?.[0]?.results ?? []);
				}
			} catch (e) {
				if (String(e.message).startsWith("D1 API 4")) throw e;
				lastErr = e;
			}
			await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
		}
		throw lastErr;
	};
	return {
		label: `remote d1 ${databaseId}`,
		exec: (sql, params = []) => post(sql, params).then(() => {}),
		all: (sql, params = []) => post(sql, params),
		close() {},
	};
}

// ---------- 工具 ----------
async function hasColumn(a, table, col) {
	const cols = await a.all(`PRAGMA table_info("${table}")`);
	return cols.some((c) => String(c.name ?? c.NAME ?? "") === col);
}

async function ensureColumn(a, table, col, ddl) {
	if (await hasColumn(a, table, col)) return false;
	await a.exec(`ALTER TABLE "${table}" ADD COLUMN "${col}" ${ddl}`);
	return true;
}

// ---------- 主流程 ----------
async function run(a) {
	console.log("目标:", a.label);

	// 1) 新表
	for (const sql of DDL) await a.exec(sql);
	console.log("  t_sites / t_site_domain 就绪");

	// 2) 内容表加 SiteId
	let added = 0;
	for (const t of CONTENT_TABLES) {
		if (await ensureColumn(a, t, "SiteId", "INTEGER NOT NULL DEFAULT 1")) {
			added++;
			console.log(`  + ${t}.SiteId`);
		}
		await a.exec(`CREATE INDEX IF NOT EXISTS "idx_${t}_SiteId" ON "${t}" ("SiteId")`);
	}
	// 3) 管理员加 SiteId（0 = 平台超管）
	if (await ensureColumn(a, "t_admin", "SiteId", "INTEGER NOT NULL DEFAULT 0")) {
		added++;
		console.log("  + t_admin.SiteId（存量管理员视为平台超管 = 0）");
	}
	await a.exec(`CREATE INDEX IF NOT EXISTS "idx_t_admin_SiteId" ON "t_admin" ("SiteId")`);
	console.log(`字段变更合计: ${added} 处`);

	// 4) 站点种子
	const ts = nowSql();
	for (const s of SITES) {
		const exists = (
			await a.all(`SELECT id FROM t_sites WHERE "Code" = ?`, [s.code])
		)[0];
		if (!exists) {
			await a.exec(
				`INSERT INTO t_sites ("id","Code","Name","CompanyName","Hotline","Email","LogoUrl","Theme","IsActive","Sort","CreatedAt","UpdatedAt")
				 VALUES (?,?,?,?,?,?,?,?,1,?,?,?)`,
				[
					s.id,
					s.code,
					s.name,
					s.companyName,
					s.hotline,
					s.email,
					s.logoUrl,
					JSON.stringify(s.theme),
					s.id,
					ts,
					ts,
				],
			);
			console.log(`  + 站点 ${s.code}`);
		}
		const row = (await a.all(`SELECT id FROM t_sites WHERE "Code" = ?`, [s.code]))[0];
		const siteId = Number(row.id);
		for (const [i, host] of s.hosts.entries()) {
			const has = (await a.all(`SELECT id FROM t_site_domain WHERE "Host" = ?`, [host]))[0];
			if (!has) {
				await a.exec(
					`INSERT INTO t_site_domain ("SiteId","Host","IsPrimary","CreatedAt") VALUES (?,?,?,?)`,
					[siteId, host, i === 0 ? 1 : 0, ts],
				);
				console.log(`  + ${host} → ${s.code}`);
			}
		}
	}

	// 5) 新站点空白内容（仅当该站点还没有 t_global 记录时）
	for (const s of SITES) {
		if (s.code === "bjrobust") continue; // 存量站点不动
		const row = (await a.all(`SELECT id FROM t_sites WHERE "Code" = ?`, [s.code]))[0];
		const siteId = Number(row.id);
		const g = (await a.all(`SELECT id FROM t_global WHERE "SiteId" = ? LIMIT 1`, [siteId])).length;
		if (g) continue;
		await scaffold(a, siteId, s);
		console.log(`  · ${s.code} 空白模板已生成`);
	}

	// 6) bjrobust 存量内页头图写入 t_banner（其它站点留空 → 前台主题渐变底，后台自行上传）
	const bj = (await a.all(`SELECT id FROM t_sites WHERE "Code" = ?`, ["bjrobust"]))[0];
	if (bj) {
		const bjId = Number(bj.id);
		let seeded = 0;
		for (const [i, [page, title, pic]] of BANNER_SEED.entries()) {
			const has = (await a.all(`SELECT id FROM t_banner WHERE "SiteId" = ? AND "Page" = ?`, [bjId, page]))[0];
			if (has) continue;
			await a.exec(
				`INSERT INTO t_banner ("SiteId","Page","Title","Pic","OrderBy","IsShow","NoteTime") VALUES (?,?,?,?,?,1,?)`,
				[bjId, page, title, pic, i, ts],
			);
			seeded++;
		}
		if (seeded) console.log(`  · bjrobust 内页头图初始记录 ${seeded} 条`);
	}

	console.log("多站点迁移完成");
}

// 生成空白模板（与 src/worker/lib/scaffold.ts 的占位文案保持一致）
async function scaffold(a, siteId, site) {
	const ts = nowSql();
	const company = site.companyName || site.name;
	await a.exec(
		`INSERT INTO t_global ("Webname","Title","Keywords","Description","Beian","Upload","Web","Language","SiteId")
		 VALUES (?,?,?,?,?,?,?,?,?)`,
		[site.name, company, `${company}、产品中心、联系我们`, `${company}官网，欢迎访问。`, "", "upload", "", "cn", siteId],
	);
	const pages = [
		["首页公司简介", `<p>${company}欢迎您。此处为首页简介占位文案，请在后台「站点设置 → 静态页」中修改。</p>`],
		["公司概况", `<p>这里放公司概况。请在后台「站点设置 → 静态页」中替换为真实介绍。</p>`],
		["联系我们", `<p>地址：待填写<br>电话：待填写<br>邮箱：待填写</p>`],
		["底部版权", `<p>© ${company} 版权所有</p>`],
		["首页联系方式", `<p>地址：待填写<br>电话：待填写</p>`],
		["二维码", ""],
	];
	for (const [called, html] of pages) {
		await a.exec(
			`INSERT INTO t_content ("Called","NoteTime","Content","Language","SiteId") VALUES (?,?,?,?,?)`,
			[called, ts, html, "cn", siteId],
		);
	}
	const cats = ["产品分类一", "产品分类二", "产品分类三"];
	for (const [i, name] of cats.entries()) {
		await a.exec(
			`INSERT INTO t_protype ("Called","PicUrl","OrderBy","IsShow","Memo","PID","TypeLevel","Language","ParentPath","NoteTime","SiteId")
			 VALUES (?,?,?,1,?,0,0,?,?,?,?)`,
			[name, "", cats.length - i, "", "cn", "", ts, siteId],
		);
	}
	await a.exec(
		`INSERT INTO t_news ("Title","NoteTime","Content","UserName","IsShow","IsCommend","OrderBy","NewType","Hits","Language","Parent","SmallPic","WebTitle","WebKey","WebDesc","ShowTime","SJ","LINK","DOWN","MEMO","SiteId")
		 VALUES (?,?,?,?,1,0,0,3,0,?,0,?,?,?,?,?,?,?,?,?,?)`,
		[
			"欢迎访问本站",
			ts,
			"<p>这是站点创建时自动生成的欢迎内容，请在后台「新闻/案例」中修改或删除。</p>",
			"admin",
			"cn",
			"",
			"欢迎访问本站",
			"",
			"",
			ts,
			"",
			"",
			"",
			"",
			siteId,
		],
	);
}

// ---------- 入口 ----------
const mode = process.argv[2] || "local";

if (mode === "local") {
	const dir = path.join(process.cwd(), ".wrangler/state/v3/d1/miniflare-D1DatabaseObject");
	const files = readdirSync(dir)
		.filter((f) => f.endsWith(".sqlite") && !f.startsWith("metadata"))
		.map((f) => [f, statSync(path.join(dir, f)).mtimeMs])
		.sort((x, y) => y[1] - x[1])
		.map((f) => f[0]);
	if (!files.length) {
		console.error(
			"未找到本地 D1 库文件，请先运行: npx wrangler d1 execute bjrobust --local --command 'SELECT 1'",
		);
		process.exit(1);
	}
	if (files.length > 1) console.log(`注意: 存在 ${files.length} 个本地 D1 文件，使用最近更新的: ${files[0]}`);
	const a = localAdapter(path.join(dir, files[0]));
	await run(a);
	a.close();
} else if (mode === "remote") {
	const a = remoteAdapter();
	await run(a);
} else {
	console.error("未知模式: " + mode + "（local | remote）");
	process.exit(1);
}
