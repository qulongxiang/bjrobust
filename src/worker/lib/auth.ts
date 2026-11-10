// 认证核心：JWT(HS256) 会话 + bcrypt 登录验证 + 防暴破限流
import { createHmac, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { getCookie } from "hono/cookie";
import type { Context, MiddlewareHandler } from "hono";
import type { AdminInfo, AppEnv } from "../env";

export const COOKIE_NAME = "bjrobust_admin";
const MAX_AGE = 60 * 60 * 12; // 会话 12 小时

type JwtPayload = { id: number; u: string; r: string; rc: string; exp: number };

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
		return p;
	} catch {
		return null;
	}
}

export function makeSessionCookie(env: AppEnv, admin: AdminInfo): string {
	const token = signJwt(env.JWT_SECRET, {
		id: admin.id,
		u: admin.UserName,
		r: admin.UserRole,
		rc: admin.UserRoleCalled,
		exp: Math.floor(Date.now() / 1000) + MAX_AGE,
	});
	return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE}`;
}

export function clearSessionCookie(): string {
	return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

// ---- 防暴破：按 IP 计数（isolate 内存级，最佳努力；跨节点不共享） ----
const attempts = new Map<string, { n: number; t: number }>();

export function loginRateLimited(ip: string): boolean {
	const now = Date.now();
	const a = attempts.get(ip);
	if (!a || now - a.t > 15 * 60 * 1000) {
		attempts.set(ip, { n: 1, t: now });
		return false;
	}
	a.n += 1;
	return a.n > 10; // 15 分钟内第 11 次失败起拒绝
}

export function clearLoginAttempts(ip: string): void {
	attempts.delete(ip);
}

// ---- 登录验证（t_admin，UserType=2 为管理员；密码为 bcrypt 哈希） ----
export type AdminRow = { id: number; UserName: string; UserRole: string; UserRoleCalled: string };

export async function verifyLogin(env: AppEnv, userName: string, password: string): Promise<{ error?: string; admin?: AdminRow }> {
	const row = await env.DB.prepare(
		"SELECT id, UserName, PassWord, UserRole, UserRoleCalled, IsLock, Status FROM t_admin WHERE UserName = ? AND UserType = 2 LIMIT 1",
	)
		.bind(userName)
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
		},
	};
}

// 北京时间（与原站点服务器时区一致）；offsetMinutes 可取偏移
export function nowSql(offsetMinutes = 0): string {
	const d = new Date(Date.now() + 8 * 3600 * 1000 + offsetMinutes * 60 * 1000);
	const p = (n: number) => String(n).padStart(2, "0");
	return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

// ---- 管理员会话守卫 ----
export function adminGuard(): MiddlewareHandler<{
	Bindings: AppEnv;
	Variables: { admin: AdminInfo };
}> {
	return async (c: Context, next) => {
		const token = getCookie(c, COOKIE_NAME);
		if (!token) return c.json({ error: "未登录" }, 401);
		const p = verifyJwt(c.env.JWT_SECRET, token);
		if (!p) return c.json({ error: "会话已过期，请重新登录" }, 401);
		c.set("admin", { id: p.id, UserName: p.u, UserRole: p.r, UserRoleCalled: p.rc });
		await next();
	};
}
