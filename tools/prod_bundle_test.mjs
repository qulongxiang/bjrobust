// 用真实部署的 bundle 在 happy-dom 环境跑指定页面完整流程（真实 API），验证渲染
// 用法: node tools/prod_bundle_test.mjs [origin] [page]
//   默认: https://bjrobust.qlxtools.asia  /admin/login
//   FAKE_ME=1  假登录态：/api/admin/me 返回假 200 用户（测登录后页面），其余仍走真实 API
//   LOGIN=user:pass  真实登录态：先调 /api/admin/login 拿会话 Cookie，之后所有请求都带上（完整模拟浏览器）
import { Window } from "happy-dom";
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const ORIGIN = (process.argv[2] ?? "https://bjrobust.qlxtools.asia").replace(/\/$/, "");
const PAGE = process.argv[3] ?? "/admin/login";

const w = new Window({ url: ORIGIN + PAGE });
const g = globalThis;
g.window = w;
g.document = w.document;
for (const key of ["location", "navigator", "history"]) {
	Object.defineProperty(globalThis, key, { value: w[key], configurable: true, writable: true });
}
for (const k of [
	"HTMLElement", "HTMLInputElement", "HTMLTextAreaElement", "HTMLSelectElement",
	"HTMLAnchorElement", "HTMLImageElement", "HTMLFormElement", "HTMLButtonElement",
	"Element", "Node", "NodeList", "Event", "CustomEvent", "MouseEvent", "KeyboardEvent",
	"MutationObserver", "getComputedStyle", "Document", "DocumentFragment", "SVGElement",
	"DOMParser", "File", "Blob", "FormData", "FileReader", "localStorage", "sessionStorage",
	"matchMedia",
]) {
	const v = w[k];
	if (v !== undefined) g[k] = v;
}
if (!g.matchMedia) {
	g.matchMedia = () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {} });
}
g.requestAnimationFrame =
	w.requestAnimationFrame ? w.requestAnimationFrame.bind(w) : (cb) => setTimeout(() => cb(0), 16);
g.cancelAnimationFrame = w.cancelAnimationFrame ? w.cancelAnimationFrame.bind(w) : (h) => clearTimeout(h);

// fetch：相对路径 → 生产真实 API（先保存 Node 原生 fetch，避免自引用递归）
const FAKE_ME = process.env.FAKE_ME === "1";
const LOGIN = process.env.LOGIN ? process.env.LOGIN.split(":", 2) : null;
const nodeFetch = globalThis.fetch.bind(globalThis);
let sessionCookie = "";

// 真实登录态：先走一遍登录接口拿会话 Cookie
if (LOGIN) {
	const r = await nodeFetch(ORIGIN + "/api/admin/login", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ username: LOGIN[0], password: LOGIN[1] }),
	});
	const sc = r.headers.get("set-cookie") || "";
	const m = sc.match(/bjrobust_admin=([^;]+)/);
	if (!r.ok || !m) {
		console.error("登录失败: " + r.status + " " + (await r.text()).slice(0, 120));
		process.exit(1);
	}
	sessionCookie = "bjrobust_admin=" + m[1];
	console.log("已真实登录: " + LOGIN[0]);
}

const realFetch = (input, init) => {
	const url = new URL(String(input), ORIGIN).toString();
	// 假登录态：/api/admin/me 直接返回 200 假用户，其余请求仍走生产真实 API
	if (FAKE_ME && url === ORIGIN + "/api/admin/me") {
		return Promise.resolve(
			new Response(
				JSON.stringify({
					ok: true,
					user: { id: 1, UserName: "admin", UserRole: "1", UserRoleCalled: "管理员" },
				}),
				{ status: 200, headers: { "Content-Type": "application/json" } },
			),
		);
	}
	if (sessionCookie) {
		init = { ...(init || {}), headers: { ...(init?.headers || {}), cookie: sessionCookie } };
	}
	return nodeFetch(url, init);
};
g.fetch = realFetch;
w.fetch = realFetch;

w.document.body.innerHTML = '<div id="root"></div>';

// 拉生产 index.html → 找 JS bundle → 去掉 /assets/*.css 导入（Node 无法 import CSS）
const indexHtml = await (await fetch(ORIGIN + "/")).text();
const m = indexHtml.match(/\/assets\/index-[^"]+\.js/);
if (!m) {
	console.error("index.html 未找到 JS bundle 引用");
	process.exit(1);
}
let code = await (await fetch(ORIGIN + m[0])).text();
const cssCount = (code.match(/import\s+"\/assets\/[^"]+";/g) || []).length;
code = code.replace(/import\s+"\/assets\/[^"]+";/g, "");
const bundleFile = "D:/softdata/text/bjrobust/tools/.prod_bundle.mjs";
writeFileSync(bundleFile, code);
console.log("bundle: " + m[0] + " | 剥离 CSS 导入: " + cssCount + " 个");

// 捕获运行时错误
const errors = [];
w.addEventListener("error", (e) => {
	errors.push("window.onerror: " + String((e && e.message) || e));
});
process.on("uncaughtException", (e) => errors.push("uncaughtException: " + e.message));

try {
	await import(pathToFileURL(bundleFile).href);
} catch (e) {
	errors.push("bundle import 失败: " + e.message);
}
await new Promise((r) => setTimeout(r, 5000));

const root = w.document.getElementById("root");
console.log("\n==== /admin/login 渲染结果 ====");
console.log("#root 长度: " + (root ? root.innerHTML.length : -1));
console.log("#root 内容: " + JSON.stringify((root ? root.innerHTML : "").slice(0, 500)));
console.log("页面文本: " + JSON.stringify(w.document.body.innerText.slice(0, 300)));
if (errors.length) {
	console.log("\n==== 捕获的错误 ====");
	errors.forEach((e) => console.log(String(e).slice(0, 400)));
} else {
	console.log("\n（无捕获错误）");
}
process.exit(0);
