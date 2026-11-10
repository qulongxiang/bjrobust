// 后台认证路由：/api/admin/login | /logout | /me
import { Hono } from "hono";
import type { AppEnv, AdminVariables } from "../env";
import {
	adminGuard,
	clearLoginAttempts,
	clearSessionCookie,
	loginRateLimited,
	makeSessionCookie,
	nowSql,
	verifyLogin,
} from "../lib/auth";
import { exec } from "../lib/d1";

const app = new Hono<{ Bindings: AppEnv; Variables: AdminVariables }>();

app.post("/login", async (c) => {
	let body: { username?: string; password?: string } | null = null;
	try {
		body = await c.req.json();
	} catch {
		return c.json({ error: "请求格式错误" }, 400);
	}
	const ip = c.req.header("cf-connecting-ip") ?? "local";
	if (!body?.username || !body.password) return c.json({ error: "用户名或密码不能为空" }, 400);
	if (loginRateLimited(ip)) return c.json({ error: "尝试次数过多，请 15 分钟后再试" }, 429);

	const res = await verifyLogin(c.env, body.username.trim(), body.password);
	if (res.error || !res.admin) return c.json({ error: res.error ?? "登录失败" }, 401);
	clearLoginAttempts(ip);

	await exec(c.env.DB.prepare("UPDATE t_admin SET LoginTime = ? WHERE id = ?"), nowSql(), res.admin.id);

	c.header("Set-Cookie", makeSessionCookie(c.env, res.admin as AdminVariables["admin"]));
	return c.json({
		ok: true,
		user: {
			id: res.admin.id,
			UserName: res.admin.UserName,
			UserRole: res.admin.UserRole,
			UserRoleCalled: res.admin.UserRoleCalled,
		},
	});
});

app.post("/logout", (c) => {
	c.header("Set-Cookie", clearSessionCookie());
	return c.json({ ok: true });
});

app.get("/me", adminGuard(), (c) => {
	return c.json({ ok: true, user: c.get("admin") });
});

export default app;
