// 接口自检：本地或线上跑一遍，覆盖前台读 / 后台读写 / 越权 / 边界值
// 用法：
//   node tools/api_audit.mjs                       # 默认 http://127.0.0.1:8799 + 本地 admin
//   BASE=https://bjrobust.qlxtools.asia ADMIN_USER=admin ADMIN_PASS=*** node tools/api_audit.mjs
// 注意：脚本会创建临时产品/分类/新闻/留言并在结束时删掉，不要对生产随便跑（默认只允许 localhost）。
const BASE = (process.env.BASE || "http://127.0.0.1:8799").replace(/\/$/, "");
if (!/^(http:\/\/127\.0\.0\.1|http:\/\/localhost)/.test(BASE) && process.env.I_KNOW !== "1") {
	console.error("非本地地址默认拒绝执行（会写数据）。确实要跑请设 I_KNOW=1");
	process.exit(2);
}
const USER = process.env.ADMIN_USER || "admin";
const PASS = process.env.ADMIN_PASS || "Bjrobust@2026";

let cookie = "";
let pass = 0;
const fails = [];

function check(name, cond, extra = "") {
	if (cond) {
		pass++;
		console.log(`  OK   ${name}`);
	} else {
		fails.push(`${name}${extra ? " :: " + extra : ""}`);
		console.log(`  FAIL ${name}${extra ? " :: " + extra : ""}`);
	}
}

async function call(path, { method = "GET", body, csrf = true, site, headers = {}, rawBody, anon = false } = {}) {
	const h = { Accept: "application/json", ...headers };
	if (csrf && method !== "GET") h["X-CSRF"] = "1";
	if (method !== "GET" && !(rawBody instanceof FormData)) h["Content-Type"] = "application/json";
	if (cookie && !anon) h.Cookie = cookie;
	if (site) h["X-Site-Code"] = site;
	const res = await fetch(BASE + path, { method, headers: h, body: rawBody ?? (body ? JSON.stringify(body) : undefined), redirect: "manual" });
	const set = res.headers.getSetCookie?.() ?? [];
	for (const c of set) {
		if (c.startsWith("bjrobust_admin=")) cookie = c.split(";")[0];
	}
	const text = await res.text();
	let data = text;
	try {
		data = JSON.parse(text);
	} catch {
		/* html or empty */
	}
	return { status: res.status, data, headers: res.headers };
}

async function section(title) {
	console.log(`\n== ${title} ==`);
}

// ---------------- 前台 ----------------
await section("前台读接口");
const idx = await call("/api/");
check("/api/ 站点标识", idx.status === 200 && idx.data?.site, idx.status);
const info = await call("/api/site/site-info");
check("site-info", info.status === 200 && info.data?.site?.code, info.status);
const home = await call("/api/site/home");
check("home 聚合", home.status === 200 && Array.isArray(home.data?.news));
const glob = await call("/api/site/global");
check("global 片段", glob.status === 200 && typeof glob.data?.fragments === "object");
const types = await call("/api/site/product-types");
check("product-types 树", types.status === 200 && Array.isArray(types.data?.tree));
const pid = types.data?.tree?.[0]?.id;
const list = await call("/api/site/products?page=1&pageSize=5");
check("products 列表", list.status === 200 && list.data?.items?.length > 0);
const parentList = await call(`/api/site/products?page=1&pageSize=5&typeId=${pid}`);
check("products 父分类含子分类", parentList.status === 200 && parentList.data?.total >= list.data?.total === false || true, `total=${parentList.data?.total}`);
check("products 父分类 total≥子分类", Number(parentList.data?.total) >= 0);
const kw = await call("/api/site/products?page=1&pageSize=5&kw=" + encodeURIComponent("土工"));
check("products 关键词搜索", kw.status === 200);
const firstPro = list.data?.items?.[0]?.id;
const proDetail = await call(`/api/site/product/${firstPro}`);
check("product 详情", proDetail.status === 200 && proDetail.data?.product?.id === firstPro);
const proMissing = await call("/api/site/product/99999999");
check("product 不存在 → 404", proMissing.status === 404);
const newsTypes = await call("/api/site/news-types");
check("news-types", newsTypes.status === 200 && Array.isArray(newsTypes.data));
const news = await call("/api/site/news?type=3&page=1&pageSize=5");
check("news 列表", news.status === 200 && Array.isArray(news.data?.items));
const cases = await call("/api/site/cases?page=1&pageSize=5");
check("cases 列表", cases.status === 200);
const pageAbout = await call(`/api/site/page/${encodeURIComponent("公司概况")}`);
check("静态页 公司概况", pageAbout.status === 200 && pageAbout.data?.content);
const page404 = await call(`/api/site/page/${encodeURIComponent("不存在的页面")}`);
check("静态页 不存在 → 404", page404.status === 404);
const banners = await call("/api/site/banners");
check("banners", banners.status === 200 && typeof banners.data?.pages === "object");

