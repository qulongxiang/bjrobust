// 平台管理（仅超管）：站点（租户）增删改、域名绑定、空白模板初始化、跨站概览
import { Hono } from "hono";
import type { AppEnv, AdminVariables } from "../env";
import { isSuper, nowSql } from "../lib/auth";
import { BANNER_PAGES, isBannerPage, readBannerEntries, saveBannerFile, setBannerPic } from "../lib/banner";
import { count, exec, rows } from "../lib/d1";
import { hasContent, scaffoldSite } from "../lib/scaffold";
import { normalizeHost, siteByCode } from "../lib/tenant";

const app = new Hono<{ Bindings: AppEnv; Variables: AdminVariables }>();

const CODE_RE = /^[a-z0-9-]{2,32}$/;
const HOST_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
const COLOR_RE = /^#[0-9a-fA-F]{3,8}$/;

function deny(c: { json: (b: unknown, s: number) => Response }) {
	return c.json({ error: "仅平台超管可操作" }, 403);
}

function pickTheme(raw: unknown): string | null {
	if (raw == null) return null;
	if (typeof raw !== "object") return null;
	const o = raw as Record<string, unknown>;
	const out: Record<string, string> = {};
	for (const k of ["primary", "primaryDark", "accent"]) {
		const v = o[k];
		if (v == null) continue;
		if (typeof v !== "string" || !COLOR_RE.test(v.trim())) return null;
		out[k] = v.trim();
	}
	return JSON.stringify(out);
}

async function listSites(env: AppEnv) {
	const sites = await rows(env.DB.prepare('SELECT * FROM t_sites ORDER BY "Sort", "id"'));
	const domains = await rows(env.DB.prepare('SELECT "SiteId", "Host", "IsPrimary" FROM t_site_domain ORDER BY "IsPrimary" DESC, "Host"'));
	const bySite = new Map<number, string[]>();
	for (const d of domains) {
		const id = Number(d.SiteId);
		const list = bySite.get(id) ?? [];
		list.push(String(d.Host));
		bySite.set(id, list);
	}
	return sites.map((s) => ({
		id: Number(s.id),
		code: String(s.Code ?? ""),
		name: String(s.Name ?? ""),
		companyName: String(s.CompanyName ?? ""),
		hotline: String(s.Hotline ?? ""),
		email: String(s.Email ?? ""),
		logoUrl: String(s.LogoUrl ?? ""),
		theme: (() => {
			try {
				return JSON.parse(String(s.Theme ?? "{}"));
			} catch {
				return {};
			}
		})(),
		isActive: Number(s.IsActive ?? 0),
		sort: Number(s.Sort ?? 0),
		domains: bySite.get(Number(s.id)) ?? [],
	}));
}

// ---- 站点列表 + 各站内容量 ----
app.get("/platform/sites", async (c) => {
	if (!isSuper(c.get("admin"))) return deny(c);
	const env = c.env;
	const sites = await listSites(env);
	const stats: Record<string, { news: number; products: number; feedback: number; initialized: boolean }> = {};
	await Promise.all(
		sites.map(async (s) => {
			const [news, products, feedback, init] = await Promise.all([
				count(env.DB.prepare('SELECT COUNT(*) AS n FROM t_news WHERE "SiteId" = ?').bind(s.id)),
				count(env.DB.prepare('SELECT COUNT(*) AS n FROM t_products WHERE "SiteId" = ?').bind(s.id)),
				count(env.DB.prepare('SELECT COUNT(*) AS n FROM t_feedback WHERE "SiteId" = ?').bind(s.id)),
				hasContent(env, s.id),
			]);
			stats[s.code] = { news, products, feedback, initialized: init };
		}),
	);
	return c.json({
		ok: true,
		sites,
		stats,
		defaultCode: env.SITE_DEFAULT || "bjrobust",
		currentCode: c.get("site").code,
	});
});

