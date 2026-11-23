// 运维工具：历史图片整理
// 目标：R2 桶根目录直接是站点目录，站点目录下再分 upload / cn-banner，图片再按年/月/日分层：
//   <站点Code>/upload/<YYYY>/<MM>/<DD>/<文件名>
//   <站点Code>/cn-banner/<YYYY>/<MM>/<DD>/<文件名>
// 历史（老 PHP 站）图片留在桶根：upload/<文件名>、upload/<子目录>/…
// 上一版布局也一并搬走：upload/<站点Code>/<日期>/…、cn-banner/<站点Code>/<日期>/…
// 说明：
//   - 默认只复制不删除（purge=true 才删旧对象），可反复执行（幂等）
//   - 历史文件都来自老 PHP 站（bjrobust），统一归到 bjrobust 目录
//   - 日期优先取文件名里的 yyyyMMdd（老 PHP 上传的命名就是时间戳），否则用 R2 的 uploaded 时间（+08:00）
//   - 分批跑：body 里带 after（上一批返回的 nextAfter）继续，避免单次请求超时
import { Hono } from "hono";
import type { Context } from "hono";
import type { AppEnv, AdminVariables, R2BucketLike } from "../env";

const app = new Hono<{ Bindings: AppEnv; Variables: AdminVariables }>();

type SiteRow = { id: number; Code: string };
type PlanItem = { oldKey: string; newKey: string; size: number; date: string };

function pad(n: number): string {
	return n < 10 ? `0${n}` : String(n);
}

/** R2 的 uploaded 是 UTC，按 +08:00 出日期 */
function dateOf(uploaded: Date | string | undefined, fallbackName: string): string {
	const m = fallbackName.match(/^(\d{4})(\d{2})(\d{2})/);
	if (m) {
		const [, y, mo, d] = m;
		if (Number(mo) >= 1 && Number(mo) <= 12 && Number(d) >= 1 && Number(d) <= 31) return `${y}/${mo}/${d}`;
	}
	const d = uploaded ? new Date(uploaded) : new Date();
	const bj = new Date(d.getTime() + 8 * 3600 * 1000);
	return `${bj.getUTCFullYear()}/${pad(bj.getUTCMonth() + 1)}/${pad(bj.getUTCDate())}`;
}

async function listPrefix(
	bucket: R2BucketLike,
	prefix: string,
): Promise<{ key: string; size: number; uploaded?: Date | string }[]> {
	const all: { key: string; size: number; uploaded?: Date | string }[] = [];
	let cursor: string | undefined;
	for (;;) {
		const res = await bucket.list({ prefix, limit: 1000, cursor });
		for (const o of res.objects) all.push({ key: o.key, size: o.size, uploaded: o.uploaded });
		if (!res.truncated) break;
		cursor = res.cursor;
		if (!cursor) break;
	}
	return all;
}

/** 取表的列名（SELECT * 取一行看 key，D1 下比 PRAGMA 稳） */
async function tableColumns(env: AppEnv, table: string): Promise<Set<string>> {
	try {
		const rs = await env.DB.prepare(`SELECT * FROM "${table}" LIMIT 1`).all<Record<string, unknown>>();
		return new Set(Object.keys(rs.results?.[0] ?? {}));
	} catch {
		return new Set();
	}
}

/** 库内可能存图片路径的表/列 */
const TARGETS: [string, string][] = [
	["t_news", "SmallPic"],
	["t_news", "Content"],
	["t_products", "SmallPic"],
	["t_products", "Content"],
	["t_img", "PicUrl"],
	["t_img", "BigUrl"],
	["t_slide", "Pic"],
	["t_banner", "Pic"],
	["t_content", "Content"],
	["t_sites", "LogoUrl"],
];

/**
 * 单个旧 key → 新 key 的映射（新布局：<code>/upload/年/月/日/文件）
 * 返回 null 表示已经在目标布局下，无需搬。
 */
