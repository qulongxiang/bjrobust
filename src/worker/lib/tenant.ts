// 多租户：按 Host 解析站点（租户），并给请求注入 site / siteId
// 数据来源：t_site_domain（Host → SiteId）+ t_sites（站点信息）
import type { Context, MiddlewareHandler } from "hono";
import type { AppEnv, AdminVariables, SiteInfo, SiteTheme } from "../env";

/** 统一 Host 写法：小写、去端口、去 www. 前缀、去结尾点 */
export function normalizeHost(raw?: string | null): string {
	return (raw ?? "")
		.trim()
		.toLowerCase()
		.replace(/:\d+$/, "")
		.replace(/\.$/, "")
		.replace(/^www\./, "");
}

function parseTheme(raw: unknown): SiteTheme {
	if (typeof raw !== "string" || !raw) return {};
	try {
		const o = JSON.parse(raw) as Record<string, unknown>;
		const out: SiteTheme = {};
		for (const k of ["primary", "primaryDark", "accent"] as const) {
			const v = o[k];
			// 只接受 #rgb / #rrggbb，避免把任意字符串注入 CSS 变量
			if (typeof v === "string" && /^#[0-9a-fA-F]{3,8}$/.test(v.trim())) out[k] = v.trim();
		}
		return out;
	} catch {
		return {};
	}
}

export function mapSite(r: Record<string, unknown> | null | undefined): SiteInfo | null {
	if (!r) return null;
	return {
		id: Number(r.id ?? 0),
		code: String(r.Code ?? ""),
		name: String(r.Name ?? ""),
		companyName: String(r.CompanyName ?? ""),
		hotline: String(r.Hotline ?? ""),
		email: String(r.Email ?? ""),
		logoUrl: String(r.LogoUrl ?? ""),
		theme: parseTheme(r.Theme),
		isActive: Number(r.IsActive ?? 0),
	};
}

export async function siteByCode(env: AppEnv, code: string): Promise<SiteInfo | null> {
	const r = await env.DB.prepare('SELECT * FROM t_sites WHERE "Code" = ? LIMIT 1').bind(code).first();
	return mapSite(r as Record<string, unknown> | null);
}

export async function siteById(env: AppEnv, id: number): Promise<SiteInfo | null> {
	const r = await env.DB.prepare('SELECT * FROM t_sites WHERE "id" = ? LIMIT 1').bind(id).first();
	return mapSite(r as Record<string, unknown> | null);
}

/** 未知域名回落到默认站点（默认 bjrobust） */
async function defaultSite(env: AppEnv): Promise<SiteInfo | null> {
	const code = env.SITE_DEFAULT || "bjrobust";
	return (await siteByCode(env, code)) ?? (await siteById(env, 1));
}

/** 本地开发覆盖：仅当 ALLOW_SITE_OVERRIDE="1" 时接受 X-Site-Code / ?__site= */
export function siteOverride(c: Context): string | null {
	if (c.env.ALLOW_SITE_OVERRIDE !== "1") return null;
	return adminSiteOverride(c);
}

/** 超管后台切站点：不受 ALLOW_SITE_OVERRIDE 限制（只有已通过 adminGuard 的超管会走到） */
export function adminSiteOverride(c: Context): string | null {
	const v = (c.req.header("x-site-code") || c.req.query("__site") || "").trim().toLowerCase();
	return /^[a-z0-9-]{2,32}$/.test(v) ? v : null;
}

/** Host → 站点。域名未登记时回落默认站点；站点停用时仍然返回（由上层决定 503） */
export async function resolveSiteByHost(env: AppEnv, host?: string | null): Promise<SiteInfo | null> {
	const h = normalizeHost(host);
	if (h && env.SITE_HOST_MAP) {
		try {
			const m = JSON.parse(env.SITE_HOST_MAP) as Record<string, string>;
			const code = m[h];
			if (code) {
				const s = await siteByCode(env, String(code).toLowerCase());
				if (s) return s;
			}
		} catch {
			/* 配置写错就忽略 */
		}
	}
	if (h) {
		const r = await env.DB.prepare(
			'SELECT s.* FROM t_site_domain d JOIN t_sites s ON s.id = d."SiteId" WHERE d."Host" = ? LIMIT 1',
		)
			.bind(h)
			.first();
		const s = mapSite(r as Record<string, unknown> | null);
		if (s) return s;
	}
	return await defaultSite(env);
}

/** 前台/静态资源用的租户中间件：只按 Host 解析，不管后台切换 */
export function tenantMiddleware(): MiddlewareHandler<{
	Bindings: AppEnv;
	Variables: AdminVariables;
}> {
	return async (c, next) => {
		const site = await resolveSiteByHost(c.env, c.req.header("host"));
		if (site) {
			c.set("site", site);
			c.set("siteId", site.id);
		}
		await next();
	};
}

/** 取当前生效站点（中间件/守卫注入），没有则 null */
export function currentSite(c: Context<{ Bindings: AppEnv; Variables: AdminVariables }>): SiteInfo | null {
	return (c.var as { site?: SiteInfo }).site ?? null;
}