// ---- 新建站点 ----
app.post("/platform/sites", async (c) => {
	if (!isSuper(c.get("admin"))) return deny(c);
	const env = c.env;
	const b = await c.req.json().catch(() => null);
	if (!b) return c.json({ error: "请求格式错误" }, 400);
	const code = String(b.code ?? "").trim().toLowerCase();
	if (!CODE_RE.test(code)) return c.json({ error: "站点标识只能是小写字母/数字/短横线，2-32 位" }, 400);
	const name = String(b.name ?? "").trim().slice(0, 60);
	if (!name) return c.json({ error: "站点名称不能为空" }, 400);
	const exists = await siteByCode(env, code);
	if (exists) return c.json({ error: "站点标识已存在" }, 400);

	const theme = pickTheme(b.theme) ?? JSON.stringify({ primary: "#14508c", primaryDark: "#0e3c6e", accent: "#ff9f00" });
	const ts = nowSql();
	const res = await exec(
		env.DB.prepare(
			'INSERT INTO t_sites ("Code","Name","CompanyName","Hotline","Email","LogoUrl","Theme","IsActive","Sort","CreatedAt","UpdatedAt") VALUES (?,?,?,?,?,?,?,1,?,?,?)',
		),
		code,
		name,
		String(b.companyName ?? "").trim().slice(0, 100) || name,
		String(b.hotline ?? "").trim().slice(0, 100),
		String(b.email ?? "").trim().slice(0, 100),
		String(b.logoUrl ?? "").trim().slice(0, 300),
		theme,
		Number(b.sort ?? 100),
		ts,
		ts,
	);
	const siteId = Number(res.meta.last_row_id);

	const hosts: string[] = Array.isArray(b.hosts) ? b.hosts : [];
	for (const [i, raw] of hosts.entries()) {
		const host = normalizeHost(String(raw));
		if (!HOST_RE.test(host)) continue;
		await exec(
			env.DB.prepare('INSERT OR IGNORE INTO t_site_domain ("SiteId","Host","IsPrimary","CreatedAt") VALUES (?,?,?,?)'),
			siteId,
			host,
			i === 0 ? 1 : 0,
			ts,
		);
	}

	if (b.init !== false) {
		await scaffoldSite(env, siteId, { name, companyName: String(b.companyName ?? "") || name });
	}
	return c.json({ ok: true, id: siteId, code });
});

// ---- 修改站点信息 / 启用停用 ----
app.put("/platform/sites/:id", async (c) => {
	if (!isSuper(c.get("admin"))) return deny(c);
	const env = c.env;
	const id = Number(c.req.param("id"));
	const b = await c.req.json().catch(() => null);
	if (!b) return c.json({ error: "请求格式错误" }, 400);

	const sets: string[] = [];
	const params: (string | number)[] = [];
	const map: Record<string, string> = {
		name: "Name",
		companyName: "CompanyName",
		hotline: "Hotline",
		email: "Email",
		logoUrl: "LogoUrl",
	};
	for (const [k, col] of Object.entries(map)) {
		if (!(k in b)) continue;
		params.push(String(b[k] ?? "").trim().slice(0, 300));
		sets.push(`"${col}" = ?`);
	}
	if ("theme" in b) {
		const theme = pickTheme(b.theme);
		if (!theme) return c.json({ error: "主题色格式不合法（应为 #rrggbb）" }, 400);
		params.push(theme);
		sets.push('"Theme" = ?');
	}
	if ("isActive" in b) {
		params.push(Number(b.isActive) === 1 ? 1 : 0);
		sets.push('"IsActive" = ?');
	}
	if ("sort" in b) {
		params.push(Number(b.sort) || 0);
		sets.push('"Sort" = ?');
	}
	if (!sets.length) return c.json({ error: "没有要更新的字段" }, 400);
	params.push(nowSql());
	sets.push('"UpdatedAt" = ?');
	const res = await env.DB.prepare(`UPDATE t_sites SET ${sets.join(", ")} WHERE "id" = ?`).bind(...params, id).run();
	if (!res.meta.changes) return c.json({ error: "站点不存在" }, 404);
	return c.json({ ok: true });
});

// ---- 域名绑定（整体替换） ----
app.put("/platform/sites/:id/domains", async (c) => {
	if (!isSuper(c.get("admin"))) return deny(c);
	const env = c.env;
	const id = Number(c.req.param("id"));
	const site = (await rows(env.DB.prepare('SELECT "Code" FROM t_sites WHERE "id" = ?').bind(id)))[0];
	if (!site) return c.json({ error: "站点不存在" }, 404);
	const b = await c.req.json().catch(() => null);
	const hosts: unknown[] = Array.isArray(b?.hosts) ? b.hosts : [];
	const clean: string[] = [];
	for (const raw of hosts) {
		const host = normalizeHost(String(raw ?? ""));
		if (!host) continue;
		if (!HOST_RE.test(host)) return c.json({ error: `域名格式不合法: ${host}` }, 400);
		if (!clean.includes(host)) clean.push(host);
	}
	// 先校验冲突，避免删完才发现冲突
	for (const host of clean) {
		const other = (await rows(env.DB.prepare('SELECT "SiteId", "Host" FROM t_site_domain WHERE "Host" = ?').bind(host)))[0];
		if (other && Number(other.SiteId) !== id) {
			return c.json({ error: `域名 ${host} 已绑定到站点 ${Number(other.SiteId)}，请先从原站点解绑` }, 400);
		}
	}
	await exec(env.DB.prepare('DELETE FROM t_site_domain WHERE "SiteId" = ?'), id);
	const ts = nowSql();
	for (const [i, host] of clean.entries()) {
		await exec(
			env.DB.prepare('INSERT INTO t_site_domain ("SiteId","Host","IsPrimary","CreatedAt") VALUES (?,?,?,?)'),
			id,
			host,
			i === 0 ? 1 : 0,
			ts,
		);
	}
	return c.json({ ok: true, hosts: clean });
});

