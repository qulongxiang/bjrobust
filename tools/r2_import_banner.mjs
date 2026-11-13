// tools/r2_import_banner.mjs — 把原站内页头图导入本地 R2（与 wrangler dev 共用同一份数据）
// 用法: node tools/r2_import_banner.mjs
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFileSync } from "node:fs";
import path from "node:path";

const PROJECT = "D:/softdata/text/bjrobust";
const wrangler = JSON.parse(readFileSync(path.join(PROJECT, "wrangler.json"), "utf8"));
const BUCKET = wrangler.r2_buckets?.find((b) => b.binding === "IMAGES")?.bucket_name;
if (!BUCKET) {
	console.error("wrangler.json 未配置 IMAGES R2 绑定");
	process.exit(1);
}
const SRC = "D:/softdata/text/php-scripts/cn/banner";
const FILES = ["banner1.jpg", "banner2.jpg", "banner3.jpg", "banner4.jpg", "banner5.jpg", "banner6.jpg"];

const mf = new Miniflare(
	convertV4MiniflareOptions({
		resourcePersistencePath: path.join(PROJECT, ".wrangler", "state", "v3"),
		resourceTmpPath: path.join(PROJECT, ".wrangler", "tmp"),
		workers: [
			{
				name: "r2banner",
				script: "self.addEventListener('fetch', () => {});",
				r2Buckets: { IMAGES: BUCKET },
			},
		],
	}),
);
const bucket = await mf.getR2Bucket("IMAGES");
for (const f of FILES) {
	await bucket.put(`cn-banner/${f}`, readFileSync(path.join(SRC, f)), { httpMetadata: { contentType: "image/jpeg" } });
	console.log("✓ cn-banner/" + f);
}
await mf.dispose();
console.log("本地导入完成:", FILES.length, "张 → 桶", BUCKET);
