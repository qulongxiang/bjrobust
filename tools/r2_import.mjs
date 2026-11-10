// tools/r2_import.mjs — 把原站 upload/ 目录批量导入本地 R2
// 宿主侧通过 miniflare 代理直接写 .wrangler/state/v3 的 R2 存储（与 wrangler dev 同一份数据）
// 用法（先停 dev）: node tools/r2_import.mjs
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = "D:/softdata/text/php-scripts/upload";
const PROJECT = "D:/softdata/text/bjrobust";
const MIME = {
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".png": "image/png",
	".gif": "image/gif",
	".webp": "image/webp",
	".pdf": "application/pdf",
};

const files = [];
(function walk(dir) {
	for (const e of readdirSync(dir, { withFileTypes: true })) {
		const p = path.join(dir, e.name);
		if (e.isDirectory()) walk(p);
		else if (MIME[path.extname(e.name).toLowerCase()]) files.push(p);
	}
})(ROOT);
files.sort();
console.log("待导入:", files.length, "个文件");

const mf = new Miniflare(
	convertV4MiniflareOptions({
		resourcePersistencePath: path.join(PROJECT, ".wrangler", "state", "v3"),
		resourceTmpPath: path.join(PROJECT, ".wrangler", "tmp"),
		workers: [
			{
				name: "r2import",
				script: "self.addEventListener('fetch', () => {});",
				r2Buckets: { IMAGES: "bjrobust-images" },
			},
		],
	}),
);

const bucket = await mf.getR2Bucket("IMAGES");
let i = 0;
for (const p of files) {
	const rel = path.relative(ROOT, p).split(path.sep).join("/");
	const key = "upload/" + rel;
	const ext = path.extname(rel).toLowerCase();
	const data = readFileSync(p);
	await bucket.put(key, data, { httpMetadata: { contentType: MIME[ext] } });
	if (++i % 50 === 0) console.log(i + "/" + files.length);
}
console.log("导入完成:", i, "个");

const listed = await bucket.list({ limit: 5 });
console.log("抽查 keys:", listed.objects.map((o) => o.key).join(", "));
await mf.dispose();
