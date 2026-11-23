// 后台：留言管理 / 站点设置 / 静态页 / 管理员账户 / 站点品牌与主题
// 所有数据操作都限定在当前生效站点（SiteId）；超管跨站切换由 adminGuard 决定
import { Hono } from "hono";
import bcrypt from "bcryptjs";
import type { AppEnv, AdminVariables } from "../env";
import { isSuper, nowSql } from "../lib/auth";
import { count, exec, rows } from "../lib/d1";
import { createSlide, deleteSlide, readSlides, updateSlide } from "../lib/slide";
import { normalizeContentImages } from "../lib/content";

const app = new Hono<{ Bindings: AppEnv; Variables: AdminVariables }>();
const CN = "cn";

// ---- 留言（t_feedback） ----
app.get("/feedback", async (c) => {
	const db = c.env.DB;
	const siteId = c.get("siteId");
	const page = Math.max(parseInt(c.req.query("page") ?? "1", 10), 1);
	const size = Math.min(Math.max(parseInt(c.req.query("pageSize") ?? "15", 10), 1), 100);
	const total = await count(db.prepare('SELECT COUNT(*) AS n FROM t_feedback WHERE "SiteId" = ?').bind(siteId));
	const list = await rows(
		db
			.prepare('SELECT id, Name, Content, NoteTime, IP, Language FROM t_feedback WHERE "SiteId" = ? ORDER BY id DESC LIMIT ? OFFSET ?')
			.bind(siteId, size, (page - 1) * size),
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
	const res = await exec(c.env.DB.prepare('DELETE FROM t_feedback WHERE "SiteId" = ? AND id = ?'), c.get("siteId"), Number(c.req.param("id")));
	if (!res.meta.changes) return c.json({ error: "记录不存在" }, 404);
	return c.json({ ok: true });
});

// ---- 站点设置（t_global） ----
app.get("/global", async (c) => {
	const siteId = c.get("siteId");
	const g = await c.env.DB.prepare("SELECT * FROM t_global WHERE SiteId = ? AND Language = ? ORDER BY id LIMIT 1").bind(siteId, CN).first();
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
	const siteId = c.get("siteId");
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
	params.push(String(siteId));
	const res = await db.prepare(`UPDATE t_global SET ${sets.join(", ")} WHERE SiteId = ?`).bind(...params).run();
	if (!res.meta.changes) return c.json({ error: "站点记录不存在" }, 404);
	return c.json({ ok: true });
});

// ---- 静态页（t_content，按 Called 维护） ----
app.get("/content", async (c) => {
	const siteId = c.get("siteId");
	const list = await rows(c.env.DB.prepare("SELECT id, Called, Content, NoteTime FROM t_content WHERE SiteId = ? AND Language = ? ORDER BY id").bind(siteId, CN));
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
	const siteId = c.get("siteId");
	const called = c.req.param("called");
	const b = await c.req.json().catch(() => null);
	const content = await normalizeContentImages(c.env, c.get("site").code, String(b?.content ?? ""));
	if (content === "") return c.json({ error: "内容不能为空" }, 400);
	const row = await db.prepare("SELECT id FROM t_content WHERE SiteId = ? AND Language = ? AND Called = ?").bind(siteId, CN, called).first();
	if (row) {
		await exec(db.prepare("UPDATE t_content SET Content = ?, NoteTime = ? WHERE id = ? AND SiteId = ?"), content, nowSql(), Number(row.id), siteId);
	} else {
		await exec(db.prepare("INSERT INTO t_content (SiteId, Called, NoteTime, Content, Language) VALUES (?,?,?,?,?)"), siteId, called, nowSql(), content, CN);
	}
	return c.json({ ok: true });
});

// ---- 站点品牌信息与主题色（前台顶栏/页脚/主色直接用它） ----
app.get("/site-meta", (c) => {
	const s = c.get("site");
	return c.json({
		ok: true,
		meta: {
			id: s.id,
			code: s.code,
			name: s.name,
			companyName: s.companyName,
			hotline: s.hotline,
			email: s.email,
			logoUrl: s.logoUrl,
			theme: s.theme,
		},
	});
});

const COLOR_RE = /^#[0-9a-fA-F]{3,8}$/;

app.put("/site-meta", async (c) => {
	const db = c.env.DB;
	const siteId = c.get("siteId");
	const b = await c.req.json().catch(() => null);
	if (!b) return c.json({ error: "请求格式错误" }, 400);
	const sets: string[] = [];
	const params: (string | number)[] = [];
	const map: Record<string, string> = {
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
		const t = b.theme as Record<string, unknown> | undefined;
		if (!t || typeof t !== "object") return c.json({ error: "主题格式不合法" }, 400);
		const out: Record<string, string> = {};
		for (const key of ["primary", "primaryDark", "accent"]) {
			const v = t[key];
			if (v == null) continue;
			if (typeof v !== "string" || !COLOR_RE.test(v.trim())) return c.json({ error: `颜色 ${key} 格式不合法` }, 400);
			out[key] = v.trim();
		}
		params.push(JSON.stringify(out));
		sets.push('"Theme" = ?');
	}
	if (!sets.length) return c.json({ error: "没有要更新的字段" }, 400);
	params.push(nowSql(), siteId);
	sets.push('"UpdatedAt" = ?');
	const res = await db.prepare(`UPDATE t_sites SET ${sets.join(", ")} WHERE "id" = ?`).bind(...params).run();
	if (!res.meta.changes) return c.json({ error: "站点不存在" }, 404);
	return c.json({ ok: true });
});

// ---- 首页 banner 轮播（t_slide，当前站点） ----
app.get("/slides", async (c) => c.json({ ok: true, items: await readSlides(c.env, c.get("siteId")) }));

app.post("/slides", async (c) => {
	const b = await c.req.json().catch(() => null);
	if (!b) return c.json({ error: "请求格式错误" }, 400);
	if (!String(b.pic ?? "").trim()) return c.json({ error: "请先上传轮播图片" }, 400);
	const id = await createSlide(c.env, c.get("siteId"), {
		pic: String(b.pic).trim(),
		title: String(b.title ?? ""),
		link: String(b.link ?? ""),
		order: Number(b.order ?? 0) || 0,
	});
	return c.json({ ok: true, id });
});

app.put("/slides/:id", async (c) => {
	const b = await c.req.json().catch(() => null);
	if (!b) return c.json({ error: "请求格式错误" }, 400);
	const ok = await updateSlide(c.env, c.get("siteId"), Number(c.req.param("id")), b);
	if (!ok) return c.json({ error: "记录不存在" }, 404);
	return c.json({ ok: true });
});

app.delete("/slides/:id", async (c) => {
	const ok = await deleteSlide(c.env, c.get("siteId"), Number(c.req.param("id")));
	if (!ok) return c.json({ error: "记录不存在" }, 404);
	return c.json({ ok: true });
});

// ---- 管理员账户（t_admin） ----
// 超管看到所有账号（含平台级 SiteId=0）；站点管理员只看到本站账号
app.get("/users", async (c) => {
	const me = c.get("admin");
	const siteId = c.get("siteId");
	const db = c.env.DB;
	const superAdmin = isSuper(me);
	const list = superAdmin
		? await rows(db.prepare("SELECT id, UserName, UserCalled, UserRole, UserRoleCalled, IsLock, Status, LoginTime, UserType, SiteId FROM t_admin ORDER BY SiteId, id"))
		: await rows(db.prepare("SELECT id, UserName, UserCalled, UserRole, UserRoleCalled, IsLock, Status, LoginTime, UserType, SiteId FROM t_admin WHERE SiteId = ? ORDER BY id").bind(siteId));
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
			siteId: Number(r.SiteId ?? 0),
		})),
	});
});

