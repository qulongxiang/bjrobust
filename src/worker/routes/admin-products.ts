// 后台：产品管理（t_products + t_img 图集 + t_protype 分类树）
import { Hono } from "hono";
import type { AppEnv, AdminVariables } from "../env";
import { nowSql } from "../lib/auth";
import { count, exec, rows } from "../lib/d1";

const app = new Hono<{ Bindings: AppEnv; Variables: AdminVariables }>();
const CN = "cn";

const PRO_FIELDS =
	"id, ProName, Content, Memo, NoteTime, SmallPic, IsShow, IsCommend, OrderBy, TypeID, Hits, WebTitle, WebKey, WebDesc, BH, BZ";

function pick(r: Record<string, unknown>) {
	return {
		id: Number(r.id),
		name: String(r.ProName ?? ""),
		content: String(r.Content ?? ""),
		memo: String(r.Memo ?? ""),
		noteTime: String(r.NoteTime ?? ""),
		smallPic: String(r.SmallPic ?? ""),
		isShow: Number(r.IsShow ?? 0),
		isCommend: Number(r.IsCommend ?? 0),
		order: Number(r.OrderBy ?? 0),
		typeId: Number(r.TypeID ?? 0),
		hits: Number(r.Hits ?? 0),
		webTitle: String(r.WebTitle ?? ""),
		webKey: String(r.WebKey ?? ""),
		webDesc: String(r.WebDesc ?? ""),
		bh: String(r.BH ?? ""),
		bz: String(r.BZ ?? ""),
	};
}

app.get("/products", async (c) => {
	const db = c.env.DB;
	const page = Math.max(parseInt(c.req.query("page") ?? "1", 10), 1);
	const size = Math.min(Math.max(parseInt(c.req.query("pageSize") ?? "15", 10), 1), 100);
	const typeId = c.req.query("typeId");
	const where: string[] = [];
	const params: (string | number)[] = [];
	if (typeId) {
		where.push("TypeID = ?");
		params.push(Number(typeId));
	}
	const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";
	const total = await count(db.prepare(`SELECT COUNT(*) AS n FROM t_products ${whereSql}`).bind(...params));
	const list = await rows(
		db
			.prepare(`SELECT ${PRO_FIELDS} FROM t_products ${whereSql} ORDER BY OrderBy DESC, id DESC LIMIT ? OFFSET ?`)
			.bind(...params, size, (page - 1) * size),
	);
	return c.json({ ok: true, total, page, pageSize: size, items: list.map(pick) });
});

app.post("/products", async (c) => {
	const db = c.env.DB;
	const b = await c.req.json().catch(() => null);
	if (!b) return c.json({ error: "请求格式错误" }, 400);
	const name = String(b.name ?? "").trim().slice(0, 200);
	if (!name) return c.json({ error: "产品名不能为空" }, 400);
	const now = nowSql();
	const res = await exec(
		db.prepare(
			"INSERT INTO t_products (ProName, Content, Memo, NoteTime, SmallPic, IsShow, IsCommend, OrderBy, TypeID, Hits, Language, WebTitle, WebKey, WebDesc, BH, BZ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
		),
		name,
		String(b.content ?? ""),
		String(b.memo ?? ""),
		now,
		String(b.smallPic ?? ""),
		b.isShow === 0 || b.isShow === false ? 0 : 1,
		b.isCommend === 1 || b.isCommend === true ? 1 : 0,
		Number(b.order ?? 0),
		Number(b.typeId ?? 0),
		0,
		CN,
		String(b.webTitle ?? ""),
		String(b.webKey ?? ""),
		String(b.webDesc ?? ""),
		String(b.bh ?? ""),
		String(b.bz ?? ""),
	);
	return c.json({ ok: true, id: Number(res.meta.last_row_id) });
});

const UPDATABLE: Record<string, string> = {
	name: "ProName",
	content: "Content",
	memo: "Memo",
	noteTime: "NoteTime",
	smallPic: "SmallPic",
	isShow: "IsShow",
	isCommend: "IsCommend",
	order: "OrderBy",
	typeId: "TypeID",
	webTitle: "WebTitle",
	webKey: "WebKey",
	webDesc: "WebDesc",
	bh: "BH",
	bz: "BZ",
};

