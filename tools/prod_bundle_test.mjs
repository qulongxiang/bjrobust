// 用真实部署的 bundle 在 happy-dom 环境跑指定页面完整流程（真实 API），验证渲染
// 用法: node tools/prod_bundle_test.mjs [origin] [page]
//   默认: https://bjrobust.qlxtools.asia  /admin/login
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
const nodeFetch = globalThis.fetch.bind(globalThis);
const realFetch = (input, init) => nodeFetch(new URL(String(input), ORIGIN).toString(), init);
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
