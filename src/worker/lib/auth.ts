// 认证核心：JWT(HS256) 会话 + bcrypt 登录验证 + 站点归属 + 防暴破限流
import { createHmac, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { getCookie } from "hono/cookie";
import type { Context, MiddlewareHandler } from "hono";
import type { AdminInfo, AppEnv, AdminVariables, SiteInfo } from "../env";
import { adminSiteOverride, siteByCode, siteById, resolveSiteByHost } from "./tenant";

export const COOKIE_NAME = "bjrobust_admin";
const MAX_AGE = 60 * 60 * 12; // 会话 12 小时

type JwtPayload = { id: number; u: string; r: string; rc: string; s: number; exp: number };

// 字节 → Latin1 二进制串（btoa 要求 ≤255 的字符，不能走 TextDecoder 的 UTF-8 解码）
function bytesToBin(bytes: Uint8Array): string {
	let s = "";
	for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
	return s;
}

function b64url(input: string | Uint8Array): string {
	// RFC 7515：JSON 序列化按 UTF-8 字节处理；HMAC 摘要本身是字节
	const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
	return btoa(bytesToBin(bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array {
	let t = s.replace(/-/g, "+").replace(/_/g, "/");
	while (t.length % 4) t += "=";
	const bin = atob(t);
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
}

export function signJwt(secret: string, payload: JwtPayload): string {
	const head = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
	const body = b64url(JSON.stringify(payload));
	const sig = new Uint8Array(createHmac("sha256", secret).update(`${head}.${body}`).digest());
	return `${head}.${body}.${b64url(sig)}`;
}

export function verifyJwt(secret: string, token: string): JwtPayload | null {
	const parts = token.split(".");
	if (parts.length !== 3) return null;
	const expected = new Uint8Array(
		createHmac("sha256", secret).update(`${parts[0]}.${parts[1]}`).digest(),
	);
	const actual = b64urlDecode(parts[2]);
	if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
	try {
		const p = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[1]))) as JwtPayload;
		if (typeof p.exp !== "number" || p.exp * 1000 < Date.now()) return null;
		if (typeof p.s !== "number") return null; // 旧版会话没有站点字段，强制重新登录
		return p;
	} catch {
		return null;
	}
}

/** Secure 只在 https 下发（本地 http dev 不加，否则 cookie 存不下） */
export function makeSessionCookie(env: AppEnv, admin: AdminInfo, secure: boolean): string {
	const token = signJwt(env.JWT_SECRET, {
		id: admin.id,
		u: admin.UserName,
		r: admin.UserRole,
		rc: admin.UserRoleCalled,
		s: admin.siteId,
		exp: Math.floor(Date.now() / 1000) + MAX_AGE,
	});
	// 不加 Domain：cookie 严格绑定当前主机名，避免 *.qlxtools.asia 各站点共享后台会话
	return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE}${secure ? "; Secure" : ""}`;
}

export function clearSessionCookie(secure: boolean): string {
	return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;
}

/** 超管判定：权限码为 0、角色名为 admin，或 SiteId=0（平台级账号） */
export function isSuper(a: { UserRole: string; UserRoleCalled: string; siteId: number }): boolean {
	// 唯一判据是账号归属：SiteId=0 才是平台超管；>0 一律是站点管理员。
	// 不再看 UserRole/UserRoleCalled——早期从原型继承的 "admin" 角色串会让人误判成超管。
	return a.siteId === 0;
}

// ---- 登录验证（t_admin，UserType=2 为管理员；密码为 bcrypt 哈希） ----
export type AdminRow = {
	id: number;
	UserName: string;
	UserRole: string;
	UserRoleCalled: string;
	siteId: number;
};

export async function verifyLogin(
	env: AppEnv,
	userName: string,
	password: string,
	siteId: number,
): Promise<{ error?: string; admin?: AdminRow }> {
	// 本站点账号优先；平台超管（SiteId=0）可在任意域名登录
	const row = await env.DB.prepare(
		'SELECT id, UserName, PassWord, UserRole, UserRoleCalled, IsLock, "SiteId" FROM t_admin WHERE UserName = ? AND UserType = 2 AND ("SiteId" = ? OR "SiteId" = 0) ORDER BY CASE WHEN "SiteId" = ? THEN 0 ELSE 1 END LIMIT 1',
	)
		.bind(userName, siteId, siteId)
		.first();
	if (!row) return { error: "用户名或密码错误" };
	// 与原系统一致：只校验 IsLock（Status 是服务档位，不是启用标志）
	if (Number(row.IsLock) === 1) return { error: "账户已被锁定" };
	const ok = await bcrypt.compare(password, String(row.PassWord));
	if (!ok) return { error: "用户名或密码错误" };
	return {
		admin: {
			id: Number(row.id),
			UserName: String(row.UserName),
			UserRole: String(row.UserRole),
			UserRoleCalled: String(row.UserRoleCalled ?? ""),
			siteId: Number(row.SiteId ?? 0),
		},
	};
}

// 北京时间（与原站点服务器时区一致）；offsetMinutes 可取偏移
export function nowSql(offsetMinutes = 0): string {
	const d = new Date(Date.now() + 8 * 3600 * 1000 + offsetMinutes * 60 * 1000);
	const p = (n: number) => String(n).padStart(2, "0");
	return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

// ---- 管理员会话守卫（同时确定本次请求生效的站点） ----
export function adminGuard(): MiddlewareHandler<{
	Bindings: AppEnv;
	Variables: AdminVariables;
}> {
	return async (c: Context, next) => {
		const token = getCookie(c, COOKIE_NAME);
		if (!token) return c.json({ error: "未登录" }, 401);
		const p = verifyJwt(c.env.JWT_SECRET, token);
		if (!p) return c.json({ error: "会话已过期，请重新登录" }, 401);
		const admin: AdminInfo = {
			id: p.id,
			UserName: p.u,
			UserRole: p.r,
			UserRoleCalled: p.rc,
			siteId: Number(p.s ?? 0),
		};

		const hostSite = await resolveSiteByHost(c.env, c.req.header("host"));
		let active: SiteInfo | null = null;
		if (isSuper(admin)) {
			// 超管：优先 X-Site-Code（后台切站点），否则用当前域名对应站点
			const override = adminSiteOverride(c);
			if (override) active = await siteByCode(c.env, override);
			if (!active) active = hostSite;
		} else {
			// 站点管理员：只能操作自己站点，忽略域名与切换头
			active = await siteById(c.env, admin.siteId);
		}
		if (!active) return c.json({ error: "站点不存在或未配置" }, 404);
		if (!active.isActive) return c.json({ error: "站点已停用" }, 503);

		c.set("admin", admin);
		c.set("site", active);
		c.set("siteId", active.id);
		await next();
	};
}