app.put("/products/:id", async (c) => {
	const db = c.env.DB;
	const id = Number(c.req.param("id"));
	const b = await c.req.json().catch(() => null);
	if (!b) return c.json({ error: "请求格式错误" }, 400);
	const sets: string[] = [];
	const params: (string | number)[] = [];
	for (const [k, col] of Object.entries(UPDATABLE)) {
		if (!(k in b)) continue;
		if (col === "IsShow" || col === "IsCommend") params.push(Number(b[k]) === 1 ? 1 : 0);
		else if (col === "OrderBy" || col === "TypeID") params.push(Number(b[k]) || 0);
		else params.push(String(b[k] ?? ""));
		sets.push(`${col} = ?`);
	}
	if (!sets.length) return c.json({ error: "没有要更新的字段" }, 400);
	const res = await db.prepare(`UPDATE t_products SET ${sets.join(", ")} WHERE id = ?`).bind(...params, id).run();
	if (!res.meta.changes) return c.json({ error: "记录不存在" }, 404);
	return c.json({ ok: true });
});

app.delete("/products/:id", async (c) => {
	const db = c.env.DB;
	const id = Number(c.req.param("id"));
	await exec(db.prepare("DELETE FROM t_img WHERE ProID = ?"), id);
	const res = await exec(db.prepare("DELETE FROM t_products WHERE id = ?"), id);
	if (!res.meta.changes) return c.json({ error: "记录不存在" }, 404);
	return c.json({ ok: true });
});

// ---- 产品图集（t_img） ----
app.get("/products/:id/images", async (c) => {
	const id = Number(c.req.param("id"));
	const list = await rows(
		c.env.DB.prepare("SELECT id, ProName, PicUrl, BigUrl, OrderBy, IsShow FROM t_img WHERE ProID = ? ORDER BY OrderBy, id").bind(id),
	);
	return c.json({
		ok: true,
		items: list.map((r) => ({
			id: Number(r.id),
			name: String(r.ProName ?? ""),
			pic: String(r.PicUrl ?? ""),
			big: String(r.BigUrl ?? ""),
			order: Number(r.OrderBy ?? 0),
			isShow: Number(r.IsShow ?? 0),
		})),
	});
});

app.post("/products/:id/images", async (c) => {
	const db = c.env.DB;
	const id = Number(c.req.param("id"));
	const exists = await db.prepare("SELECT id FROM t_products WHERE id = ?").bind(id).first();
	if (!exists) return c.json({ error: "产品不存在" }, 404);
	const b = await c.req.json().catch(() => null);
	if (!b) return c.json({ error: "请求格式错误" }, 400);
	const pic = String(b.pic ?? "").trim();
	if (!pic) return c.json({ error: "图片地址不能为空" }, 400);
	const res = await exec(
		db.prepare("INSERT INTO t_img (ProName, PicUrl, BigUrl, NoteTime, IsShow, IsCommend, OrderBy, ProID, Language) VALUES (?,?,?,?,?,?,?,?,?)"),
		String(b.name ?? ""),
		pic,
		String(b.big ?? pic),
		nowSql(),
		1,
		0,
		Number(b.order ?? 0),
		id,
		CN,
	);
	return c.json({ ok: true, id: Number(res.meta.last_row_id) });
});

app.delete("/images/:id", async (c) => {
	const res = await exec(c.env.DB.prepare("DELETE FROM t_img WHERE id = ?"), Number(c.req.param("id")));
	if (!res.meta.changes) return c.json({ error: "记录不存在" }, 404);
	return c.json({ ok: true });
});

