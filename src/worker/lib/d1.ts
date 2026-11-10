// D1 兼容助手：统一「绑定参数 + 执行 + 取行」
// 新版 workerd 类型中 all() 返回 D1Result（需 .results 取行数组），
// 且 run() 不接受参数（参数一律先 bind）——这里收敛写法。

export function exec(stmt: D1PreparedStatement, ...values: unknown[]) {
	return stmt.bind(...values).run();
}

export async function rows<T = Record<string, unknown>>(stmt: D1PreparedStatement): Promise<T[]> {
	const res = await stmt.all<T>();
	return res.results;
}

export async function row<T = Record<string, unknown>>(stmt: D1PreparedStatement): Promise<T | null> {
	return stmt.first<T>();
}

export async function count(stmt: D1PreparedStatement): Promise<number> {
	const r = await stmt.first<{ n: number }>();
	return Number(r?.n ?? 0);
}
