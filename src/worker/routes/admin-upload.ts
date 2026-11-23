// 后台：图片上传到 R2
// 分站存储：新图走 upload/<站点Code>/、内页头图走 cn-banner/<站点Code>/
// bjrobust 的历史图片仍在 upload/、cn-banner/ 老前缀下，读取时由 /assets 路由回退兼容
import { Hono } from "hono";
import type { AppEnv, AdminVariables } from "../env";
import { nowSql } from "../lib/auth";

const app = new Hono<{ Bindings: AppEnv; Variables: AdminVariables }>();

const ALLOWED_EXT: Record<string, string> = {
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".png": "image/png",
	".gif": "image/gif",
	".webp": "image/webp",
};
const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const R2_OFF_HINT = "R2 未开通：请先在 Cloudflare 控制台开通 R2、创建桶并恢复 wrangler.json 绑定";

/** 按文件头校验真实类型，避免只改扩展名的伪图片 */
async function sniffImage(file: File): Promise<string | null> {
	const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
	const ascii = (from: number, to: number) => String.fromCharCode(...head.slice(from, to));
	if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "image/jpeg";
	if (ascii(0, 4) === "\x89PNG") return "image/png";
	if (ascii(0, 3) === "GIF") return "image/gif";
	if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
	return null;
}

function uploadPrefix(siteCode: string): string {
	return `upload/${siteCode}/`;
}

