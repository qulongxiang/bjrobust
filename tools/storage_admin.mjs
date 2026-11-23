// 本地运维脚本（替代已下线的 /api/maint/* 接口）
//
//   node tools/storage_admin.mjs list [--prefix bjrobust/upload/] [--json]
//   node tools/storage_admin.mjs orphans [--json]         # R2 有、库里没人引用的孤儿对象；以及库里有、R2 没有的坏引用
//   node tools/storage_admin.mjs prune --file keys.txt [--yes]   # 删除 keys.txt 里的对象（默认 dry-run）
//
// 依赖：CF REST API（Bearer = wrangler 的 oauth_token 或 CLOUDFLARE_API_TOKEN）+ npx wrangler d1（读库内引用）
import { readFileSync, existsSync, unlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WRANGLER_BIN = path.join(ROOT, "node_modules", "wrangler", "bin", "wrangler.js");

const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID || "ea1fab4be92f6b0809efef4bd03c5341";
const BUCKET = process.env.R2_BUCKET || "bjrobust";
const DB_NAME = process.env.D1_NAME || process.env.DB_NAME || "bjrobust";
const WRANGLER_TOML = `${process.env.APPDATA}\\xdg.config\\.wrangler\\config\\default.toml`;

const argv = process.argv.slice(2);
const cmd = argv[0];
const has = (f) => argv.includes(f);
const opt = (f, d = null) => {
	const i = argv.indexOf(f);
	return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};

function token() {
	if (process.env.CLOUDFLARE_API_TOKEN) return process.env.CLOUDFLARE_API_TOKEN;
	if (!existsSync(WRANGLER_TOML)) throw new Error(`找不到 wrangler 配置：${WRANGLER_TOML}`);
	const m = readFileSync(WRANGLER_TOML, "utf8").match(/oauth_token\s*=\s*"([^"]+)"/);
	if (!m) throw new Error("wrangler 配置里没有 oauth_token，请先 npx wrangler login");
	return m[1];
}

async function api(path, init = {}) {
	const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
		...init,
		headers: { Authorization: `Bearer ${token()}`, ...(init.headers || {}) },
	});
	const body = await res.json();
	if (!body.success) throw new Error(`${res.status} ${JSON.stringify(body.errors)}`);
	return body;
}

/** R2 全量 key（自动翻页：result 是数组，游标在 result_info.cursor） */
async function listAll(prefix = "") {
	const keys = [];
	let cursor = "";
	do {
		const qs = new URLSearchParams({ per_page: "1000" });
		if (prefix) qs.set("prefix", prefix);
		if (cursor) qs.set("cursor", cursor);
		const body = await api(`/accounts/${ACCOUNT}/r2/buckets/${BUCKET}/objects?${qs}`);
		for (const o of body.result || []) keys.push(o.key);
		cursor = body.result_info && body.result_info.is_truncated ? body.result_info.cursor : "";
	} while (cursor);
	return keys;
}

function d1(command) {
	// 直接跑 wrangler 的 node 入口 + 参数数组：绕开 cmd 对 .cmd 的限制，SQL 里的空格也不会被拆开
	const out = execFileSync(process.execPath, [WRANGLER_BIN, "d1", "execute", DB_NAME, "--remote", "--json", "--command", command], {
		encoding: "utf8",
		maxBuffer: 64 * 1024 * 1024,
	});
	const start = out.indexOf("[");
	return JSON.parse(out.slice(start))[0].results || [];
}

// 库里任何一张表的字符串字段都可能存图片引用，所以直接拿整库快照扫，不做表清单猜测
// 跳过：sqlite/_cf 内部表、t_content_20260528 这类带日期后缀的备份表（不是线上数据）
const SKIP_TABLE = /^(?:sqlite_|_cf_)|_\d{8}$/;

