// 前台数据 API：/api/site/*
// 多站点：所有内容查询都带 SiteId（= 当前 Host 解析出的站点），存量数据归属站点 1（bjrobust）
// 数据模型（与原库一致）：
//   t_news 同时承载 新闻(NewType=3/5/6/7)、成功案例(NewType=4)、横幅(NewType=1/2)
//   t_content 按 Called 存静态页（首页公司简介/公司概况/联系我们/地图/底部版权/首页联系方式/二维码）
//   t_protype 两级产品类树（PID/TypeLevel）
import { Hono } from "hono";
import type { AppEnv, AdminVariables, SiteInfo } from "../env";
import { nowSql } from "../lib/auth";
import { exec, rows } from "../lib/d1";
import { publicSlides } from "../lib/slide";

const app = new Hono<{ Bindings: AppEnv; Variables: AdminVariables }>();

const CN = "cn";

function pageNum(v: string | undefined): number {
	const n = parseInt(v ?? "1", 10);
	return n >= 1 ? n : 1;
}
function pageSize(v: string | undefined): number {
	const n = parseInt(v ?? "10", 10);
	return Math.min(Math.max(n, 1), 50);
}

// 旧站遗留的 /upload/ 图片路径 → R2 的 /assets/upload/（内容内嵌图）
function rewriteUploads(html: string): string {
	return html.replace(/(src|href)\s*=\s*["']?\/upload\//gi, '$1="/assets/upload/');
}

function pickNews(r: Record<string, unknown>) {
	return {
		id: Number(r.id),
		title: String(r.Title ?? ""),
		noteTime: String(r.NoteTime ?? ""),
		content: rewriteUploads(String(r.Content ?? "")),
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

function pickProduct(r: Record<string, unknown>) {
	return {
		id: Number(r.id),
		name: String(r.ProName ?? ""),
		smallPic: String(r.SmallPic ?? ""),
		noteTime: String(r.NoteTime ?? ""),
		order: Number(r.OrderBy ?? 0),
		hits: Number(r.Hits ?? 0),
		typeId: Number(r.TypeID ?? 0),
		webTitle: String(r.WebTitle ?? ""),
		webKey: String(r.WebKey ?? ""),
		webDesc: String(r.WebDesc ?? ""),
	};
}

// ---- 站点信息（前端套主题色/公司名/热线） ----
app.get("/site-info", (c) => {
	const s = c.get("site") as SiteInfo;
	return c.json({
		ok: true,
		site: {
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

// ---- 站点信息 + 静态片段（底部版权/联系方式/二维码等） ----
app.get("/global", async (c) => {
	const db = c.env.DB;
	const siteId = c.get("siteId");
	const g = await db.prepare("SELECT * FROM t_global WHERE SiteId = ? AND Language = ? ORDER BY id LIMIT 1").bind(siteId, CN).first();
	const fragRows = await rows(db.prepare("SELECT Called, Content FROM t_content WHERE SiteId = ? AND Language = ?").bind(siteId, CN));
	const fragments: Record<string, string> = {};
	for (const r of fragRows) {
		// 片段清洗：去掉 <script>（旧站残留的统计代码等），/upload/ 旧路径改写到 /assets/upload/（R2）
		fragments[String(r.Called)] = String(r.Content ?? "")
			.replace(/<script[\s\S]*?<\/script>/gi, "")
			.replace(/(src|href)\s*=\s*["']\/upload\//g, '$1="/assets/upload/');
	}
	return c.json({
		ok: true,
		global: g
			? {
					webname: String(g.Webname ?? ""),
					title: String(g.Title ?? ""),
					keywords: String(g.Keywords ?? ""),
					description: String(g.Description ?? ""),
					beian: String(g.Beian ?? ""),
					web: String(g.Web ?? ""),
				}
			: null,
		fragments,
	});
});

// ---- 首页聚合 ----
app.get("/home", async (c) => {
	const db = c.env.DB;
	const siteId = c.get("siteId");
	const g = await db.prepare("SELECT * FROM t_global WHERE SiteId = ? AND Language = ? ORDER BY id LIMIT 1").bind(siteId, CN).first();
	const aboutRow = await db
		.prepare("SELECT Content FROM t_content WHERE SiteId = ? AND Language = ? AND Called = ? LIMIT 1")
		.bind(siteId, CN, "首页公司简介")
		.first();
	// 首页轮播：优先 t_slide（后台「首页轮播」维护）；没有记录时回退到老站点 t_news(NewType=1)
	let banners = await publicSlides(c.env, siteId);
	if (!banners.length) {
		const bannerRows = await rows(
			db
				.prepare(
					"SELECT id, Title, SmallPic AS pic, NoteTime AS noteTime FROM t_news WHERE SiteId = ? AND IsShow = 1 AND NewType = 1 AND SmallPic <> '' ORDER BY OrderBy DESC, id DESC LIMIT 10",
				)
				.bind(siteId),
		);
		banners = bannerRows.map((r) => ({
			id: Number(r.id),
			title: String(r.Title ?? ""),
			pic: String(r.pic ?? ""),
			noteTime: String(r.noteTime ?? ""),
		}));
	}
	const newsRows = await rows(
		db.prepare(
			"SELECT id, Title, NoteTime, SmallPic, OrderBy, Hits, WebTitle FROM t_news WHERE SiteId = ? AND IsShow = 1 AND NewType = 3 ORDER BY OrderBy DESC, id DESC LIMIT 8",
		).bind(siteId),
	);
	const productRows = await rows(
		db.prepare(
			"SELECT id, ProName, SmallPic, NoteTime, OrderBy, WebTitle FROM t_products WHERE SiteId = ? AND IsShow = 1 AND IsCommend = 1 ORDER BY OrderBy DESC, id DESC LIMIT 12",
		).bind(siteId),
	);
	const caseRows = await rows(
		db.prepare("SELECT id, Title, SmallPic FROM t_news WHERE SiteId = ? AND IsShow = 1 AND NewType = 4 ORDER BY OrderBy DESC, id DESC LIMIT 8").bind(siteId),
	);
	const brandRows = await rows(
		db.prepare("SELECT id, Title, SmallPic, LINK FROM t_news WHERE SiteId = ? AND IsShow = 1 AND NewType = 6 ORDER BY OrderBy DESC, id DESC LIMIT 12").bind(siteId),
	);
	const partnerRows = await rows(
		db.prepare("SELECT id, Title, SmallPic, LINK FROM t_news WHERE SiteId = ? AND IsShow = 1 AND NewType = 7 ORDER BY OrderBy DESC, id DESC LIMIT 18").bind(siteId),
	);
	return c.json({
		ok: true,
		global: g
			? {
					webname: String(g.Webname ?? ""),
					title: String(g.Title ?? ""),
					keywords: String(g.Keywords ?? ""),
					description: String(g.Description ?? ""),
					beian: String(g.Beian ?? ""),
					web: String(g.Web ?? ""),
				}
			: null,
		about: String(aboutRow?.Content ?? ""),
		banners,
		news: newsRows.map((r) => ({
			id: Number(r.id),
			title: String(r.Title ?? ""),
			noteTime: String(r.NoteTime ?? ""),
			pic: String(r.SmallPic ?? ""),
			hits: Number(r.Hits ?? 0),
		})),
		products: productRows.map((r) => ({
			id: Number(r.id),
			name: String(r.ProName ?? ""),
			pic: String(r.SmallPic ?? ""),
			noteTime: String(r.NoteTime ?? ""),
		})),
		cases: caseRows.map((r) => ({
			id: Number(r.id),
			title: String(r.Title ?? ""),
			pic: String(r.SmallPic ?? ""),
		})),
		brands: brandRows.map((r) => ({
			id: Number(r.id),
			title: String(r.Title ?? ""),
			pic: String(r.SmallPic ?? ""),
			link: String(r.LINK ?? ""),
		})),
		partners: partnerRows.map((r) => ({
			id: Number(r.id),
			title: String(r.Title ?? ""),
			pic: String(r.SmallPic ?? ""),
			link: String(r.LINK ?? ""),
		})),
	});
});

// ---- 产品分类树 ----
app.get("/product-types", async (c) => {
	const siteId = c.get("siteId");
	const rowsAll = await rows(
		c.env.DB.prepare('SELECT id, Called, PID, TypeLevel, OrderBy, Memo, ParentPath FROM t_protype WHERE SiteId = ? AND IsShow = 1 ORDER BY OrderBy, id').bind(siteId),
	);
	const items = rowsAll.map((r) => ({
		id: Number(r.id),
		name: String(r.Called ?? ""),
		pid: Number(r.PID ?? 0),
		level: Number(r.TypeLevel ?? 0),
		order: Number(r.OrderBy ?? 0),
		memo: String(r.Memo ?? ""),
		children: [] as { id: number; name: string; pid: number; level: number; order: number; memo: string }[],
	}));
	const byId = new Map(items.map((i) => [i.id, i]));
	const tree = items.filter((i) => !byId.has(i.pid)).map((i) => {
		i.children = items.filter((c) => c.pid === i.id);
		return i;
	});
	return c.json({ ok: true, items, tree });
});

// ---- 产品列表 ----
app.get("/products", async (c) => {
	const db = c.env.DB;
	const siteId = c.get("siteId");
	const page = pageNum(c.req.query("page"));
	const size = pageSize(c.req.query("pageSize"));
	const typeId = c.req.query("typeId");
	// 快速查找产品（还原旧站）：编号 / 标准 / 关键词
	const bh = (c.req.query("bh") ?? "").trim().slice(0, 50);
	const bz = (c.req.query("bz") ?? "").trim().slice(0, 50);
	const kw = (c.req.query("kw") ?? "").trim().slice(0, 50);
	const where: string[] = ["SiteId = ?", "IsShow = 1"];
	const params: (string | number)[] = [siteId];
	if (typeId) {
		where.push("TypeID = ?");
		params.push(Number(typeId));
	}
	if (bh) {
		where.push("BH LIKE ?");
		params.push(`%${bh}%`);
	}
	if (bz) {
		where.push("BZ LIKE ?");
		params.push(`%${bz}%`);
	}
	if (kw) {
		where.push("(ProName LIKE ? OR MEMO LIKE ? OR BH LIKE ? OR BZ LIKE ?)");
		params.push(`%${kw}%`, `%${kw}%`, `%${kw}%`, `%${kw}%`);
	}
	const whereSql = where.join(" AND ");
	const totalRow = await db.prepare(`SELECT COUNT(*) AS n FROM t_products WHERE ${whereSql}`).bind(...params).first();
	const list = await rows(
		db
			.prepare(
				`SELECT id, ProName, SmallPic, NoteTime, OrderBy, Hits, TypeID, WebTitle, WebKey, WebDesc FROM t_products WHERE ${whereSql} ORDER BY OrderBy DESC, id DESC LIMIT ? OFFSET ?`,
			)
			.bind(...params, size, (page - 1) * size),
	);
	return c.json({
		ok: true,
		total: Number(totalRow?.n ?? 0),
		page,
		pageSize: size,
		items: list.map(pickProduct),
	});
});

// ---- 产品详情（含图集/上一件下一件/浏览数+1） ----
app.get("/product/:id", async (c) => {
	const db = c.env.DB;
	const siteId = c.get("siteId");
	const id = Number(c.req.param("id"));
	const rowPro = await db.prepare("SELECT * FROM t_products WHERE SiteId = ? AND IsShow = 1 AND id = ?").bind(siteId, id).first();
	if (!rowPro) return c.json({ error: "产品不存在" }, 404);
	const typeId = Number(rowPro.TypeID ?? 0);
	const order = Number(rowPro.OrderBy ?? 0);
	const prev = await db
		.prepare("SELECT id, ProName FROM t_products WHERE SiteId = ? AND IsShow = 1 AND TypeID = ? AND OrderBy < ? ORDER BY OrderBy DESC, id DESC LIMIT 1")
		.bind(siteId, typeId, order)
		.first();
	const next = await db
		.prepare("SELECT id, ProName FROM t_products WHERE SiteId = ? AND IsShow = 1 AND TypeID = ? AND OrderBy > ? ORDER BY OrderBy ASC, id ASC LIMIT 1")
		.bind(siteId, typeId, order)
		.first();
	const imgRows = await rows(db.prepare("SELECT id, ProName, PicUrl, BigUrl, OrderBy FROM t_img WHERE SiteId = ? AND ProID = ? ORDER BY OrderBy, id").bind(siteId, id));
	const typeRow = await db.prepare("SELECT Called FROM t_protype WHERE SiteId = ? AND id = ?").bind(siteId, typeId).first();
	await exec(db.prepare("UPDATE t_products SET Hits = Hits + 1 WHERE SiteId = ? AND id = ?"), siteId, id);
	return c.json({
		ok: true,
		product: {
			...pickProduct(rowPro),
			content: String(rowPro.Content ?? ""),
			memo: String(rowPro.Memo ?? ""),
		},
		typeName: String(typeRow?.Called ?? ""),
		images: imgRows.map((r) => ({
			id: Number(r.id),
			name: String(r.ProName ?? ""),
			pic: String(r.PicUrl ?? ""),
			big: String(r.BigUrl ?? ""),
		})),
		prev: prev ? { id: Number(prev.id), name: String(prev.ProName ?? "") } : null,
		next: next ? { id: Number(next.id), name: String(next.ProName ?? "") } : null,
	});
});

type Ctx = import("hono").Context<{
	Bindings: AppEnv;
	Variables: AdminVariables;
}>;

// ---- 内页头图（t_banner）：每站每个页面一张，后台可逐页替换；未配置的页面由前端用主题渐变兜底 ----
app.get("/banners", async (c) => {
	const list = await rows(
		c.env.DB.prepare('SELECT "Page", "Title", "Pic" FROM t_banner WHERE "SiteId" = ? AND "IsShow" = 1').bind(
			c.get("siteId"),
		),
	);
	const pages: Record<string, { title: string; pic: string }> = {};
	for (const r of list) {
		const page = String(r.Page ?? "");
		if (!page) continue;
		pages[page] = { title: String(r.Title ?? ""), pic: String(r.Pic ?? "") };
	}
	return c.json({ ok: true, pages });
});

// ---- 内页 banner（NewType=2）：各内页头部配图，取第一条展示 ----
app.get("/page-banner", async (c) => {
	const r = await c.env.DB
		.prepare("SELECT Title, SmallPic FROM t_news WHERE SiteId = ? AND IsShow = 1 AND NewType = 2 ORDER BY OrderBy DESC, id DESC LIMIT 1")
		.bind(c.get("siteId"))
		.first();
	return c.json({ ok: true, title: r ? String(r.Title ?? "") : "", pic: r ? String(r.SmallPic ?? "") : "" });
});

// ---- 新闻分类（前台 tab 用；1/2 为 banner 内部类型，不展示。分类是结构性字典，全站共用） ----
app.get("/news-types", async (c) => {
	const list = await rows(c.env.DB.prepare("SELECT id, Called FROM t_newtype WHERE id IN (3,4,5,6,7) ORDER BY id"));
	return c.json(list.map((r) => ({ id: Number(r.id), name: String(r.Called ?? "") })));
});

// ---- 新闻列表（type: 3=公司新闻 4=成功案例 5=技术支持 6=代理品牌 7=合作伙伴） ----
app.get("/news", async (c) => {
	const db = c.env.DB;
	const siteId = c.get("siteId");
	const page = pageNum(c.req.query("page"));
	const size = pageSize(c.req.query("pageSize"));
	const type = Number(c.req.query("type") ?? 3);
	const totalRow = await db
		.prepare("SELECT COUNT(*) AS n FROM t_news WHERE SiteId = ? AND IsShow = 1 AND NewType = ?")
		.bind(siteId, type)
		.first();
	const list = await rows(
		db
			.prepare(
				"SELECT id, Title, NoteTime, SmallPic, Memo, OrderBy, Hits, WebTitle FROM t_news WHERE SiteId = ? AND IsShow = 1 AND NewType = ? ORDER BY OrderBy DESC, id DESC LIMIT ? OFFSET ?",
			)
			.bind(siteId, type, size, (page - 1) * size),
	);
	const typeRow = await db.prepare("SELECT Called FROM t_newtype WHERE id = ?").bind(type).first();
	return c.json({
		ok: true,
		type: { id: type, name: String(typeRow?.Called ?? "") },
		total: Number(totalRow?.n ?? 0),
		page,
		pageSize: size,
		items: list.map((r) => ({
			id: Number(r.id),
			title: String(r.Title ?? ""),
			noteTime: String(r.NoteTime ?? ""),
			pic: String(r.SmallPic ?? ""),
			memo: String(r.Memo ?? ""),
			hits: Number(r.Hits ?? 0),
		})),
	});
});

// ---- 新闻/案例详情（共用：t_news 按 NewType 区分） ----
async function newsDetail(c: Ctx, id: number) {
	const db = c.env.DB;
	const siteId = c.get("siteId");
	const rowNews = await db.prepare("SELECT * FROM t_news WHERE SiteId = ? AND IsShow = 1 AND id = ?").bind(siteId, id).first();
	if (!rowNews) return c.json({ error: "内容不存在" }, 404);
	const nt = Number(rowNews.NewType ?? 0);
	const order = Number(rowNews.OrderBy ?? 0);
	const prev = await db
		.prepare("SELECT id, Title FROM t_news WHERE SiteId = ? AND IsShow = 1 AND NewType = ? AND OrderBy < ? ORDER BY OrderBy DESC, id DESC LIMIT 1")
		.bind(siteId, nt, order)
		.first();
	const next = await db
		.prepare("SELECT id, Title FROM t_news WHERE SiteId = ? AND IsShow = 1 AND NewType = ? AND OrderBy > ? ORDER BY OrderBy ASC, id ASC LIMIT 1")
		.bind(siteId, nt, order)
		.first();
	await exec(db.prepare("UPDATE t_news SET Hits = Hits + 1 WHERE SiteId = ? AND id = ?"), siteId, id);
	return c.json({
		ok: true,
		news: pickNews(rowNews),
		prev: prev ? { id: Number(prev.id), title: String(prev.Title ?? "") } : null,
		next: next ? { id: Number(next.id), title: String(next.Title ?? "") } : null,
	});
}

app.get("/news/:id", (c) => newsDetail(c, Number(c.req.param("id"))));
app.get("/case/:id", (c) => newsDetail(c, Number(c.req.param("id"))));

// ---- 成功案例列表（t_news NewType=4） ----
app.get("/cases", async (c) => {
	const db = c.env.DB;
	const siteId = c.get("siteId");
	const page = pageNum(c.req.query("page"));
	const size = pageSize(c.req.query("pageSize"));
	const totalRow = await db.prepare("SELECT COUNT(*) AS n FROM t_news WHERE SiteId = ? AND IsShow = 1 AND NewType = 4").bind(siteId).first();
	const list = await rows(
		db
			.prepare(
				"SELECT id, Title, NoteTime, SmallPic, OrderBy, Hits FROM t_news WHERE SiteId = ? AND IsShow = 1 AND NewType = 4 ORDER BY OrderBy DESC, id DESC LIMIT ? OFFSET ?",
			)
			.bind(siteId, size, (page - 1) * size),
	);
	return c.json({
		ok: true,
		total: Number(totalRow?.n ?? 0),
		page,
		pageSize: size,
		items: list.map((r) => ({
			id: Number(r.id),
			title: String(r.Title ?? ""),
			noteTime: String(r.NoteTime ?? ""),
			pic: String(r.SmallPic ?? ""),
			hits: Number(r.Hits ?? 0),
		})),
	});
});

// ---- 静态页（公司概况/联系我们/地图/底部版权…） ----
app.get("/page/:called", async (c) => {
	const siteId = c.get("siteId");
	const called = c.req.param("called");
	const rowPage = await c.env.DB
		.prepare("SELECT Content, NoteTime FROM t_content WHERE SiteId = ? AND Language = ? AND Called = ? LIMIT 1")
		.bind(siteId, CN, called)
		.first();
	if (!rowPage) return c.json({ error: "页面不存在" }, 404);
	return c.json({
		ok: true,
		called,
		content: rewriteUploads(String(rowPage.Content ?? "")),
		noteTime: String(rowPage.NoteTime ?? ""),
	});
});

// ---- 留言提交（限流：同站点同 IP 5 分钟内最多 3 条） ----
app.post("/feedback", async (c) => {
	const db = c.env.DB;
	const siteId = c.get("siteId");
	let body: { name?: unknown; content?: unknown } | null = null;
	try {
		body = await c.req.json();
	} catch {
		return c.json({ error: "请求格式错误" }, 400);
	}
	const name = String(body?.name ?? "").trim().slice(0, 100);
	const content = String(body?.content ?? "").trim().slice(0, 2000);
	if (!name || !content) return c.json({ error: "姓名与内容不能为空" }, 400);
	const ip = (c.req.header("cf-connecting-ip") ?? "local").slice(0, 45);
	const recent = await db
		.prepare("SELECT COUNT(*) AS n FROM t_feedback WHERE SiteId = ? AND IP = ? AND NoteTime > ?")
		.bind(siteId, ip, nowSql(-5))
		.first();
	if (recent && Number(recent.n) >= 3) return c.json({ error: "留言过于频繁，请稍后再试" }, 429);
	await exec(
		db.prepare("INSERT INTO t_feedback (SiteId, Name, Content, NoteTime, IP, Language) VALUES (?, ?, ?, ?, ?, ?)"),
		siteId,
		name,
		content,
		nowSql(),
		ip,
		CN,
	);
	return c.json({ ok: true });
});

export default app;

// ---- R2 图片：/assets/<key> ----
// 分站规则：
//   bjrobust 的历史图片保持 upload/<文件名>、cn-banner/<文件名>（原站目录）
//   新上传走 upload/<站点 Code>/<文件名>、cn-banner/<站点 Code>/<文件名>
// 读取时先试精确 key，再按当前站点前缀回退，最后回退老站前缀（兼容存量数据）
const MIME_BY_EXT: Record<string, string> = {
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".png": "image/png",
	".gif": "image/gif",
	".webp": "image/webp",
	".svg": "image/svg+xml",
	".bmp": "image/bmp",
	".ico": "image/x-icon",
	".pdf": "application/pdf",
	".zip": "application/zip",
};

export function contentTypeOf(key: string, fallback?: string): string {
	const dot = key.lastIndexOf(".");
	const ext = dot >= 0 ? key.slice(dot).toLowerCase() : "";
	return fallback ?? MIME_BY_EXT[ext] ?? "application/octet-stream";
}

export const assetsApp = new Hono<{ Bindings: AppEnv; Variables: AdminVariables }>();
assetsApp.get("/*", async (c) => {
	const bucket = c.env.IMAGES;
	if (!bucket) return c.notFound(); // R2 未开通
	const site = c.get("site") as SiteInfo | undefined;
	const code = site?.code ?? "";
	let key = c.req.path.replace(/^\/assets\//, "");
	if (!key) return c.notFound();

	const tries: string[] = [key];
	if (code) {
		if (key.startsWith("upload/")) tries.push("upload/" + code + "/" + key.slice("upload/".length));
		else if (key.startsWith("cn-banner/")) tries.push("cn-banner/" + code + "/" + key.slice("cn-banner/".length));
		else tries.push("upload/" + code + "/" + key);
	}
	// 兼容库内裸文件名（无 upload/ 前缀）的历史图片
	if (!key.startsWith("upload/") && !key.startsWith("cn-banner/")) tries.push("upload/" + key);

	let obj: Awaited<ReturnType<typeof bucket.get>> = null;
	let hitKey = key;
	for (const t of tries) {
		const o = await bucket.get(t);
		if (o) {
			obj = o;
			hitKey = t;
			break;
		}
	}
	if (!obj) return c.notFound();
	return new Response(obj.body, {
		headers: {
			"Content-Type": contentTypeOf(hitKey, obj.httpMetadata?.contentType),
			"Cache-Control": "public, max-age=86400",
		},
	});
});
