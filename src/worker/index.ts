import { Hono } from "hono";
import type { AppEnv, AdminVariables, SiteInfo } from "./env";
import { adminGuard } from "./lib/auth";
import { csrfGuard, securityHeaders } from "./lib/security";
import { tenantMiddleware } from "./lib/tenant";
import adminAuth from "./routes/admin-auth";
import adminPlatform from "./routes/admin-platform";
import site, { assetsApp } from "./routes/site";
import adminContent from "./routes/admin-content";
import adminProducts from "./routes/admin-products";
import adminMisc from "./routes/admin-misc";
import adminUpload from "./routes/admin-upload";

const app = new Hono<{ Bindings: AppEnv; Variables: AdminVariables }>();

// 1) 安全响应头
app.use("*", securityHeaders());
// 2) 按 Host 解析站点（租户）
app.use("*", tenantMiddleware());

// 3) 站点不存在 / 已停用：直接拦掉，避免把默认站内容错误地当成别的域名
app.use("*", async (c, next) => {
	const site = (c.var as { site?: SiteInfo }).site;
	const path = new URL(c.req.url).pathname;
	const wantsHtml = (c.req.header("accept") ?? "").includes("text/html");
	if (!site) {
		if (path.startsWith("/api/")) return c.json({ error: "站点未配置" }, 404);
		if (wantsHtml) return c.html(statusPage("站点未配置", "该域名还没有绑定到任何站点，请联系管理员。"), 404);
		return c.notFound();
	}
	if (site.isActive !== 1) {
		if (path.startsWith("/api/")) return c.json({ error: "站点已停用" }, 503);
		if (wantsHtml) return c.html(statusPage("站点已停用", "该站点正在维护中，请稍后再访问。"), 503);
		return c.notFound();
	}
	await next();
});

app.get("/api/", (c) =>
	c.json({ name: "bjrobust", ok: true, site: c.get("site").code }),
);
app.route("/api/admin", adminAuth);
app.route("/api/site", site);
app.route("/assets", assetsApp);

// 需要登录的后台 API：CSRF 校验 → JWT 守卫 → 各业务路由
const adminProtected = new Hono<{ Bindings: AppEnv; Variables: AdminVariables }>();
adminProtected.use("*", csrfGuard());
adminProtected.use("*", adminGuard());
adminProtected.route("/", adminContent);
adminProtected.route("/", adminProducts);
adminProtected.route("/", adminMisc);
adminProtected.route("/", adminUpload);
adminProtected.route("/", adminPlatform);
app.route("/api/admin", adminProtected);

// 静态资源 + SPA fallback（dev 与生产行为一致：先查静态文件，未命中的浏览器 HTML 请求回 index.html）
app.get("/*", async (c) => {
	const req = c.req.raw;
	const res = await c.env.ASSETS.fetch(req);
	if (res.status === 404) {
		if ((req.headers.get("accept") ?? "").includes("text/html")) {
			const indexUrl = new URL("/", req.url).toString();
			const indexRes = await c.env.ASSETS.fetch(new Request(indexUrl, { headers: { accept: "text/html" } }));
			return noCacheHtml(indexRes);
		}
		return c.notFound();
	}
	// HTML 入口一律不缓存：部署新资源后，旧的 index.html 指向已删除的资源 hash 会导致白屏
	if ((res.headers.get("content-type") ?? "").includes("text/html")) {
		return noCacheHtml(res);
	}
	return res;
});

function noCacheHtml(res: Response): Response {
	const out = new Response(res.body, res);
	out.headers.set("cache-control", "no-cache");
	return out;
}

function statusPage(title: string, message: string): string {
	return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>html,body{height:100%;margin:0}body{display:flex;align-items:center;justify-content:center;font-family:system-ui,-apple-system,"PingFang SC",sans-serif;background:#f5f7fa;color:#2b2f36}.box{text-align:center;padding:32px}h1{font-size:20px;margin:0 0 12px}p{color:#6b7280;margin:0;font-size:14px}</style></head><body><div class="box"><h1>${title}</h1><p>${message}</p></div></body></html>`;
}

export default app;