const KEY_RE = /(?:\/assets\/)?((?:bjrobust|[a-z0-9-]{2,20})\/(?:upload|cn-banner|cn-images)\/[^\s"'<>()\\]+|upload\/[^\s"'<>()\\]+|cn-banner\/[^\s"'<>()\\]+|cn-images\/[^\s"'<>()\\]+)/gi;

function normKey(raw) {
	let k = raw.replace(/^\/assets\//, "/").replace(/^\/+/, "");
	k = k.split("?")[0].split("#")[0];
	return k;
}

/** 导出整库快照，逐行扫 INSERT，得到 key -> 来源(t表#id) */
function collectRefs() {
	const dump = path.join(os.tmpdir(), `bjrobust-dump-${process.pid}.sql`);
	try {
		execFileSync(process.execPath, [WRANGLER_BIN, "d1", "export", DB_NAME, "--remote", "--output", dump], {
			encoding: "utf8",
			maxBuffer: 64 * 1024 * 1024,
		});
	} catch (e) {
		throw new Error(`d1 export 失败：${String(e.message).split("\n")[0]}`);
	}
	const text = readFileSync(dump, "utf8");
	unlinkSync(dump);
	const refs = new Map();
	for (const line of text.split(/\r?\n/)) {
		const t = line.match(/^INSERT INTO "?([\w-]+)"?/i);
		if (!t || SKIP_TABLE.test(t[1])) continue;
		const table = t[1];
		for (const m of line.matchAll(KEY_RE)) {
			const k = normKey(m[1]);
			if (k.length < 8) continue;
			if (!refs.has(k)) refs.set(k, table);
		}
	}
	return refs;
}

async function main() {
	if (!cmd || has("--help") || has("-h")) {
		console.log(readFileSync(new URL(import.meta.url), "utf8").split("\n").slice(1, 8).join("\n"));
		return;
	}

	if (cmd === "list") {
		const prefix = opt("--prefix", "");
		const keys = await listAll(prefix);
		if (has("--json")) {
			console.log(JSON.stringify(keys, null, 2));
			return;
		}
		console.log(`bucket=${BUCKET} prefix=${prefix || "(all)"} objects=${keys.length}`);
		const byDir = {};
		for (const k of keys) {
			const d = k.split("/").slice(0, 2).join("/");
			byDir[d] = (byDir[d] || 0) + 1;
		}
		for (const [d, n] of Object.entries(byDir).sort()) console.log(`  ${d}  ${n}`);
		return;
	}

	if (cmd === "orphans") {
		const keys = await listAll();
		const refs = collectRefs();
		const orphan = keys.filter((k) => !refs.has(k));
		const broken = [...refs.keys()].filter((k) => !keys.includes(k));
		// 只按“站点自有目录”统计才算数：桶里可能有其它项目的 key，这里不做白名单过滤
		const report = {
			bucket: BUCKET,
			objects: keys.length,
			referenced: refs.size,
			orphans: orphan.length,
			broken: broken.length,
			orphanKeys: orphan,
			brokenRefs: broken.map((k) => ({ key: k, from: refs.get(k) })),
		};
		if (has("--json")) {
			console.log(JSON.stringify(report, null, 2));
			return;
		}
		console.log(`对象 ${report.objects}，库内引用 ${report.referenced} 个唯一 key`);
		console.log(`孤儿（R2 有 / 无人引用）：${report.orphans}`);
		for (const k of orphan.slice(0, 40)) console.log(`  - ${k}`);
		if (orphan.length > 40) console.log(`  … 另有 ${orphan.length - 40} 个`);
		console.log(`坏引用（库里有 / R2 没有）：${report.broken}`);
		for (const b of report.brokenRefs.slice(0, 40)) console.log(`  - ${b.key}  (from ${b.from})`);
		if (broken.length > 40) console.log(`  … 另有 ${broken.length - 40} 个`);
		return;
	}

	if (cmd === "prune") {
		const file = opt("--file");
		if (!file) throw new Error("prune 需要 --file keys.txt（每行一个 key）");
		const targets = readFileSync(file, "utf8").split(/\r?\n/).map((s) => s.trim()).filter((s) => s && !s.startsWith("#"));
		const yes = has("--yes");
		console.log(`待删 ${targets.length} 个对象，模式=${yes ? "真删" : "dry-run"}`);
		let done = 0;
		for (const key of targets) {
			if (!yes) {
				console.log(`  would delete ${key}`);
				continue;
			}
			await api(`/accounts/${ACCOUNT}/r2/buckets/${BUCKET}/objects/${encodeURI(key)}`, { method: "DELETE" });
			done++;
			if (done % 20 === 0) console.log(`  deleted ${done}/${targets.length}`);
		}
		console.log(yes ? `已删除 ${done}` : "dry-run 结束，加 --yes 才真正删除");
		return;
	}

	throw new Error(`未知命令：${cmd}`);
}

main().catch((e) => {
	console.error(e.message || e);
	process.exit(1);
});
