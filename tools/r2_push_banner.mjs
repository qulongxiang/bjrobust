// tools/r2_push_banner.mjs — 把原站内页头图 cn/banner/banner1-6.jpg 推送到生产 R2
// key 前缀 cn-banner/（与用户上传的 upload/ 区分）
// 用法: CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... node tools/r2_push_banner.mjs
import { readFileSync } from "node:fs";

const token = process.env.CLOUDFLARE_API_TOKEN;
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const BUCKET = "bjrobust";
const SRC = "D:/softdata/text/php-scripts/cn/banner";
const FILES = ["banner1.jpg", "banner2.jpg", "banner3.jpg", "banner4.jpg", "banner5.jpg", "banner6.jpg"];

if (!token || !account) {
	console.error("缺少环境变量 CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID");
	process.exit(1);
}

const base = `https://api.cloudflare.com/client/v4/accounts/${account}/r2/buckets/${BUCKET}/objects`;
let ok = 0;
for (const f of FILES) {
	const key = `cn-banner/${f}`;
	const data = readFileSync(`${SRC}/${f}`);
	const res = await fetch(`${base}/${key}`, {
		method: "PUT",
		headers: { Authorization: `Bearer ${token}`, "Content-Type": "image/jpeg" },
		body: new Uint8Array(data),
	});
	if (!res.ok) {
		throw new Error(`${key}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
	}
	ok++;
	console.log(`✓ ${key} (${(data.length / 1024).toFixed(0)} KB)`);
}
console.log("完成:", ok, "/", FILES.length, "→ 桶", BUCKET);