// 添加管理员：超管可指定 siteId（0 = 平台级），站点管理员只能建本站账号
app.post("/users", async (c) => {
	const db = c.env.DB;
	const me = c.get("admin");
	const superAdmin = isSuper(me);
	const b = await c.req.json().catch(() => null);
	if (!b) return c.json({ error: "请求格式错误" }, 400);
	const username = String(b.username ?? "").trim().slice(0, 50);
	const password = String(b.password ?? "");
	const called = String(b.called ?? "").trim().slice(0, 50) || username;
	if (!username) return c.json({ error: "用户名不能为空" }, 400);
	if (password.length < 6) return c.json({ error: "密码至少 6 位" }, 400);
	// 站点管理员只能给自己站点加账号；平台级账号（SiteId=0）只有超管能建
	let targetSiteId: number;
	if (superAdmin) {
		targetSiteId = "siteId" in b ? Number(b.siteId ?? 0) || 0 : 0;
	} else {
		targetSiteId = c.get("siteId");
		// 只有显式传 siteId=0（想建平台级账号）才拒绝；不传 = 建本站账号
		if ("siteId" in b && Number(b.siteId ?? 0) === 0) {
			return c.json({ error: "站点管理员不能创建平台级账号" }, 403);
		}
	}
	if (targetSiteId > 0) {
		const site = await db.prepare('SELECT id FROM t_sites WHERE "id" = ?').bind(targetSiteId).first();
		if (!site) return c.json({ error: "目标站点不存在" }, 400);
	}
	const exists = await db
		.prepare('SELECT id FROM t_admin WHERE "SiteId" = ? AND UserName = ?')
		.bind(targetSiteId, username)
		.first();
	if (exists) return c.json({ error: "该站点下用户名已存在" }, 400);
	const hash = await bcrypt.hash(password, 10);
	const now = nowSql();
	const res = await exec(
		db.prepare(
			'INSERT INTO t_admin ("SiteId", UserName, PassWord, IsLock, UserCalled, UserRole, UserRoleCalled, UserId, Space, DataBase, ServiceStart, ServiceEnd, IsPointing, Industry, Key, IsCase, Amount, UserType, DbName, RedirectUrl, Status, SiteType, DesignContact, area, coder, designer, infoer, PointDate, SalesMan, LoginTime, ServerName, ServerTel, ServerQQ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
		),
		targetSiteId,
		username,
		hash,
		0,
		called,
		// 角色串不要从建号人身上继承（超管的 "admin" 会让新人被误判为超管）；站点归属由 SiteId 决定
		targetSiteId === 0 ? "0" : "1",
		targetSiteId === 0 ? "平台超管" : "站点管理员",
		0,
		0,
		0,
		now,
		"2099-12-31 00:00:00",
		"0",
		0,
		"",
		0,
		"0",
		2,
		"",
		"",
		0,
		0,
		"",
		"",
		"",
		"",
		"",
		"",
		"",
		"",
		"",
		"",
		"",
	);
	return c.json({ ok: true, id: Number(res.meta.last_row_id) });
});