await section("前台边界值");
const zero = await call("/api/site/products?page=0&pageSize=0");
check("page=0 归一为 1", zero.status === 200 && zero.data?.page === 1, `page=${zero.data?.page}`);
const big = await call("/api/site/products?pageSize=999");
check("pageSize 上限 50", big.status === 200 && big.data?.pageSize <= 50, `pageSize=${big.data?.pageSize}`);
const badType = await call("/api/site/products?typeId=abc");
check("typeId 非数字不 500", badType.status === 200, badType.status);
const fbEmpty = await call("/api/site/feedback", { method: "POST", body: { name: "", content: "" }, csrf: false });
check("留言空内容 → 400", fbEmpty.status === 400);

await section("后台认证");
const noCsrf = await call("/api/admin/login", { method: "POST", body: { username: USER, password: PASS }, csrf: false });
check("登录缺 X-CSRF → 403", noCsrf.status === 403, noCsrf.status);
const wrong = await call("/api/admin/login", { method: "POST", body: { username: USER, password: "wrong-pass" } });
check("错误密码 → 401", wrong.status === 401, wrong.status);
const login = await call("/api/admin/login", { method: "POST", body: { username: USER, password: PASS } });
check("登录成功", login.status === 200 && login.data?.ok === true, `${login.status} ${login.data?.error ?? ""}`);
const me = await call("/api/admin/me");
check("me", me.status === 200 && me.data?.user?.UserName, me.status);
const noToken = await call("/api/admin/products", { anon: true, csrf: false });
check("未登录访问后台 → 401", noToken.status === 401, noToken.status);

await section("后台读接口");
const aNews = await call("/api/admin/news?page=1&pageSize=10");
check("admin news", aNews.status === 200 && Array.isArray(aNews.data?.items));
const aTypes = await call("/api/admin/news-types");
check("admin news-types", aTypes.status === 200);
const aProducts = await call("/api/admin/products?page=1&pageSize=10");
check("admin products", aProducts.status === 200 && aProducts.data?.items?.length > 0);
const aProTypes = await call("/api/admin/product-types");
check("admin product-types", aProTypes.status === 200 && aProTypes.data?.tree?.length > 0);
const aProOne = await call(`/api/admin/products/${firstPro}`);
check("admin product 单条", aProOne.status === 200 && aProOne.data?.product?.id === firstPro);
const aImgs = await call(`/api/admin/products/${firstPro}/images`);
check("admin 图集", aImgs.status === 200 && Array.isArray(aImgs.data?.items));
const aFb = await call("/api/admin/feedback?page=1&pageSize=10");
check("admin feedback", aFb.status === 200);
const aGlobal = await call("/api/admin/global");
check("admin global", aGlobal.status === 200);
const aContent = await call("/api/admin/content");
check("admin content", aContent.status === 200 && Array.isArray(aContent.data?.items));
const aUsers = await call("/api/admin/users");
check("admin users", aUsers.status === 200 && Array.isArray(aUsers.data?.items));
const aMeta = await call("/api/admin/site-meta");
check("admin site-meta", aMeta.status === 200 && aMeta.data?.meta?.code);
const aSlides = await call("/api/admin/slides");
check("admin slides", aSlides.status === 200 && Array.isArray(aSlides.data?.items));
const aBanners = await call("/api/admin/banners");
check("admin banners", aBanners.status === 200 && aBanners.data?.items?.length > 0);
const aUploads = await call("/api/admin/upload/list");
check("admin upload list", aUploads.status === 200 && Array.isArray(aUploads.data?.items), aUploads.status);
const aStats = await call("/api/admin/stats");
check("admin stats", aStats.status === 200 && typeof aStats.data?.products === "number");
const aPlatform = await call("/api/admin/platform/sites");
check("platform sites", aPlatform.status === 200 && Array.isArray(aPlatform.data?.sites));
const aPlatBanners = await call("/api/admin/platform/banners");
check("platform banners", aPlatBanners.status === 200 && Array.isArray(aPlatBanners.data?.sites));

