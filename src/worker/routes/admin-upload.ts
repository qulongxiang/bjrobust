// 后台：图片上传到 R2（upload/ 前缀，对应原 upload/ 目录）
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
const PREFIX = "upload/";

app.post("/upload", async (c) => {
	const form = await c.req.formData().catch(() => null);
	if (!form) return c.json({ error: "请求格式错误" }, 400);
	const file = form.get("file");
	if (!(file instanceof File)) return c.json({ error: "缺少 file 字段" }, 400);
	if (file.size > MAX_SIZE) return c.json({ error: "文件超过 5MB 限制" }, 400);

	const baseName = file.name.replace(/[^\w.\-]/g, "_").slice(-80);
	const dot = baseName.lastIndexOf(".");
	const ext = dot >= 0 ? baseName.slice(dot).toLowerCase() : "";
	const mime = ALLOWED_EXT[ext];
	if (!mime) return c.json({ error: "仅支持 jpg/jpeg/png/gif/webp 图片" }, 400);

	const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
	const key = `${PREFIX}${name}`;
	await c.env.IMAGES.put(key, file.stream(), {
		httpMetadata: { contentType: mime },
	});
	return c.json({ ok: true, path: `/${PREFIX}${name}`, url: `/assets/${key}` });
});

app.get("/upload/list", async (c) => {
	const objects = await c.env.IMAGES.list({ prefix: PREFIX, limit: 200 });
	const items = objects.objects.map((o) => ({
		key: o.key,
		size: o.size,
		updated: o.uploaded,
		url: `/assets/${o.key}`,
	}));
	items.sort((a, b) => (a.updated < b.updated ? 1 : -1));
	return c.json({ ok: true, items });
});

app.delete("/upload", async (c) => {
	const path = c.req.query("path") ?? "";
	if (!path.startsWith(PREFIX)) return c.json({ error: "路径不合法" }, 400);
	const key = path.replace(/^\//, "");
	await c.env.IMAGES.delete(key);
	return c.json({ ok: true });
});

export default app;