// ---- 数据统计（仅当前站点） ----
app.get("/stats", async (c) => {
	const db = c.env.DB;
	const siteId = c.get("siteId");
	const [news, products, feedback, logTotal, newsHits, proHits, recentLog, proByType, typeRows, topProducts] =
		await Promise.all([
			count(db.prepare('SELECT COUNT(*) AS n FROM t_news WHERE "SiteId" = ?').bind(siteId)),
			count(db.prepare('SELECT COUNT(*) AS n FROM t_products WHERE "SiteId" = ?').bind(siteId)),
			count(db.prepare('SELECT COUNT(*) AS n FROM t_feedback WHERE "SiteId" = ?').bind(siteId)),
			count(db.prepare('SELECT COUNT(*) AS n FROM t_log WHERE "SiteId" = ?').bind(siteId)),
			count(db.prepare('SELECT COALESCE(SUM(Hits), 0) AS n FROM t_news WHERE "SiteId" = ?').bind(siteId)),
			count(db.prepare('SELECT COALESCE(SUM(Hits), 0) AS n FROM t_products WHERE "SiteId" = ?').bind(siteId)),
			rows(db.prepare('SELECT id, IP, Time, Description FROM t_log WHERE "SiteId" = ? ORDER BY id DESC LIMIT 20').bind(siteId)),
			rows(db.prepare('SELECT TypeID AS typeId, COUNT(*) AS n FROM t_products WHERE "SiteId" = ? GROUP BY TypeID').bind(siteId)),
			rows(db.prepare('SELECT id, Called FROM t_protype WHERE "SiteId" = ?').bind(siteId)),
			rows(
				db.prepare(
					'SELECT p.id, p.ProName AS name, p.Hits AS hits, pt.Called AS typeName FROM t_products p LEFT JOIN t_protype pt ON pt.id = p.TypeID WHERE p."SiteId" = ? ORDER BY p.Hits DESC, p.OrderBy DESC LIMIT 10',
				).bind(siteId),
			),
		]);
	const typeNames = new Map(typeRows.map((r) => [Number(r.id), String(r.Called ?? "")]));
	const byType = proByType
		.map((r) => ({
			id: Number(r.typeId),
			name: typeNames.get(Number(r.typeId)) || (Number(r.typeId) ? `#${r.typeId}` : "未分类"),
			count: Number(r.n),
		}))
		.sort((a, b) => b.count - a.count || a.id - b.id);
	return c.json({
		ok: true,
		news,
		products,
		feedback,
		logTotal,
		hits: newsHits + proHits,
		recentLog: recentLog.map((r) => ({
			id: Number(r.id),
			ip: String(r.IP ?? ""),
			time: String(r.Time ?? ""),
			description: String(r.Description ?? ""),
		})),
		productStats: {
			byType,
			top: topProducts.map((r) => ({
				id: Number(r.id),
				name: String(r.name ?? ""),
				typeName: String(r.typeName ?? "") || "未分类",
				hits: Number(r.hits ?? 0),
			})),
		},
	});
});