function mapKey(key: string, size: number, uploaded: Date | string | undefined, codes: Set<string>): PlanItem | null {
	const segs = key.split("/").filter(Boolean);
	if (!segs.length) return null;
	if (codes.has(segs[0].toLowerCase())) return null; // <code>/… 已经是目标布局

	const root = segs[0] === "upload" || segs[0] === "cn-banner" ? segs[0] : "";
	if (!root) {
		// 桶根散落资源：cn-images/logo-di.jpg → bjrobust/cn-images/logo-di.jpg
		if (segs.length > 1) return { oldKey: key, newKey: `bjrobust/${key}`, size, date: "" };
		// 桶根裸文件名 → bjrobust/upload/<日期>/<文件>
		const base = segs[0];
		return { oldKey: key, newKey: `bjrobust/upload/${dateOf(uploaded, base)}/${base}`, size, date: dateOf(uploaded, base) };
	}

	const rest = key.slice(root.length + 1);
	const parts = rest.split("/").filter(Boolean);
	if (!parts.length) return null;

	const seg0 = parts[0].toLowerCase();
	// 上一版布局：upload/<站点Code>/<年>/<月>/<日>/<文件> → <站点Code>/upload/<年>/<月>/<日>/<文件>
	if (codes.has(seg0) && parts.length >= 4) {
		const tail = parts.slice(1).join("/");
		return { oldKey: key, newKey: `${seg0}/${root}/${tail}`, size, date: parts.slice(1, 4).join("/") };
	}
	// 桶根历史文件：upload/<文件> 或 upload/<子目录>/<文件> → bjrobust/upload/<日期>/<文件>
	const base = parts[parts.length - 1];
	const date = dateOf(uploaded, base);
	return { oldKey: key, newKey: `bjrobust/${root}/${date}/${base}`, size, date };
}

/** 批量改写库内引用：把旧 key / 裸文件名 / 富文本里的旧路径换成新 key（幂等，可重复跑） */
async function applyDbRewrites(
	env: AppEnv,
	items: PlanItem[],
): Promise<{ changes: number; errors: string[] }> {
	const db = env.DB;
	const errors: string[] = [];
	const colsOf = new Map<string, Set<string>>();
	for (const [table] of TARGETS) if (!colsOf.has(table)) colsOf.set(table, await tableColumns(env, table));
	const stmts: D1PreparedStatement[] = [];
	for (const p of items) {
		const base = p.oldKey.split("/").pop() ?? p.oldKey; // 库里存的多是裸文件名
		for (const [table, col] of TARGETS) {
			if (!colsOf.get(table)?.has(col)) continue;
			if (col === "Content") {
				// 富文本：整条旧 key（含 /assets/ 前缀）直接替换；再兜底老站 /upload/<文件名>
				stmts.push(
					db
						.prepare(`UPDATE "${table}" SET "${col}" = REPLACE("${col}", ?, ?) WHERE instr("${col}", ?) > 0`)
						.bind(p.oldKey, p.newKey, p.oldKey),
				);
				stmts.push(
					db
						.prepare(`UPDATE "${table}" SET "${col}" = REPLACE("${col}", ?, ?) WHERE instr("${col}", ?) > 0`)
						.bind(`/upload/${base}`, `/assets/${p.newKey}`, `/upload/${base}`),
				);
			} else {
				for (const from of [base, p.oldKey, `/${p.oldKey}`, `/assets/${p.oldKey}`]) {
					const to = from.startsWith("/assets/") ? `/assets/${p.newKey}` : p.newKey;
					stmts.push(db.prepare(`UPDATE "${table}" SET "${col}" = ? WHERE "${col}" = ?`).bind(to, from));
				}
			}
		}
	}
	let changes = 0;
	for (let i = 0; i < stmts.length; i += 40) {
		const chunk = stmts.slice(i, i + 40);
		try {
			const res = await db.batch(chunk);
			for (const r of res) changes += Number(r.meta?.changes ?? 0);
		} catch {
			// 批量失败就逐条重试，避免一条语句拖垮整批
			for (const s of chunk) {
				try {
					const r = await s.run();
					changes += Number(r.meta?.changes ?? 0);
				} catch (e) {
					errors.push(`db:${e instanceof Error ? e.message : "err"}`);
				}
			}
		}
	}
	return { changes, errors };
}

/**
 * POST /api/maint/storage/migrate
 * body: { dry?, purge?, limit?, after?, dbOnly?, prefix? }
 *   dry     默认 true（只看计划）
 *   after   从哪个 oldKey 之后继续（用上一批返回的 nextAfter）
 *   dbOnly  true = 只改库引用，不复制（补跑用）
 * 鉴权：header X-Maint-Token === env.MAINT_TOKEN，未配置 secret 时一律 403
 */