// ---- 产品分类（t_protype，两级树） ----
app.get("/product-types", async (c) => {
	const list = await rows(
		c.env.DB.prepare("SELECT id, Called, PicUrl, OrderBy, IsShow, Memo, PID, TypeLevel, ParentPath FROM t_protype ORDER BY OrderBy, id"),
	);
	const items = list.map((r) => ({
		id: Number(r.id),
		name: String(r.Called ?? ""),
		pic: String(r.PicUrl ?? ""),
		order: Number(r.OrderBy ?? 0),
		isShow: Number(r.IsShow ?? 0),
		memo: String(r.Memo ?? ""),
		pid: Number(r.PID ?? 0),
		level: Number(r.TypeLevel ?? 0),
	}));
	const byId = new Map(items.map((i) => [i.id, i]));
	const tree = items
		.filter((i) => i.pid === 0 || !byId.has(i.pid))
		.map((i) => ({ ...i, children: items.filter((c) => c.pid === i.id) }));
	return c.json({ ok: true, items, tree });
});

app.post("/product-types", async (c) => {
	const db = c.env.DB;
	const b = await c.req.json().catch(() => null);
	const name = String(b?.name ?? "").trim().slice(0, 100);
	if (!name) return c.json({ error: "分类名不能为空" }, 400);
	const pid = Number(b.pid ?? 0);
	const level = pid ? 1 : 0;
	if (pid) {
		const parent = await db.prepare("SELECT id FROM t_protype WHERE id = ?").bind(pid).first();
		if (!parent) return c.json({ error: "父分类不存在" }, 400);
	}
	const res = await exec(
		db.prepare("INSERT INTO t_protype (Called, PicUrl, OrderBy, IsShow, Memo, PID, TypeLevel, Language, ParentPath, NoteTime) VALUES (?,?,?,?,?,?,?,?,?,?)"),
		name,
		String(b.pic ?? ""),
		Number(b.order ?? 0),
		1,
		String(b.memo ?? ""),
		pid,
		level,
		CN,
		pid ? String(pid) : "",
		nowSql(),
	);
	return c.json({ ok: true, id: Number(res.meta.last_row_id) });
});

const TYPE_UPDATABLE: Record<string, string> = {
	name: "Called",
	pic: "PicUrl",
	order: "OrderBy",
	isShow: "IsShow",
	memo: "Memo",
	pid: "PID",
};

app.put("/product-types/:id", async (c) => {
	const db = c.env.DB;
	const id = Number(c.req.param("id"));
	const b = await c.req.json().catch(() => null);
	if (!b) return c.json({ error: "请求格式错误" }, 400);
	const sets: string[] = [];
	const params: (string | number)[] = [];
	for (const [k, col] of Object.entries(TYPE_UPDATABLE)) {
		if (!(k in b)) continue;
		if (col === "IsShow") params.push(Number(b[k]) === 1 ? 1 : 0);
		else if (col === "OrderBy" || col === "PID") params.push(Number(b[k]) || 0);
		else params.push(String(b[k] ?? ""));
		sets.push(`${col} = ?`);
	}
	if (!sets.length) return c.json({ error: "没有要更新的字段" }, 400);
	const res = await db.prepare(`UPDATE t_protype SET ${sets.join(", ")} WHERE id = ?`).bind(...params, id).run();
	if (!res.meta.changes) return c.json({ error: "记录不存在" }, 404);
	return c.json({ ok: true });
});

app.delete("/product-types/:id", async (c) => {
	const db = c.env.DB;
	const id = Number(c.req.param("id"));
	const hasChildren = await count(db.prepare("SELECT COUNT(*) AS n FROM t_protype WHERE PID = ?").bind(id));
	if (hasChildren > 0) return c.json({ error: "该分类下有子分类，不能删除" }, 400);
	const used = await count(db.prepare("SELECT COUNT(*) AS n FROM t_products WHERE TypeID = ?").bind(id));
	if (used > 0) return c.json({ error: "该分类下仍有产品，不能删除" }, 400);
	const res = await exec(db.prepare("DELETE FROM t_protype WHERE id = ?"), id);
	if (!res.meta.changes) return c.json({ error: "记录不存在" }, 404);
	return c.json({ ok: true });
});

export default app;
