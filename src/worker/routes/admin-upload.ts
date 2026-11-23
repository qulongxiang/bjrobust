// 后台：图片上传到 R2
// 分站存储：新图走 upload/<站点Code>/、内页头图走 cn-banner/<站点Code>/
// bjrobust 的历史图片仍在 upload/、cn-banner/ 老前缀下，读取时由 /assets 路由回退兼容
import { Hono } from "hono";
import type { AppEnv, AdminVariables } from "../env";

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

// ---- 内页头图（对应原版 PHP 站 cn/banner/ 六个固定位） ----
const BANNERS = [
	{ name: "banner1.jpg", page: "公司概况" },
	{ name: "banner2.jpg", page: "产品中心" },
	{ name: "banner3.jpg", page: "新闻资讯" },
	{ name: "banner4.jpg", page: "成功案例" },
	{ name: "banner5.jpg", page: "技术支持" },
	{ name: "banner6.jpg", page: "联系我们" },
];

function bannerKeys(siteCode: string, name: string): string[] {
	const own = `cn-banner/${siteCode}/${name}`;
	return siteCode === "bjrobust" ? [own, `cn-banner/${name}`] : [own];
}

app.get("/banners", async (c) => {
	if (!c.env.IMAGES) return c.json({ error: R2_OFF_HINT }, 503);
	const site = c.get("site");
	const items = [];
	for (const b of BANNERS) {
		const keys = bannerKeys(site.code, b.name);
		let hit: string | null = null;
		let meta: { size: number; uploaded: unknown } | null = null;
		for (const k of keys) {
			const obj = await c.env.IMAGES.head(k);
			if (obj) {
				hit = k;
				meta = obj;
				break;
			}
		}
		items.push({
			name: b.name,
			page: b.page,
			url: `/assets/${hit ?? keys[0]}`,
			size: meta?.size ?? 0,
			updated: meta ? String(meta.uploaded ?? "") : null,
		});
	}
	return c.json({ ok: true, items });
});

app.put("/banners/:name", async (c) => {
	if (!c.env.IMAGES) return c.json({ error: R2_OFF_HINT }, 503);
	const site = c.get("site");
	const name = c.req.param("name");
	if (!BANNERS.some((b) => b.name === name)) return c.json({ error: "未知头图" }, 400);
	const form = await c.req.formData().catch(() => null);
	if (!form) return c.json({ error: "请求格式错误" }, 400);
	const file = form.get("file");
	if (!(file instanceof File)) return c.json({ error: "缺少 file 字段" }, 400);
	if (file.size > MAX_SIZE) return c.json({ error: "文件超过 5MB 限制" }, 400);
	const dot = name.lastIndexOf(".");
	const mime = ALLOWED_EXT[name.slice(dot).toLowerCase()] ?? "image/jpeg";
	const sniffed = await sniffImage(file);
	if (!sniffed) return c.json({ error: "文件内容不是有效图片" }, 400);
	// 新头图一律写到本站前缀，老站的固定文件名不再覆盖
	await c.env.IMAGES.put(`cn-banner/${site.code}/${name}`, file.stream(), {
		httpMetadata: { contentType: mime },
	});
	return c.json({ ok: true });
});

export default app;