app.put("/users/:id/password", async (c) => {
	const db = c.env.DB;
	const id = Number(c.req.param("id"));
	const me = c.get("admin");
	const superAdmin = isSuper(me);
	const target = await db.prepare('SELECT id, "SiteId" FROM t_admin WHERE id = ?').bind(id).first();
	if (!target) return c.json({ error: "记录不存在" }, 404);
	// 权限：本人可改自己；本站账号任何人可改；平台级账号（SiteId=0）与跨站账号只有超管切到对应站点后才能改
	if (id !== me.id) {
		const targetSite = Number(target.SiteId ?? 0);
		if (targetSite === 0 && !superAdmin) return c.json({ error: "不能修改平台级账号" }, 403);
		if (targetSite !== 0 && targetSite !== c.get("siteId")) {
			return c.json({ error: "该账号属于其他站点，请先切换到对应站点" }, 403);
		}
	}
	const b = await c.req.json().catch(() => null);
	const password = String(b?.password ?? "");
	if (password.length < 6) return c.json({ error: "密码至少 6 位" }, 400);
	const hash = await bcrypt.hash(password, 10);
	const res = await exec(db.prepare("UPDATE t_admin SET PassWord = ? WHERE id = ?"), hash, id);
	if (!res.meta.changes) return c.json({ error: "记录不存在" }, 404);
	return c.json({ ok: true });
});

// 锁定/解锁（IsLock 才是启用状态，Status 是服务档位）
app.put("/users/:id/lock", async (c) => {
	const db = c.env.DB;
	const id = Number(c.req.param("id"));
	const me = c.get("admin");
	const superAdmin = isSuper(me);
	if (id === me.id) return c.json({ error: "不能锁定自己" }, 400);
	const target = await db.prepare('SELECT id, "SiteId" FROM t_admin WHERE id = ?').bind(id).first();
	if (!target) return c.json({ error: "记录不存在" }, 404);
	const targetSite = Number(target.SiteId ?? 0);
	if (targetSite === 0 && !superAdmin) return c.json({ error: "不能操作平台级账号" }, 403);
	if (targetSite !== 0 && targetSite !== c.get("siteId")) {
		return c.json({ error: "该账号属于其他站点，请先切换到对应站点" }, 403);
	}
	const b = await c.req.json().catch(() => null);
	const locked = Number(b?.locked ?? 0) === 1 ? 1 : 0;
	const res = await exec(db.prepare("UPDATE t_admin SET IsLock = ? WHERE id = ?"), locked, id);
	if (!res.meta.changes) return c.json({ error: "记录不存在" }, 404);
	return c.json({ ok: true });
});

export default app;