/** 站点私有 key / 老站兼容 key 的判定 */
function isDeletable(path: string, siteCode: string): boolean {
	const key = path.replace(/^\//, "");
	if (key.startsWith(uploadPrefix(siteCode))) return true;
	// bjrobust 兼容：老图在 upload/<文件名>（只有一层）
	if (siteCode === "bjrobust" && key.startsWith("upload/") && !key.slice("upload/".length).includes("/")) return true;
	return false;
}

app.post("/upload", async (c) => {
	if (!c.env.IMAGES) return c.json({ error: R2_OFF_HINT }, 503);
	const site = c.get("site");
	const form = await c.req.formData().catch(() => null);
	if (!form) return c.json({ error: "请求格式错误" }, 400);
	const file = form.get("file");
	if (!(file instanceof File)) return c.json({ error: "缺少 file 字段" }, 400);
	if (file.size > MAX_SIZE) return c.json({ error: "文件超过 5MB 限制" }, 400);

	const baseName = file.name.replace(/[^\w.\-]/g, "_").slice(-80);
	const dot = baseName.lastIndexOf(".");
	const ext = dot >= 0 ? baseName.slice(dot).toLowerCase() : "";
	const declared = ALLOWED_EXT[ext];
	if (!declared) return c.json({ error: "仅支持 jpg/jpeg/png/gif/webp 图片" }, 400);
	const sniffed = await sniffImage(file);
	if (!sniffed || sniffed !== declared) return c.json({ error: "文件内容与图片格式不符" }, 400);

	const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
	const key = `${uploadPrefix(site.code)}${name}`;
	await c.env.IMAGES.put(key, file.stream(), {
		httpMetadata: { contentType: declared },
	});
	return c.json({ ok: true, path: `/${key}`, url: `/assets/${key}` });
});

app.get("/upload/list", async (c) => {
	if (!c.env.IMAGES) return c.json({ error: R2_OFF_HINT }, 503);
	const site = c.get("site");
	const bucket = c.env.IMAGES;
	const own = await bucket.list({ prefix: uploadPrefix(site.code), limit: 200 });
	const items = own.objects.map((o) => ({
		key: o.key,
		size: o.size,
		updated: String(o.uploaded ?? ""),
		url: `/assets/${o.key}`,
	}));
	// bjrobust 的历史图片（upload/<文件名>）一并列出，方便老站继续管理
	if (site.code === "bjrobust") {
		const legacy = await bucket.list({ prefix: "upload/", limit: 200 });
		for (const o of legacy.objects) {
			const rest = o.key.slice("upload/".length);
			if (rest.includes("/")) continue; // 其他站点的目录
			items.push({ key: o.key, size: o.size, updated: String(o.uploaded ?? ""), url: `/assets/${o.key}` });
		}
	}
	items.sort((a, b) => (a.updated < b.updated ? 1 : -1));
	return c.json({ ok: true, items });
});

app.delete("/upload", async (c) => {
	if (!c.env.IMAGES) return c.json({ error: R2_OFF_HINT }, 503);
	const site = c.get("site");
	const path = c.req.query("path") ?? "";
	if (!isDeletable(path, site.code)) return c.json({ error: "路径不合法（不能删除其他站点的图片）" }, 400);
	await c.env.IMAGES.delete(path.replace(/^\//, ""));
	return c.json({ ok: true });
});

// ---- 内页头图（每站每个页面一张，存在 t_banner，可覆盖默认图） ----
// 页面键与前端路由一致；bjrobust 的存量图仍在 R2 的 cn-banner/bannerN.jpg，
// 迁移时写入数据库作为初始值，后续替换的图落到本站前缀 cn-banner/<code>/。
const BANNER_PAGES: { page: string; label: string }[] = [
	{ page: "about", label: "公司概况" },
	{ page: "products", label: "产品中心" },
	{ page: "news", label: "新闻资讯" },
	{ page: "cases", label: "成功案例" },
	{ page: "support", label: "技术支持" },
	{ page: "contact", label: "联系我们" },
];

async function readBannerRows(env: AppEnv, siteId: number) {
	const res = await env.DB.prepare(
		'SELECT "Page", "Title", "Pic", "NoteTime" FROM t_banner WHERE "SiteId" = ?',
	)
		.bind(siteId)
		.all();
	return (res.results ?? []) as Record<string, unknown>[];
}

function bannerRes(row: Record<string, unknown> | undefined): { pic: string; title: string; noteTime: string } {
	return {
		pic: String(row?.Pic ?? ""),
		title: String(row?.Title ?? ""),
		noteTime: String(row?.NoteTime ?? ""),
	};
}

app.get("/banners", async (c) => {
	const siteId = c.get("siteId");
	const rows = await readBannerRows(c.env, siteId);
	const map = new Map(rows.map((r) => [String(r.Page ?? ""), r]));
	const items = BANNER_PAGES.map((b) => {
		const r = bannerRes(map.get(b.page));
		return {
			page: b.page,
			label: b.label,
			pic: r.pic,
			url: r.pic ? `/assets/${r.pic.replace(/^\//, "")}` : "",
			updated: r.noteTime,
		};
	});
	return c.json({ ok: true, items });
});

app.put("/banners/:page", async (c) => {
	if (!c.env.IMAGES) return c.json({ error: R2_OFF_HINT }, 503);
	const site = c.get("site");
	const siteId = c.get("siteId");
	const page = c.req.param("page");
	if (!BANNER_PAGES.some((b) => b.page === page)) return c.json({ error: "未知头图页面" }, 400);
	const form = await c.req.formData().catch(() => null);
	if (!form) return c.json({ error: "请求格式错误" }, 400);
	const file = form.get("file");
	if (!(file instanceof File)) return c.json({ error: "缺少 file 字段" }, 400);
	if (file.size > MAX_SIZE) return c.json({ error: "文件超过 5MB 限制" }, 400);
	const dot = file.name.lastIndexOf(".");
	const ext = dot >= 0 ? file.name.slice(dot).toLowerCase() : ".jpg";
	const mime = ALLOWED_EXT[ext];
	if (!mime) return c.json({ error: "只支持 jpg/png/gif/webp" }, 400);
	const sniffed = await sniffImage(file);
	if (!sniffed) return c.json({ error: "文件内容不是有效图片" }, 400);

	const key = `cn-banner/${site.code}/${page}${ext}`;
	await c.env.IMAGES.put(key, file.stream(), { httpMetadata: { contentType: sniffed } });

	const now = nowSql();
	const exists = await c.env.DB.prepare('SELECT "id" FROM t_banner WHERE "SiteId" = ? AND "Page" = ?')
		.bind(siteId, page)
		.first();
	if (exists) {
		await c.env.DB.prepare(
			'UPDATE t_banner SET "Pic" = ?, "NoteTime" = ? WHERE "SiteId" = ? AND "Page" = ?',
		)
			.bind(key, now, siteId, page)
			.run();
	} else {
		await c.env.DB.prepare(
			'INSERT INTO t_banner ("SiteId","Page","Title","Pic","OrderBy","IsShow","NoteTime") VALUES (?,?,?,?,0,1,?)',
		)
			.bind(siteId, page, "", key, now)
			.run();
	}
	return c.json({ ok: true, pic: key });
});

// 清除某页头图：前台退回主题渐变底（不删 R2 对象，避免误删别处引用）
app.delete("/banners/:page", async (c) => {
	const siteId = c.get("siteId");
	const page = c.req.param("page");
	if (!BANNER_PAGES.some((b) => b.page === page)) return c.json({ error: "未知头图页面" }, 400);
	const now = nowSql();
	const exists = await c.env.DB.prepare('SELECT "id" FROM t_banner WHERE "SiteId" = ? AND "Page" = ?')
		.bind(siteId, page)
		.first();
	if (exists) {
		await c.env.DB.prepare(
			'UPDATE t_banner SET "Pic" = \'\', "NoteTime" = ? WHERE "SiteId" = ? AND "Page" = ?',
		)
			.bind(now, siteId, page)
			.run();
	}
	return c.json({ ok: true });
});

export default app;