export async function migrateHandler(c: Context<{ Bindings: AppEnv; Variables: AdminVariables }>) {
	const b = await c.req.json().catch(() => ({} as Record<string, unknown>));
	const tokenOk = !!c.env.MAINT_TOKEN && c.req.header("X-Maint-Token") === c.env.MAINT_TOKEN;
	if (!tokenOk) return c.json({ error: "维护令牌无效" }, 403);
	if (!c.env.IMAGES) return c.json({ error: "R2 未绑定" }, 503);

	const dry = b.dry !== false;
	const purge = b.purge === true;
	const dbOnly = b.dbOnly === true;
	const limit = Math.min(200, Number(b.limit ?? 60) || 60);
	const after = typeof b.after === "string" ? b.after : "";
	const only = typeof b.prefix === "string" ? b.prefix : "";
	const db = c.env.DB;

	const sites = (await db.prepare("SELECT id, Code FROM t_sites").all()).results as unknown as SiteRow[];
	const codes = new Set(sites.map((s) => String(s.Code).toLowerCase()));

	// 0) 盘点：按第一层目录统计对象数，看看桶根有没有站点目录之外的散落资源
	if (b.inventory === true) {
		const all = await listPrefix(c.env.IMAGES, only);
		const byTop: Record<string, number> = {};
		const keys: string[] = [];
		for (const o of all) {
			const top = o.key.includes("/") ? o.key.split("/")[0] : "(root file)";
			byTop[top] = (byTop[top] ?? 0) + 1;
			if (!codes.has(top.toLowerCase())) keys.push(o.key);
		}
		return c.json({ ok: true, inventory: byTop, total: all.length, others: keys.slice(0, 100) });
	}

	// 1) 找历史对象（upload/ 与 cn-banner/ 根下的都属于历史；已在 <code>/ 下的跳过）
	const roots = only ? [`${only}/`] : [""];
	const legacy: { key: string; size: number; uploaded?: Date | string; root: string }[] = [];
	for (const root of roots) {
		for (const o of await listPrefix(c.env.IMAGES, root)) {
			const rest = o.key.slice(root.length);
			if (!rest) continue;
			legacy.push({ ...o, root });
		}
	}

	// 2) 排计划（确定性：按 oldKey 升序，便于 after 分批）
	legacy.sort((a, b2) => (a.key < b2.key ? -1 : a.key > b2.key ? 1 : 0));
	const used = new Set<string>();
	const plan: PlanItem[] = [];
	for (const o of legacy) {
		const item = mapKey(o.key, o.size, o.uploaded, codes);
		if (!item) continue;
		let newKey = item.newKey;
		let n = 2;
		while (used.has(newKey)) {
			const base = newKey.split("/").pop() ?? "";
			const dot = base.lastIndexOf(".");
			const stem = dot > 0 ? base.slice(0, dot) : base;
			const ext = dot > 0 ? base.slice(dot) : "";
			newKey = `${newKey.slice(0, newKey.length - base.length)}${stem}-${n}${ext}`;
			n += 1;
		}
		used.add(newKey);
		plan.push({ ...item, newKey });
	}

	if (dry) {
		const match = typeof b.match === "string" ? b.match : "";
		const queued = plan.filter((p) => p.oldKey > after);
		const matched = match ? plan.filter((p) => p.oldKey.includes(match) || p.newKey.includes(match)) : [];
		return c.json({
			ok: true,
			dry: true,
			sites: [...codes],
			legacyCount: plan.length,
			queuedAfter: queued.length,
			matched,
			samples: queued.slice(0, 10),
		});
	}

	// 3) 本批：复制（已存在同尺寸就跳过）
	const queued = plan.filter((p) => p.oldKey > after);
	const batch = queued.slice(0, limit);
	const nextAfter = batch.length ? batch[batch.length - 1].oldKey : "";
	const copied: string[] = [];
	const skipped: string[] = [];
	const errors: string[] = [];

	if (!dbOnly) {
		for (const p of batch) {
			try {
				const head = await c.env.IMAGES.head(p.newKey);
				if (head && head.size === p.size) {
					skipped.push(p.oldKey);
					continue;
				}
				const obj = await c.env.IMAGES.get(p.oldKey);
				if (!obj) {
					errors.push(`missing:${p.oldKey}`);
					continue;
				}
				await c.env.IMAGES.put(p.newKey, obj.body, {
					httpMetadata: obj.httpMetadata,
					customMetadata: { ...(obj.customMetadata ?? {}), movedFrom: p.oldKey },
				});
				copied.push(p.oldKey);
			} catch (e) {
				errors.push(`${p.oldKey}:${e instanceof Error ? e.message : "err"}`);
			}
		}
	}

	// 4) 改写库内引用（对已复制成功的 + 库里引用过的都处理；幂等）
	const rew = await applyDbRewrites(c.env, batch);
	errors.push(...rew.errors);

	// 5) 可选：删旧对象（确认线上正常后再开）
	let purged = 0;
	if (purge && !dbOnly) {
		for (const p of batch) {
			if (copied.includes(p.oldKey) || skipped.includes(p.oldKey)) {
				try {
					await c.env.IMAGES.delete(p.oldKey);
					purged += 1;
				} catch (e) {
					errors.push(`del:${p.oldKey}:${e instanceof Error ? e.message : "err"}`);
				}
			}
		}
	}

	return c.json({
		ok: true,
		processed: batch.length,
		copied: copied.length,
		skipped: skipped.length,
		purged,
		dbChanges: rew.changes,
		nextAfter,
		remaining: queued.length - batch.length,
		errors: errors.slice(0, 20),
	});
}

app.post("/storage/migrate", (c) => migrateHandler(c));

export default app;
