// tools/r2_push_static.mjs — 推送原站静态素材到 R2（本地 + 生产）
// 用法: node tools/r2_push_static.mjs [local | remote | all]
// 需要推送新素材时，往 FILES 里加一行即可。
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const mode = process.argv[2] || "all";
const PROJECT = "D:/softdata/text/bjrobust";

// src: 原站本地文件；key: R2 对象键（cn-images/ 前缀，对应原站 cn/images/ 目录）
const FILES = [
	{ src: "D:/softdata/text/php-scripts/cn/images/logo-di.jpg", key: "cn-images/logo-di.jpg" },
];

const MIME = {
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".png": "image/png",
	".gif": "image/gif",
	".webp": "image/webp",
};
const mimeOf = (p) => MIME[path.extname(p).toLowerCase()] ?? "application/octet-stream";

if (mode === "local" || mode === "all") {
	const wrangler = JSON.parse(readFileSync(path.join(PROJECT, "wrangler.json"), "utf8"));
	const BUCKET = wrangler.r2_buckets?.find((b) => b.binding === "IMAGES")?.bucket_name;
	if (!BUCKET) {
		console.error("wrangler.json 未配置 IMAGES R2 绑定");
		process.exit(1);
	}
	const mf = new Miniflare(
		convertV4MiniflareOptions({
			resourcePersistencePath: path.join(PROJECT, ".wrangler", "state", "v3"),
			resourceTmpPath: path.join(PROJECT, ".wrangler", "tmp"),
			workers: [
				{
					name: "r2static",
					script: "self.addEventListener('fetch', () => {});",
					r2Buckets: { IMAGES: BUCKET },
				},
			],
		}),
	);
	const bucket = await mf.getR2Bucket("IMAGES");
	for (const f of FILES) {
		await bucket.put(f.key, readFileSync(f.src), { httpMetadata: { contentType: mimeOf(f.key) } });
		console.log("✓ 本地 " + f.key);
	}
	await mf.dispose();
}

if (mode === "remote" || mode === "all") {
	const accountId = "ea1fab4be92f6b0809efef4bd03c5341";
	const bucketName = JSON.parse(readFileSync(path.join(PROJECT, "wrangler.json"), "utf8")).r2_buckets.find(
		(b) => b.binding === "IMAGES",
	)?.bucket_name;
	const tomlPath = "C:/Users/qlx/AppData/Roaming/xdg.config/.wrangler/config/default.toml";
	const readToken = () => {
		try {
			const s = readFileSync(tomlPath, "utf8");
			const m = s.match(/oauth_token\s*=\s*"([^"]+)"/) ?? s.match(/token\s*=\s*"([^"]+)"/);
			return m ? m[1] : null;
		} catch {
			return null;
		}
	};
	const refreshToken = () => {
		try {
			execSync("npx wrangler whoami", { stdio: "ignore", timeout: 90_000 });
		} catch {
			/* 刷新失败由重试循环兜底 */
		}
	};
	const base = `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucketName}/objects`;
	for (const f of FILES) {
		let done = false;
		for (let attempt = 0; attempt < 5 && !done; attempt++) {
			try {
				const t = readToken();
				if (!t) throw new Error("未读到 wrangler token");
				const res = await fetch(`${base}/${f.key}`, {
					method: "PUT",
					headers: { Authorization: `Bearer ${t}`, "Content-Type": mimeOf(f.key) },
					body: new Uint8Array(readFileSync(f.src)),
					signal: AbortSignal.timeout(30_000),
				});
				if (res.ok) {
					console.log(`✓ 生产 ${f.key} (${(readFileSync(f.src).length / 1024).toFixed(0)} KB)`);
					done = true;
				} else if (res.status === 401 || res.status === 403) {
					refreshToken();
				} else {
					throw new Error(`R2 API ${res.status}: ${(await res.text()).slice(0, 200)}`);
				}
			} catch (e) {
				if (String(e).includes("R2 API 4") && !String(e).includes("401") && !String(e).includes("403")) throw e;
			}
			if (!done) {
				const w = 2000 * (attempt + 1);
				console.error(`请求失败，${w / 1000}s 后重试 ${attempt + 1}/4…`);
				await new Promise((r) => setTimeout(r, w));
			}
		}
		if (!done) {
			console.error("推送失败: " + f.key);
			process.exit(1);
		}
	}
}
console.log("全部完成");
