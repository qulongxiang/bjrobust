// 后台：图片上传到 R2
// 桶根直接是站点目录：<站点Code>/upload/<年>/<月>/<日>/<文件名>，内页头图 <站点Code>/cn-banner/<年>/<月>/<日>/
// 路径规则统一在 lib/storage.ts，这里只做上传校验与调度
import { Hono } from "hono";
import type { AppEnv, AdminVariables } from "../env";
import { isBannerPage, readBannerEntries, saveBannerFile, setBannerPic } from "../lib/banner";
import { ALLOWED_EXT, MAX_SIZE, sniffImage } from "../lib/upload";
import { bareKey, imageKey, isOwnedKey, legacyEnabled } from "../lib/storage";
import { audit } from "../lib/audit";

const app = new Hono<{ Bindings: AppEnv; Variables: AdminVariables }>();

const R2_OFF_HINT = "R2 未开通：请先在 Cloudflare 控制台开通 R2、创建桶并恢复 wrangler.json 绑定";

/** 站点私有前缀：<code>/upload/ */
function uploadPrefix(siteCode: string): string {
	return `${siteCode}/upload/`;
}

/** 站点私有 key 的判定（legacy 兜底由 LEGACY_LOOKUP 控制） */
function isDeletable(path: string, siteCode: string, legacy: boolean, defaultCode: string): boolean {
	const k = bareKey(path);
	if (isOwnedKey(k, siteCode, legacy)) return true;
	// 老布局（upload/xxx.jpg、cn-banner/x.jpg）没有站点前缀，历史上属于默认站点，
	// 只允许默认站点的管理员删，别站管理员一律拒绝
	if (siteCode !== defaultCode) return false;
	// 旧 PHP 站的图片是直接躺在桶根的（2026071016585082.jpg），也属于默认站点
	if (k.startsWith("upload/") || k.startsWith("cn-banner/") || !k.includes("/")) return !k.includes("..");
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
	const key = imageKey(site.code, name);
	await c.env.IMAGES.put(key, file.stream(), {
		httpMetadata: { contentType: declared },
	});
	await audit(c, `上传图片 ${key}`);
	return c.json({ ok: true, path: `/${key}`, url: `/assets/${key}` });
});

app.get("/upload/list", async (c) => {
	if (!c.env.IMAGES) return c.json({ error: R2_OFF_HINT }, 503);
	const site = c.get("site");
	const bucket = c.env.IMAGES;
	const limit = Math.min(Math.max(parseInt(c.req.query("limit") ?? "60", 10) || 60, 1), 200);
	const cursor = c.req.query("cursor") || undefined;
	// 之前固定 limit 200 且无游标：图片一多，后台图片库永远只能看到 200 张，后面的看不到也删不掉
	const page = await bucket.list({ prefix: uploadPrefix(site.code), limit, cursor });
	const items = page.objects.map((o) => ({
		key: o.key,
		size: o.size,
		updated: String(o.uploaded ?? ""),
		url: `/assets/${o.key}`,
	}));
	items.sort((a, b) => (a.updated < b.updated ? 1 : -1));
	return c.json({ ok: true, items, cursor: page.truncated ? page.cursor : "", truncated: page.truncated });
});

// 图片是否还被本站内容引用：删图前必须查一遍，否则前台直接破图
async function referencesOf(env: AppEnv, siteId: number, key: string): Promise<string[]> {
	const db = env.DB;
	const k = bareKey(key);
	if (!k) return ["路径为空"]; // 空 key 会匹配全表，必须先挡住
	// 用 instr 做纯子串匹配：不用 LIKE，就不存在 % / _ 通配符误伤的问题
	const [banner, slide, product, news, gallery, content, site] = await Promise.all([
		db.prepare('SELECT COUNT(*) AS n FROM t_banner WHERE "SiteId" = ? AND instr("Pic", ?) > 0').bind(siteId, k).first(),
		db.prepare('SELECT COUNT(*) AS n FROM t_slide WHERE "SiteId" = ? AND instr("Pic", ?) > 0').bind(siteId, k).first(),
		db.prepare('SELECT COUNT(*) AS n FROM t_products WHERE "SiteId" = ? AND instr("SmallPic", ?) > 0').bind(siteId, k).first(),
		db.prepare('SELECT COUNT(*) AS n FROM t_news WHERE "SiteId" = ? AND instr("SmallPic", ?) > 0').bind(siteId, k).first(),
		db.prepare('SELECT COUNT(*) AS n FROM t_img WHERE "SiteId" = ? AND (instr("PicUrl", ?) > 0 OR instr("BigUrl", ?) > 0)').bind(siteId, k, k).first(),
		db.prepare('SELECT COUNT(*) AS n FROM t_content WHERE "SiteId" = ? AND instr("Content", ?) > 0').bind(siteId, k).first(),
		db.prepare('SELECT COUNT(*) AS n FROM t_sites WHERE "id" = ? AND instr("LogoUrl", ?) > 0').bind(siteId, k).first(),
	]);
	const used: string[] = [];
	const add = (label: string, row: unknown) => {
		if (Number((row as { n?: number } | null)?.n ?? 0) > 0) used.push(label);
	};
	add("内页头图", banner);
	add("首页轮播", slide);
	add("产品缩略图", product);
	add("新闻/案例封面", news);
	add("产品图集", gallery);
	add("静态页正文", content);
	add("站点 Logo", site);
	return used;
}

app.delete("/upload", async (c) => {
	if (!c.env.IMAGES) return c.json({ error: R2_OFF_HINT }, 503);
	const site = c.get("site");
	const path = c.req.query("path") ?? "";
	if (!path.trim()) return c.json({ error: "缺少 path 参数" }, 400);
	if (!isDeletable(path, site.code, legacyEnabled(c.env.LEGACY_LOOKUP), c.env.SITE_DEFAULT || "bjrobust"))
		return c.json({ error: "路径不合法（不能删除其他站点的图片）" }, 400);
	const used = await referencesOf(c.env, c.get("siteId"), bareKey(path));
	if (used.length && c.req.query("force") !== "1") {
		return c.json({ error: `这张图仍被「${used.join("、")}」引用，删除会导致前台破图；确实要删请先换掉引用`, used }, 409);
	}
	await c.env.IMAGES.delete(path.replace(/^\//, ""));
	await audit(c, `删除图片 ${bareKey(path)}`);
	return c.json({ ok: true });
});

// ---- 内页头图（当前生效站点）：每页一张，存 t_banner；清除后前台整块不显示 ----
app.get("/banners", async (c) => {
	const items = await readBannerEntries(c.env, c.get("siteId"));
	return c.json({ ok: true, items });
});

app.put("/banners/:page", async (c) => {
	const page = c.req.param("page");
	if (!isBannerPage(page)) return c.json({ error: "未知头图页面" }, 400);
	const form = await c.req.formData().catch(() => null);
	if (!form) return c.json({ error: "请求格式错误" }, 400);
	const file = form.get("file");
	if (!(file instanceof File)) return c.json({ error: "缺少 file 字段" }, 400);
	const res = await saveBannerFile(c.env, c.get("site"), page, file);
	if (!res.ok) return c.json({ error: res.error }, res.status as 400 | 503);
	await audit(c, `替换内页头图 ${page}`);
	return c.json({ ok: true, pic: res.pic });
});

app.delete("/banners/:page", async (c) => {
	const page = c.req.param("page");
	if (!isBannerPage(page)) return c.json({ error: "未知头图页面" }, 400);
	await setBannerPic(c.env, c.get("siteId"), page, "");
	await audit(c, `清除内页头图 ${page}`);
	return c.json({ ok: true });
});

export default app;
