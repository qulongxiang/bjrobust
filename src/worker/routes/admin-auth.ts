// 后台认证路由：/api/admin/login | /logout | /me
import { Hono } from "hono";
import type { AppEnv, AdminVariables } from "../env";
import {
	adminGuard,
	clearSessionCookie,
	isSuper,
	makeSessionCookie,
	nowSql,
	verifyLogin,
} from "../lib/auth";
import { exec, rows } from "../lib/d1";
import { clearLoginBlock, clientIp, loginBlocked } from "../lib/security";

const app = new Hono<{ Bindings: AppEnv; Variables: AdminVariables }>();

app.post("/login", async (c) => {
	let body: { username?: string; password?: string } | null = null;
	try {
		body = await c.req.json();
	} catch {
		return c.json({ error: "请求格式错误" }, 400);
	}
	const site = c.get("site");
	if (!site) return c.json({ error: "站点未配置" }, 404);
	const ip = clientIp(c);
	if (!body?.username || !body.password) return c.json({ error: "用户名或密码不能为空" }, 400);
	if (await loginBlocked(c.env, ip, `login:${site.code}`)) {
		return c.json({ error: "尝试次数过多，请 15 分钟后再试" }, 429);
	}

	const res = await verifyLogin(c.env, body.username.trim(), body.password, site.id);
	if (res.error || !res.admin) return c.json({ error: res.error ?? "登录失败" }, 401);
	await clearLoginBlock(c.env, ip, `login:${site.code}`);

	await exec(c.env.DB.prepare("UPDATE t_admin SET LoginTime = ? WHERE id = ?"), nowSql(), res.admin.id);

	const secure = new URL(c.req.url).protocol === "https:";
	c.header("Set-Cookie", makeSessionCookie(c.env, res.admin, secure));
	return c.json({
		ok: true,
		user: {
			id: res.admin.id,
			UserName: res.admin.UserName,
			UserRole: res.admin.UserRole,
			UserRoleCalled: res.admin.UserRoleCalled,
			siteId: res.admin.siteId,
		},
	});
});

app.post("/logout", (c) => {
	c.header("Set-Cookie", clearSessionCookie(new URL(c.req.url).protocol === "https:"));
	return c.json({ ok: true });
});

// 当前会话：用户 + 生效站点 + 可切换站点列表（仅超管可跨站）
app.get("/me", adminGuard(), async (c) => {
	const admin = c.get("admin");
	const site = c.get("site");
	const superAdmin = isSuper(admin);

	let sites: { code: string; name: string }[] = [];
	if (superAdmin) {
		const list = await rows(c.env.DB.prepare('SELECT "Code", "Name" FROM t_sites WHERE "IsActive" = 1 ORDER BY "Sort", "id"'));
		sites = list.map((r) => ({ code: String(r.Code ?? ""), name: String(r.Name ?? "") }));
	} else {
		sites = [{ code: site.code, name: site.name }];
	}

	return c.json({
		ok: true,
		user: {
			id: admin.id,
			UserName: admin.UserName,
			UserRole: admin.UserRole,
			UserRoleCalled: admin.UserRoleCalled,
			siteId: admin.siteId,
			isSuper: superAdmin,
		},
		site: {
			code: site.code,
			name: site.name,
			companyName: site.companyName,
			theme: site.theme,
		},
		sites,
	});
});

export default app;
