import { Hono } from "hono";
import type { AppEnv, AdminVariables } from "./env";
import { adminGuard } from "./lib/auth";
import adminAuth from "./routes/admin-auth";
import site, { assetsApp } from "./routes/site";
import adminContent from "./routes/admin-content";
import adminProducts from "./routes/admin-products";
import adminMisc from "./routes/admin-misc";
import adminUpload from "./routes/admin-upload";

const app = new Hono<{ Bindings: AppEnv; Variables: AdminVariables }>();

app.get("/api/", (c) => c.json({ name: "bjrobust", ok: true }));
app.route("/api/admin", adminAuth);
app.route("/api/site", site);
app.route("/assets", assetsApp);

// 需要登录的后台 API
const adminProtected = new Hono<{ Bindings: AppEnv; Variables: AdminVariables }>();
adminProtected.use("*", adminGuard());
adminProtected.route("/", adminContent);
adminProtected.route("/", adminProducts);
adminProtected.route("/", adminMisc);
adminProtected.route("/", adminUpload);
app.route("/api/admin", adminProtected);

// 静态资源 + SPA fallback（dev 与生产行为一致：先查静态文件，未命中的浏览器 HTML 请求回 index.html）
app.get("/*", async (c) => {
	const req = c.req.raw;
	const res = await c.env.ASSETS.fetch(req);
	if (res.status !== 404) return res;
	if ((req.headers.get("accept") ?? "").includes("text/html")) {
		const indexUrl = new URL("/", req.url).toString();
		return c.env.ASSETS.fetch(new Request(indexUrl, { headers: { accept: "text/html" } }));
	}
	return c.notFound();
});

export default app;
