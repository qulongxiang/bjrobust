// 租户查询护栏：拦住"碰了租户表却没写 SiteId"的 SQL
// 目的是把"每条查询记得带 SiteId"这条口头约定变成运行时能发现的东西：
//   DB_GUARD=strict → 直接抛错（本地跑测试用）
//   其它（含未设置）→ console.warn，带请求路径与 SQL 片段，线上靠日志发现
// 例外：显式在 SQL 里写 /* site:global */ 的查询放行（例如按 id 查站点表、字典表）
import type { AppEnv } from "../env";

type DB = AppEnv["DB"];

/** 必须带 SiteId 才能查的表 */
const TENANT_TABLES = new Set([
	"t_news",
	"t_products",
	"t_img",
	"t_slide",
	"t_banner",
	"t_content",
	"t_global",
	"t_feedback",
	"t_protype",
	"t_log",
]);

const TABLE_PATTERN = /(?:from|into|update|join)\s+["']?(t_[a-z_]+)["']?/g;

export type GuardViolation = { sql: string; tables: string[] };

/** 分析一条 SQL 是否有租户越界风险 */
export function findViolation(sql: string): GuardViolation | null {
	const lower = sql.toLowerCase();
	if (lower.includes("/* site:global */")) return null;
	if (lower.includes("siteid")) return null;
	const tables: string[] = [];
	for (const m of lower.matchAll(TABLE_PATTERN)) {
		if (TENANT_TABLES.has(m[1])) tables.push(m[1]);
	}
	if (!tables.length) return null;
	return { sql, tables };
}

export type GuardOptions = {
	/** 请求路径，仅用于日志 */
	path: string;
	/** 报告回调：严格模式由调用方抛错，否则 warn */
	onViolation: (v: GuardViolation, path: string) => void;
};

/**
 * 包装 D1：prepare(sql) / batch(statements) 时检查，不改写 SQL、不影响命中
 * 只包一层 Proxy，D1 其余方法（exec、withSession…）原样透传
 */
export function guardedDB(db: DB, opts: GuardOptions): DB {
	let reported = 0;
	const check = (sql: string) => {
		const v = findViolation(sql);
		if (!v || reported >= 5) return;
		reported += 1;
		opts.onViolation(v, opts.path);
	};

	return new Proxy(db, {
		get(target, prop, receiver) {
			const value = Reflect.get(target, prop, receiver);
			if (prop === "prepare" && typeof value === "function") {
				return (sql: string, ...rest: unknown[]) => {
					check(sql);
					return (value as (...a: unknown[]) => unknown).call(target, sql, ...rest);
				};
			}
			return typeof value === "function" ? (value as Function).bind(target) : value;
		},
	}) as DB;
}
