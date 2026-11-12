// tools/r2_push_remote.mjs — 把原站 upload/ 目录批量推送到生产 R2
// 前提：账号已开通 R2 且桶 bjrobust 已创建（npx wrangler r2 bucket create bjrobust）
// 用法: CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... node tools/r2_push_remote.mjs
// Windows: 先 set 两个变量再执行
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const token = process.env.CLOUDFLARE_API_TOKEN;
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const BUCKET = "bjrobust";
const ROOT = "D:/softdata/text/php-scripts/upload";
const MIME = {
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".png": "image/png",
	".gif": "image/gif",
	".webp": "image/webp",
	".pdf": "application/pdf",
};
if (!token || !account) {
	console.error("缺少环境变量 CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID");
	process.exit(1);
}

const files = [];
(function walk(dir) {
	for (const e of readdirSync(dir, { withFileTypes: true })) {
		const p = path.join(dir, e.name);
		if (e.isDirectory()) walk(p);
		else if (MIME[path.extname(e.name).toLowerCase()]) files.push(p);
	}
})(ROOT);
files.sort();
console.log("待上传:", files.length, "个文件");

// 注意：对象操作路径必须带 /objects/ 段
const base = `https://api.cloudflare.com/client/v4/accounts/${account}/r2/buckets/${BUCKET}/objects`;
let idx = 0;
let okCount = 0;

async function pushOne(p) {
	const rel = path.relative(ROOT, p).split(path.sep).join("/");
	const key = "upload/" + rel;
	const ext = path.extname(rel).toLowerCase();
	const data = readFileSync(p);
	const res = await fetch(`${base}/${key}`, {
		method: "PUT",
		headers: { Authorization: `Bearer ${token}`, "Content-Type": MIME[ext] },
		body: new Uint8Array(data),
	});
	if (!res.ok) {
		const t = await res.text();
		throw new Error(`${key}: HTTP ${res.status} ${t.slice(0, 200)}`);
	}
	okCount++;
}

async function worker() {
	while (idx < files.length) {
		const i = idx++;
		await pushOne(files[i]);
		if (okCount % 50 === 0) console.log(okCount + "/" + files.length);
	}
}

try {
	await Promise.all(Array.from({ length: 6 }, worker));
	console.log("上传完成:", okCount, "个文件 → 桶", BUCKET);
} catch (e) {
	console.error("失败:", e.message, "（已上传", okCount, "个，重跑可续传——PUT 覆盖写是幂等的）");
	process.exit(1);
}
