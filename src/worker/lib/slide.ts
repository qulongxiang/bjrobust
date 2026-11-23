// 首页 banner 轮播（t_slide）：每站可多张，靠 OrderBy 排序；Pic 存 R2 键，空行不展示
import type { AppEnv } from "../env";
import { nowSql } from "./auth";
import { exec, rows } from "./d1";

export type SlideEntry = {
	id: number;
	pic: string;
	url: string;
	title: string;
	link: string;
	order: number;
	isShow: number;
	updated: string;
};

function map(r: Record<string, unknown>): SlideEntry {
	const pic = String(r.Pic ?? "");
	return {
		id: Number(r.id ?? 0),
		pic,
		url: pic ? `/assets/${pic.replace(/^\//, "")}` : "",
		title: String(r.Title ?? ""),
		link: String(r.Link ?? ""),
		order: Number(r.OrderBy ?? 0),
		isShow: Number(r.IsShow ?? 1),
		updated: String(r.NoteTime ?? ""),
	};
}

/** 读取某站点全部轮播（含隐藏项，后台用；前台再按 IsShow 过滤） */
export async function readSlides(env: AppEnv, siteId: number): Promise<SlideEntry[]> {
	const list = await rows(
		env.DB.prepare('SELECT id, Pic, Title, Link, OrderBy, IsShow, NoteTime FROM t_slide WHERE "SiteId" = ? ORDER BY OrderBy DESC, id DESC').bind(siteId),
	);
	return list.map(map);
}

export async function createSlide(
	env: AppEnv,
	siteId: number,
	b: { pic?: string; title?: string; link?: string; order?: number },
): Promise<number> {
	const res = await exec(
		env.DB.prepare(
			'INSERT INTO t_slide ("SiteId","Pic","Title","Link","OrderBy","IsShow","NoteTime") VALUES (?,?,?,?,?,1,?)',
		),
		siteId,
		String(b.pic ?? ""),
		String(b.title ?? "").slice(0, 120),
		String(b.link ?? "").slice(0, 500),
		Number(b.order ?? 0) || 0,
		nowSql(),
	);
	return Number(res.meta.last_row_id);
}

export async function updateSlide(
	env: AppEnv,
	siteId: number,
	id: number,
	b: { pic?: string; title?: string; link?: string; order?: number; isShow?: number },
): Promise<boolean> {
	const sets: string[] = [];
	const params: (string | number)[] = [];
	const put = (col: string, val: string | number) => {
		sets.push(`"${col}" = ?`);
		params.push(val);
	};
	if (typeof b.pic === "string") put("Pic", b.pic);
	if (typeof b.title === "string") put("Title", b.title.slice(0, 120));
	if (typeof b.link === "string") put("Link", b.link.slice(0, 500));
	if (b.order != undefined) put("OrderBy", Number(b.order) || 0);
	if (b.isShow != undefined) put("IsShow", Number(b.isShow) === 0 ? 0 : 1);
	if (!sets.length) return true;
	put("NoteTime", nowSql());
	const res = await exec(
		env.DB.prepare(`UPDATE t_slide SET ${sets.join(", ")} WHERE "SiteId" = ? AND id = ?`),
		...params,
		siteId,
		id,
	);
	return Boolean(res.meta.changes);
}

export async function deleteSlide(env: AppEnv, siteId: number, id: number): Promise<boolean> {
	const res = await exec(env.DB.prepare('DELETE FROM t_slide WHERE "SiteId" = ? AND id = ?'), siteId, id);
	return Boolean(res.meta.changes);
}

/** 前台用：只取显示中的轮播 */
export async function publicSlides(env: AppEnv, siteId: number): Promise<{ id: number; title: string; pic: string; noteTime: string }[]> {
	const list = await rows(
		env.DB.prepare(
			'SELECT id, Title, Pic, NoteTime FROM t_slide WHERE "SiteId" = ? AND IsShow = 1 AND Pic <> \'\' ORDER BY OrderBy DESC, id DESC LIMIT 10',
		).bind(siteId),
	);
	return list.map((r) => ({
		id: Number(r.id),
		title: String(r.Title ?? ""),
		pic: String(r.Pic ?? ""),
		noteTime: String(r.NoteTime ?? ""),
	}));
}
