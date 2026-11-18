// tools/r2_sync_upload.mjs — 核对本地 upload/ 与生产 R2，补齐缺失
// 图片在 R2 有两种键形态（都要存在）：{文件} 与 upload/{文件}
// 用法: node tools/r2_sync_upload.mjs [check | sync]   check=只核对不推送（默认 sync）
import { readFileSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const mode = process.argv[2] || "sync";
const UPLOAD_DIR = "D:/softdata/text/php-scripts/upload";
const SITE = "https://bjrobust.qlxtools.asia";
const accountId = "ea1fab4be92f6b0809efef4bd03c5341";
const bucketName = JSON.parse(
	readFileSync("D:/softdata/text/bjrobust/wrangler.json", "utf8"),
).r2_buckets.find((b) => b.binding === "IMAGES")?.bucket_name;
const tomlPath = "C:/Users/qlx/AppData/Roaming/xdg.config/.wrangler/config/default.toml";
const MIME = {
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".png": "image/png",
	".gif": "image/gif",
	".webp": "image/webp",
};

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
		/* 由重试循环兜底 */
	}
};

const files = readdirSync(UPLOAD_DIR).filter((f) => /\.(jpe?g|png|gif|webp)$/i.test(f));
console.log("本地图片文件数: " + files.length);

// 1) 并发核对 R2 键（10 并发 HEAD）
const keysToCheck = [];
for (const f of files) keysToCheck.push(f, "upload/" + f);
const missing = new Set();
let idx = 0;
async function checkWorker() {
	while (idx < keysToCheck.length) {
		const k = keysToCheck[idx++];
		try {
			const res = await fetch(SITE + "/assets/" + k, {
				method: "HEAD",
				signal: AbortSignal.timeout(15_000),
			});
			if (!res.ok) missing.add(k);
		} catch {
			missing.add(k);
		}
	}
}
await Promise.all(Array.from({ length: 10 }, checkWorker));
console.log("缺失键: " + missing.size + " / " + keysToCheck.length);
if (missing.size === 0) {
	console.log("无缺失，无需推送");
	process.exit(0);
}
if (mode === "check") {
	[...missing].slice(0, 80).forEach((k) => console.log("  缺 " + k));
	process.exit(0);
}

// 2) 推送缺失（按文件推两种键形态）
const missingFiles = [...new Set([...missing].map((k) => (k.startsWith("upload/") ? k.slice(7) : k)))];
const base = `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucketName}/objects`;
let failedKeys = 0;
for (const f of missingFiles) {
	const buf = new Uint8Array(readFileSync(path.join(UPLOAD_DIR, f)));
	const mime = MIME[path.extname(f).toLowerCase()] ?? "application/octet-stream";
	let allDone = true;
	for (const k of [f, "upload/" + f]) {
		if (!missing.has(k)) continue;
		let done = false;
		for (let a = 0; a < 5 && !done; a++) {
			try {
				const t = readToken();
				if (!t) throw new Error("未读到 wrangler token");
				const res = await fetch(base + "/" + k, {
					method: "PUT",
					headers: { Authorization: `Bearer ${t}`, "Content-Type": mime },
					body: buf,
					signal: AbortSignal.timeout(30_000),
				});
				if (res.ok) {
					done = true;
				} else if (res.status === 401 || res.status === 403) {
					refreshToken();
				} else {
					throw new Error(`R2 API ${res.status}`);
				}
			} catch (e) {
				if (String(e).includes("R2 API 4") && !String(e).includes("401") && !String(e).includes("403")) {
					failedKeys++;
					allDone = false;
					break;
				}
			}
			if (!done) await new Promise((r) => setTimeout(r, 1500 * (a + 1)));
		}
		if (!done && !String(allDone)) {
			/* 已计失败 */
		}
		if (!done) {
			failedKeys++;
			allDone = false;
			console.error("  推送失败: " + k);
		}
	}
	console.log("✓ " + f + " (" + (buf.length / 1024).toFixed(0) + " KB)");
}
console.log(failedKeys === 0 ? "全部补齐完成" : "有 " + failedKeys + " 个键失败");
