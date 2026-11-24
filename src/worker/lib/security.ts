// 安全基线：响应头（CSP 等）+ 后台写请求 CSRF 校验 + D1 持久化登录限流
import type { Context, MiddlewareHandler } from "hono";
import type { AppEnv, AdminVariables } from "../env";
import { exec } from "./d1";

/** IP：优先 Cloudflare 头，其次回落本地 */
export function clientIp(c: Context): string {
	return (c.req.header("cf-connecting-ip") ?? c.req.header("x-real-ip") ?? "local").slice(0, 45);
}

// ---------------- 安全响应头 ----------------
const CSP_BASE = [
	"default-src 'self'",
	"base-uri 'self'",
	"form-action 'self'",
	"frame-ancestors 'self'",
	"object-src 'none'",
	"img-src 'self' data: blob: https:",
	"font-src 'self' data:",
	"style-src 'self' 'unsafe-inline'",
	// 联系页按需加载高德地图 JS API；CF 会自动注入 Web Analytics 的 beacon 脚本
	"script-src 'self' https://webapi.amap.com https://static.cloudflareinsights.com",
	"connect-src 'self' https: https://cloudflareinsights.com",
];

export function securityHeaders(): MiddlewareHandler<{
	Bindings: AppEnv;
	Variables: AdminVariables;
}> {
	return async (c, next) => {
		await next();
		const res = c.res;
		const headers = new Headers(res.headers);
		headers.set("X-Content-Type-Options", "nosniff");
		headers.set("X-Frame-Options", "SAMEORIGIN");
		headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
		headers.set("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
		const isHttps = new URL(c.req.url).protocol === "https:";
		// 只在 https 下下发 CSP/HSTS：本地 dev 的 HMR、wrangler 注入等依赖内联脚本
		if (isHttps && !headers.has("Content-Security-Policy")) {
			headers.set("Content-Security-Policy", CSP_BASE.join("; "));
			headers.set("Strict-Transport-Security", "max-age=31536000");
		}
		c.res = new Response(res.body, { status: res.status, statusText: res.statusText, headers });
	};
}

// ---------------- CSRF ----------------
// 多站点都在 *.qlxtools.asia 下，属于同一个 "site"（eTLD+1），
// SameSite=Lax 挡不住子域互发 POST，因此后台写操作必须带自定义头 + Origin 校验。
export function csrfGuard(): MiddlewareHandler<{
	Bindings: AppEnv;
	Variables: AdminVariables;
}> {
	return async (c, next) => {
		const method = c.req.method.toUpperCase();
		if (method === "GET" || method === "HEAD" || method === "OPTIONS") return await next();
		if (c.req.header("x-csrf") !== "1") {
			return c.json({ error: "缺少 X-CSRF 校验头" }, 403);
		}
		const origin = c.req.header("origin");
		if (origin) {
			try {
				if (new URL(origin).host !== new URL(c.req.url).host) {
					return c.json({ error: "跨站请求被拒绝" }, 403);
				}
			} catch {
				return c.json({ error: "Origin 不合法" }, 403);
			}
		}
		await next();
	};
}

// ---------------- 登录限流（D1 持久化，跨节点生效） ----------------
const memoryAttempts = new Map<string, { n: number; t: number }>();

/**
 * 同 IP 15 分钟内失败超过 10 次即拒绝。
 * 计数落 D1（t_throttle），避免 isolate 内存限流在多节点下形同虚设；
 * D1 异常时退回内存计数，保证不因限流本身导致登录不可用。
 */
export async function loginBlocked(env: AppEnv, ip: string, key = "admin-login"): Promise<boolean> {
	const k = `${key}:${ip}`;
	const limit = 10;
	const windowMs = 15 * 60 * 1000;
	try {
		const now = Date.now();
		const row = await env.DB.prepare('SELECT "Count", "WindowStart" FROM t_throttle WHERE "Key" = ?').bind(k).first();
		const start = row ? Date.parse(String(row.WindowStart)) : 0;
		const count = row && now - start < windowMs ? Number(row.Count) : 0;
		if (count >= limit) return true;
		const newStart = row && now - start < windowMs ? String(row.WindowStart) : new Date(now).toISOString();
		await exec(
			env.DB.prepare(
				'INSERT INTO t_throttle ("Key","Count","WindowStart") VALUES (?,?,?) ON CONFLICT("Key") DO UPDATE SET "Count" = excluded."Count", "WindowStart" = excluded."WindowStart"',
			),
			k,
			count + 1,
			newStart,
		);
		return false;
	} catch {
		const a = memoryAttempts.get(k);
		const now = Date.now();
		if (!a || now - a.t > windowMs) {
			memoryAttempts.set(k, { n: 1, t: now });
			return false;
		}
		a.n += 1;
		return a.n > limit;
	}
}

/** 登录成功后清零计数 */
export async function clearLoginBlock(env: AppEnv, ip: string, key = "admin-login"): Promise<void> {
	const k = `${key}:${ip}`;
	memoryAttempts.delete(k);
	try {
		await exec(env.DB.prepare('DELETE FROM t_throttle WHERE "Key" = ?'), k);
	} catch {
		/* 忽略 */
	}
}
