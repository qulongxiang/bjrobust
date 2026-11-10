// 后台：新闻/案例管理（t_news + t_newtype）
import { Hono } from "hono";
import type { AppEnv, AdminVariables } from "../env";
import { nowSql } from "../lib/auth";
import { count, exec, rows } from "../lib/d1";

const app = new Hono<{ Bindings: AppEnv; Variables: AdminVariables }>();
const CN = "cn";

const NEWS_FIELDS =
	"id, Title, NoteTime, Content, UserName, IsShow, IsCommend, OrderBy, NewType, Hits, SmallPic, WebTitle, WebKey, WebDesc, ShowTime, LINK, DOWN, MEMO";

function pick(r: Record<string, unknown>) {
	return {
		id: Number(r.id),
		title: String(r.Title ?? ""),
		noteTime: String(r.NoteTime ?? ""),
		content: String(r.Content ?? ""),
		userName: String(r.UserName ?? ""),
		isShow: Number(r.IsShow ?? 0),
		isCommend: Number(r.IsCommend ?? 0),
		order: Number(r.OrderBy ?? 0),
		newType: Number(r.NewType ?? 0),
		hits: Number(r.Hits ?? 0),
		smallPic: String(r.SmallPic ?? ""),
		webTitle: String(r.WebTitle ?? ""),
		webKey: String(r.WebKey ?? ""),
		webDesc: String(r.WebDesc ?? ""),
		link: String(r.LINK ?? ""),
		down: String(r.DOWN ?? ""),
		memo: String(r.MEMO ?? ""),
	};
}

app.get("/news", async (c) => {
	const db = c.env.DB;
	const page = Math.max(parseInt(c.req.query("page") ?? "1", 10), 1);
	const size = Math.min(Math.max(parseInt(c.req.query("pageSize") ?? "15", 10), 1), 100);
	const type = c.req.query("type");
	const where: string[] = [];
	const params: (string | number)[] = [];
	if (type) {
		where.push("NewType = ?");
		params.push(Number(type));
	}
	const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";
	const total = await count(db.prepare(`SELECT COUNT(*) AS n FROM t_news ${whereSql}`).bind(...params));
	const list = await rows(
		db
			.prepare(`SELECT ${NEWS_FIELDS} FROM t_news ${whereSql} ORDER BY OrderBy DESC, id DESC LIMIT ? OFFSET ?`)
			.bind(...params, size, (page - 1) * size),
	);
	return c.json({ ok: true, total, page, pageSize: size, items: list.map(pick) });
});

app.post("/news", async (c) => {
	const db = c.env.DB;
	const b = await c.req.json().catch(() => null);
	if (!b) return c.json({ error: "请求格式错误" }, 400);
	const title = String(b.title ?? "").trim().slice(0, 255);
	if (!title) return c.json({ error: "标题不能为空" }, 400);
	const now = nowSql();
	const res = await exec(
		db.prepare(
			"INSERT INTO t_news (Title, NoteTime, Content, UserName, IsShow, IsCommend, OrderBy, NewType, Hits, Language, Parent, SmallPic, WebTitle, WebKey, WebDesc, ShowTime, SJ, LINK, DOWN, MEMO) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
		),
		title,
		now,
		String(b.content ?? ""),
		c.get("admin").UserName,
		b.isShow === 0 || b.isShow === false ? 0 : 1,
		b.isCommend === 1 || b.isCommend === true ? 1 : 0,
		Number(b.order ?? 0),
		Number(b.newType ?? 3),
		0,
		CN,
		0,
		String(b.smallPic ?? ""),
		String(b.webTitle ?? ""),
		String(b.webKey ?? ""),
		String(b.webDesc ?? ""),
		now,
		String(b.showTime ?? now),
		String(b.link ?? ""),
		String(b.down ?? ""),
		String(b.memo ?? ""),
	);
	return c.json({ ok: true, id: Number(res.meta.last_row_id) });
});

const UPDATABLE: Record<string, string> = {
	title: "Title",
	noteTime: "NoteTime",
	content: "Content",
	isShow: "IsShow",
	isCommend: "IsCommend",
	order: "OrderBy",
	newType: "NewType",
	smallPic: "SmallPic",
	webTitle: "WebTitle",
	webKey: "WebKey",
	webDesc: "WebDesc",
	link: "LINK",
	down: "DOWN",
	memo: "MEMO",
};

app.put("/news/:id", async (c) => {
	const db = c.env.DB;
	const id = Number(c.req.param("id"));
	const b = await c.req.json().catch(() => null);
	if (!b) return c.json({ error: "请求格式错误" }, 400);
	const sets: string[] = [];
	const params: (string | number)[] = [];
	for (const [k, col] of Object.entries(UPDATABLE)) {
		if (!(k in b)) continue;
		if (col === "IsShow" || col === "IsCommend") params.push(Number(b[k]) === 1 ? 1 : 0);
		else if (col === "OrderBy" || col === "NewType") params.push(Number(b[k]) || 0);
		else params.push(String(b[k] ?? ""));
		sets.push(`${col} = ?`);
	}
	if (!sets.length) return c.json({ error: "没有要更新的字段" }, 400);
	const res = await db.prepare(`UPDATE t_news SET ${sets.join(", ")} WHERE id = ?`).bind(...params, id).run();
	if (!res.meta.changes) return c.json({ error: "记录不存在" }, 404);
	return c.json({ ok: true });
});

app.delete("/news/:id", async (c) => {
	const res = await exec(c.env.DB.prepare("DELETE FROM t_news WHERE id = ?"), Number(c.req.param("id")));
	if (!res.meta.changes) return c.json({ error: "记录不存在" }, 404);
	return c.json({ ok: true });
});

// ---- 新闻分类（t_newtype） ----
app.get("/news-types", async (c) => {
	const list = await rows(c.env.DB.prepare("SELECT id, Called, Language FROM t_newtype ORDER BY id"));
	return c.json({ ok: true, items: list.map((r) => ({ id: Number(r.id), name: String(r.Called ?? "") })) });
});

app.post("/news-types", async (c) => {
	const b = await c.req.json().catch(() => null);
	const name = String(b?.name ?? "").trim().slice(0, 100);
	if (!name) return c.json({ error: "分类名不能为空" }, 400);
	const res = await exec(c.env.DB.prepare("INSERT INTO t_newtype (Called, Language) VALUES (?, ?)"), name, CN);
	return c.json({ ok: true, id: Number(res.meta.last_row_id) });
});

app.put("/news-types/:id", async (c) => {
	const b = await c.req.json().catch(() => null);
	const name = String(b?.name ?? "").trim().slice(0, 100);
	if (!name) return c.json({ error: "分类名不能为空" }, 400);
	const res = await exec(
		c.env.DB.prepare("UPDATE t_newtype SET Called = ? WHERE id = ?"),
		name,
		Number(c.req.param("id")),
	);
	if (!res.meta.changes) return c.json({ error: "记录不存在" }, 404);
	return c.json({ ok: true });
});

app.delete("/news-types/:id", async (c) => {
	const db = c.env.DB;
	const id = Number(c.req.param("id"));
	const used = await count(db.prepare("SELECT COUNT(*) AS n FROM t_news WHERE NewType = ?").bind(id));
	if (used > 0) return c.json({ error: "该分类下仍有内容，不能删除" }, 400);
	const res = await exec(db.prepare("DELETE FROM t_newtype WHERE id = ?"), id);
	if (!res.meta.changes) return c.json({ error: "记录不存在" }, 404);
	return c.json({ ok: true });
});

export default app;