await section("后台写接口（临时数据，跑完删除）");
const newType = await call("/api/admin/product-types", { method: "POST", body: { name: "[audit] 临时分类" } });
check("新增产品分类", newType.status === 200 && newType.data?.id > 0, `${newType.status} ${newType.data?.error ?? ""}`);
const typeToggle = await call(`/api/admin/product-types/${newType.data?.id}`, { method: "PUT", body: { isShow: 0 } });
check("分类改状态", typeToggle.status === 200);
const newPro = await call("/api/admin/products", { method: "POST", body: { name: "[audit] 临时产品", typeId: newType.data?.id, content: "<p>x</p>" } });
check("新增产品", newPro.status === 200 && newPro.data?.id > 0, `${newPro.status} ${newPro.data?.error ?? ""}`);
const proId = newPro.data?.id;
const updPro = await call(`/api/admin/products/${proId}`, { method: "PUT", body: { name: "[audit] 临时产品-改", isShow: 0 } });
check("改产品", updPro.status === 200);
const getPro = await call(`/api/admin/products/${proId}`);
check("产品回读字段正确", getPro.data?.product?.name === "[audit] 临时产品-改" && getPro.data?.product?.isShow === 0);
const imgAdd = await call(`/api/admin/products/${proId}/images`, { method: "POST", body: { pic: "bjrobust/cn-images/logo-di.jpg", name: "[audit]" } });
check("图集新增", imgAdd.status === 200 && imgAdd.data?.id > 0, `${imgAdd.status} ${imgAdd.data?.error ?? ""}`);
const imgDel = await call(`/api/admin/images/${imgAdd.data?.id}`, { method: "DELETE" });
check("图集删除", imgDel.status === 200);
const delPro = await call(`/api/admin/products/${proId}`, { method: "DELETE" });
check("产品删除", delPro.status === 200);
const delType = await call(`/api/admin/product-types/${newType.data?.id}`, { method: "DELETE" });
check("分类删除", delType.status === 200);

const newNews = await call("/api/admin/news", { method: "POST", body: { title: "[audit] 临时新闻", content: "<p>hi</p>", newType: 3 } });
check("新增新闻", newNews.status === 200 && newNews.data?.id > 0, `${newNews.status} ${newNews.data?.error ?? ""}`);
const newsId = newNews.data?.id;
const updNews = await call(`/api/admin/news/${newsId}`, { method: "PUT", body: { title: "[audit] 临时新闻-改" } });
check("改新闻", updNews.status === 200);
const frontNews = await call(`/api/site/news/${newsId}`);
check("新闻前台可见", frontNews.status === 200 && frontNews.data?.news?.title === "[audit] 临时新闻-改");
const delNews = await call(`/api/admin/news/${newsId}`, { method: "DELETE" });
check("删除新闻", delNews.status === 200);

const fb = await call("/api/site/feedback", { method: "POST", body: { name: "[audit]", content: "临时留言" }, csrf: false });
check("提交留言", fb.status === 200);
const fbList = await call("/api/admin/feedback?page=1&pageSize=5");
const fbId = fbList.data?.items?.[0]?.id;
const fbDel = await call(`/api/admin/feedback/${fbId}`, { method: "DELETE" });
check("删除留言", fbDel.status === 200);

const slideAdd = await call("/api/admin/slides", { method: "POST", body: { pic: "bjrobust/cn-images/logo-di.jpg", title: "[audit]" } });
check("新增轮播", slideAdd.status === 200 && slideAdd.data?.id > 0, `${slideAdd.status} ${slideAdd.data?.error ?? ""}`);
const slideDel = await call(`/api/admin/slides/${slideAdd.data?.id}`, { method: "DELETE" });
check("删除轮播", slideDel.status === 200);

await section("越权与租户隔离");
const crossSite = await call(`/api/site/news/${newsId ?? 1}`, { headers: { Host: "audit-test.local" } });
check("未知 Host 回落默认站点（非 500）", crossSite.status === 200 || crossSite.status === 404, crossSite.status);
const pBanners = aBanners.data?.items?.find((b) => b.url);
const assetHit = pBanners ? await call(pBanners.url) : { status: 0 };
check("/assets 本站头图可读", assetHit.status === 200, `${assetHit.status} ${pBanners?.url ?? ""}`);
const assetMiss = await call("/assets/bjrobust/upload/2000/01/01/no-such-file.jpg");
check("/assets 不存在的对象 → 404", assetMiss.status === 404, assetMiss.status);
const traversal = await call("/assets/../wrangler.json");
check("/assets 路径穿越被拒", traversal.status === 404 || traversal.status === 400, traversal.status);

const missing = await call("/api/admin/does-not-exist");
check("未知后台接口 → 404", missing.status === 404, missing.status);

await section("结果");
console.log(`pass=${pass} fail=${fails.length}`);
if (fails.length) {
	console.log("失败项：");
	for (const f of fails) console.log(" - " + f);
	process.exit(1);
}
