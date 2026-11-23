// 产品分类的公共规则：t_protype 是两级树，产品只挂在"子分类"上，
// 因此点父分类必须展开成"父 + 子"，否则父分类永远是空列表。
// 前后台各写一遍这条规则是之前的老毛病，这里收成一处。
import type { AppEnv } from "../env";
import { rows } from "./d1";

export async function expandTypeIds(env: AppEnv, siteId: number, typeId: number): Promise<number[]> {
	if (!typeId) return [];
	const children = await rows(env.DB.prepare('SELECT id FROM t_protype WHERE "SiteId" = ? AND "PID" = ?').bind(siteId, typeId));
	return [typeId, ...children.map((r) => Number(r.id))];
}

/** 给 SQL 用的 IN 占位符：ids = [1,2,3] → "TypeID IN (?,?,?)" */
export function inClause(ids: number[]): string {
	return `IN (${ids.map(() => "?").join(",")})`;
}
