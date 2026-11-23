// 后台：图片上传到 R2
// 分站存储：新图走 upload/<站点Code>/<年>/<月>/<日>/<文件名>，内页头图走 cn-banner/<站点Code>/
// bjrobust 的历史图片已迁到 upload/bjrobust/<年>/<月>/<日>/，读取由 /assets 精确命中
import { Hono } from "hono";
import type { AppEnv, AdminVariables } from "../env";
import { isBannerPage, readBannerEntries, saveBannerFile, setBannerPic } from "../lib/banner";
import { ALLOWED_EXT, MAX_SIZE, sniffImage } from "../lib/upload";

const app = new Hono<{ Bindings: AppEnv; Variables: AdminVariables }>();

const R2_OFF_HINT = "R2 未开通：请先在 Cloudflare 控制台开通 R2、创建桶并恢复 wrangler.json 绑定";

/** 北京时间（与老 PHP 站一致），给出 y/m/d 供目录使用 */
function todayPath(): { y: string; m: string; d: string } {
	const bj = new Date(Date.now() + 8 * 3600 * 1000);
	const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
	return { y: String(bj.getUTCFullYear()), m: pad(bj.getUTCMonth() + 1), d: pad(bj.getUTCDate()) };
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
	const { y, m, d } = todayPath();
	const key = `${uploadPrefix(site.code)}${y}/${m}/${d}/${name}`;
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
	return c.json({ ok: true, pic: res.pic });
});

app.delete("/banners/:page", async (c) => {
	const page = c.req.param("page");
	if (!isBannerPage(page)) return c.json({ error: "未知头图页面" }, 400);
	await setBannerPic(c.env, c.get("siteId"), page, "");
	return c.json({ ok: true });
});

export default app;