// ---- 生成/补齐空白模板 ----
app.post("/platform/sites/:id/scaffold", async (c) => {
	if (!isSuper(c.get("admin"))) return deny(c);
	const env = c.env;
	const id = Number(c.req.param("id"));
	const s = (await rows(env.DB.prepare('SELECT "Name", "CompanyName" FROM t_sites WHERE "id" = ?').bind(id)))[0];
	if (!s) return c.json({ error: "站点不存在" }, 404);
	const created = await scaffoldSite(env, id, {
		name: String(s.Name ?? ""),
		companyName: String(s.CompanyName ?? ""),
	});
	return c.json({ ok: true, created, message: created ? "已生成空白模板" : "该站点已有内容，未重复生成" });
});

// ---- 删除站点（有内容需 ?force=1 二次确认） ----
app.delete("/platform/sites/:id", async (c) => {
	if (!isSuper(c.get("admin"))) return deny(c);
	const env = c.env;
	const id = Number(c.req.param("id"));
	const s = (await rows(env.DB.prepare('SELECT "Code" FROM t_sites WHERE "id" = ?').bind(id)))[0];
	if (!s) return c.json({ error: "站点不存在" }, 404);
	const code = String(s.Code ?? "");
	const defaultCode = env.SITE_DEFAULT || "bjrobust";
	if (code === defaultCode) return c.json({ error: "默认站点不能删除（可改为停用）" }, 400);

	const has = await hasContent(env, id);
	if (has && c.req.query("force") !== "1") {
		return c.json({ error: "该站点已有内容，确认删除请带 force=1" }, 400);
	}
	for (const t of ["t_news", "t_products", "t_protype", "t_img", "t_content", "t_global", "t_feedback", "t_log", "t_banner"]) {
		await exec(env.DB.prepare(`DELETE FROM ${t} WHERE "SiteId" = ?`), id);
	}
	await exec(env.DB.prepare('DELETE FROM t_site_domain WHERE "SiteId" = ?'), id);
	await exec(env.DB.prepare('DELETE FROM t_sites WHERE "id" = ?'), id);
	return c.json({ ok: true });
});

// ---- 跨站点头图矩阵：一次看全所有站点 × 所有页面 ----
app.get("/platform/banners", async (c) => {
	if (!isSuper(c.get("admin"))) return deny(c);
	const env = c.env;
	const sites = await rows(env.DB.prepare('SELECT "id", "Code", "Name", "IsActive" FROM t_sites ORDER BY "Sort", "id"'));
	const matrix: Record<string, Record<string, { pic: string; url: string; updated: string }>> = {};
	for (const s of sites) {
		const code = String(s.Code ?? "");
		const entries = await readBannerEntries(env, Number(s.id));
		matrix[code] = Object.fromEntries(entries.map((e) => [e.page, { pic: e.pic, url: e.url, updated: e.updated }]));
	}
	return c.json({
		ok: true,
		pages: BANNER_PAGES,
		sites: sites.map((s) => ({
			code: String(s.Code ?? ""),
			name: String(s.Name ?? ""),
			isActive: Number(s.IsActive ?? 0),
		})),
		matrix,
	});
});

app.put("/platform/banners/:code/:page", async (c) => {
	if (!isSuper(c.get("admin"))) return deny(c);
	const code = c.req.param("code").toLowerCase();
	const page = c.req.param("page");
	if (!isBannerPage(page)) return c.json({ error: "未知头图页面" }, 400);
	const site = await siteByCode(c.env, code);
	if (!site) return c.json({ error: "站点不存在" }, 404);
	const form = await c.req.formData().catch(() => null);
	if (!form) return c.json({ error: "请求格式错误" }, 400);
	const file = form.get("file");
	if (!(file instanceof File)) return c.json({ error: "缺少 file 字段" }, 400);
	const res = await saveBannerFile(c.env, site, page, file);
	if (!res.ok) return c.json({ error: res.error }, res.status as 400 | 503);
	return c.json({ ok: true, code, page, pic: res.pic });
});

app.delete("/platform/banners/:code/:page", async (c) => {
	if (!isSuper(c.get("admin"))) return deny(c);
	const code = c.req.param("code").toLowerCase();
	const page = c.req.param("page");
	if (!isBannerPage(page)) return c.json({ error: "未知头图页面" }, 400);
	const site = await siteByCode(c.env, code);
	if (!site) return c.json({ error: "站点不存在" }, 404);
	await setBannerPic(c.env, site.id, page, "");
	return c.json({ ok: true, code, page });
});

export default app;
