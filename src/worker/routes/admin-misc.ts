// 后台：留言管理 / 站点设置 / 静态页 / 管理员账户
import { Hono } from "hono";
import bcrypt from "bcryptjs";
import type { AppEnv, AdminVariables } from "../env";
import { nowSql } from "../lib/auth";
import { count, exec, rows } from "../lib/d1";

const app = new Hono<{ Bindings: AppEnv; Variables: AdminVariables }>();
const CN = "cn";

// 超管判定：与原系统一致——角色名为 admin，或权限码为 0
function isSuper(a: { UserRole: string; UserRoleCalled: string }): boolean {
	return a.UserRole === "0" || a.UserRoleCalled === "admin";
}

// ---- 留言（t_feedback） ----
app.get("/feedback", async (c) => {
	const db = c.env.DB;
	const page = Math.max(parseInt(c.req.query("page") ?? "1", 10), 1);
	const size = Math.min(Math.max(parseInt(c.req.query("pageSize") ?? "15", 10), 1), 100);
	const total = await count(db.prepare("SELECT COUNT(*) AS n FROM t_feedback"));
	const list = await rows(
		db.prepare("SELECT id, Name, Content, NoteTime, IP, Language FROM t_feedback ORDER BY id DESC LIMIT ? OFFSET ?").bind(size, (page - 1) * size),
	);
	return c.json({
		ok: true,
		total,
		page,
		pageSize: size,
		items: list.map((r) => ({
			id: Number(r.id),
			name: String(r.Name ?? ""),
			content: String(r.Content ?? ""),
			noteTime: String(r.NoteTime ?? ""),
			ip: String(r.IP ?? ""),
		})),
	});
});

app.delete("/feedback/:id", async (c) => {
	const res = await exec(c.env.DB.prepare("DELETE FROM t_feedback WHERE id = ?"), Number(c.req.param("id")));
	if (!res.meta.changes) return c.json({ error: "记录不存在" }, 404);
	return c.json({ ok: true });
});

// ---- 站点设置（t_global） ----
app.get("/global", async (c) => {
	const g = await c.env.DB.prepare("SELECT * FROM t_global WHERE Language = ? ORDER BY id LIMIT 1").bind(CN).first();
	return c.json({
		ok: true,
		global: g
			? {
					id: Number(g.id),
					webname: String(g.Webname ?? ""),
					title: String(g.Title ?? ""),
					keywords: String(g.Keywords ?? ""),
					description: String(g.Description ?? ""),
					beian: String(g.Beian ?? ""),
					web: String(g.Web ?? ""),
				}
			: null,
	});
});

const GLOBAL_UPDATABLE: Record<string, string> = {
	webname: "Webname",
	title: "Title",
	keywords: "Keywords",
	description: "Description",
	beian: "Beian",
	web: "Web",
};

app.put("/global", async (c) => {
	const db = c.env.DB;
	const b = await c.req.json().catch(() => null);
	if (!b) return c.json({ error: "请求格式错误" }, 400);
	const sets: string[] = [];
	const params: string[] = [];
	for (const [k, col] of Object.entries(GLOBAL_UPDATABLE)) {
		if (!(k in b)) continue;
		params.push(String(b[k] ?? "").slice(0, 1000));
		sets.push(`${col} = ?`);
	}
	if (!sets.length) return c.json({ error: "没有要更新的字段" }, 400);
	const res = await db.prepare(`UPDATE t_global SET ${sets.join(", ")} WHERE Language = ?`).bind(...params, CN).run();
	if (!res.meta.changes) return c.json({ error: "站点记录不存在" }, 404);
	return c.json({ ok: true });
});

// ---- 静态页（t_content，按 Called 维护） ----
app.get("/content", async (c) => {
	const list = await rows(c.env.DB.prepare("SELECT id, Called, Content, NoteTime FROM t_content WHERE Language = ? ORDER BY id").bind(CN));
	return c.json({
		ok: true,
		items: list.map((r) => ({
			id: Number(r.id),
			called: String(r.Called ?? ""),
			content: String(r.Content ?? ""),
			noteTime: String(r.NoteTime ?? ""),
		})),
	});
});

app.put("/content/:called", async (c) => {
	const db = c.env.DB;
	const called = c.req.param("called");
	const b = await c.req.json().catch(() => null);
	const content = String(b?.content ?? "");
	if (content === "") return c.json({ error: "内容不能为空" }, 400);
	const row = await db.prepare("SELECT id FROM t_content WHERE Language = ? AND Called = ?").bind(CN, called).first();
	if (row) {
		await exec(db.prepare("UPDATE t_content SET Content = ?, NoteTime = ? WHERE id = ?"), content, nowSql(), Number(row.id));
	} else {
		await exec(db.prepare("INSERT INTO t_content (Called, NoteTime, Content, Language) VALUES (?,?,?,?)"), called, nowSql(), content, CN);
	}
	return c.json({ ok: true });
});

// ---- 管理员账户（t_admin） ----
app.get("/users", async (c) => {
	const list = await rows(
		c.env.DB.prepare("SELECT id, UserName, UserCalled, UserRole, UserRoleCalled, IsLock, Status, LoginTime, UserType FROM t_admin ORDER BY id"),
	);
	return c.json({
		ok: true,
		items: list.map((r) => ({
			id: Number(r.id),
			userName: String(r.UserName ?? ""),
			called: String(r.UserCalled ?? ""),
			userRole: String(r.UserRole ?? ""),
			userRoleCalled: String(r.UserRoleCalled ?? ""),
			isLock: Number(r.IsLock ?? 0),
			status: Number(r.Status ?? 0),
			loginTime: String(r.LoginTime ?? ""),
			userType: Number(r.UserType ?? 0),
		})),
	});
});

app.put("/users/:id/password", async (c) => {
	const db = c.env.DB;
	const id = Number(c.req.param("id"));
	const me = c.get("admin");
	if (id !== me.id && !isSuper(me)) {
		return c.json({ error: "只有超级管理员可以重置其他账户密码" }, 403);
	}
	const b = await c.req.json().catch(() => null);
	const password = String(b?.password ?? "");
	if (password.length < 6) return c.json({ error: "密码至少 6 位" }, 400);
	const hash = await bcrypt.hash(password, 10);
	const res = await exec(db.prepare("UPDATE t_admin SET PassWord = ? WHERE id = ?"), hash, id);
	if (!res.meta.changes) return c.json({ error: "记录不存在" }, 404);
	return c.json({ ok: true });
});

// 锁定/解锁（与原系统一致：IsLock 才是启用状态，Status 是服务档位）
app.put("/users/:id/lock", async (c) => {
	const db = c.env.DB;
	const id = Number(c.req.param("id"));
	const me = c.get("admin");
	if (id === me.id) return c.json({ error: "不能锁定自己" }, 400);
	if (!isSuper(me)) return c.json({ error: "只有超级管理员可以操作" }, 403);
	const b = await c.req.json().catch(() => null);
	const locked = Number(b?.locked ?? 0) === 1 ? 1 : 0;
	const res = await exec(db.prepare("UPDATE t_admin SET IsLock = ? WHERE id = ?"), locked, id);
	if (!res.meta.changes) return c.json({ error: "记录不存在" }, 404);
	return c.json({ ok: true });
});

export default app;
