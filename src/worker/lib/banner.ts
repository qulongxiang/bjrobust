// 内页头图（t_banner）：每站每个页面一张，可由站点管理员维护本站，也可由平台超管统一维护所有站点
import type { AppEnv, SiteInfo } from "../env";
import { nowSql } from "./auth";
import { exec, rows } from "./d1";
import { ALLOWED_EXT, MAX_SIZE, sniffImage } from "./upload";

/** 页面键与前端路由保持一致 */
export const BANNER_PAGES: { page: string; label: string }[] = [
	{ page: "about", label: "公司概况" },
	{ page: "products", label: "产品中心" },
	{ page: "news", label: "新闻资讯" },
	{ page: "cases", label: "成功案例" },
	{ page: "support", label: "技术支持" },
	{ page: "contact", label: "联系我们" },
];

export function isBannerPage(page: string): boolean {
	return BANNER_PAGES.some((b) => b.page === page);
}

export type BannerEntry = {
	page: string;
	label: string;
	/** R2 键或外链；空 = 该页不配图（前台不显示 banner 区域） */
	pic: string;
	url: string;
	updated: string;
};

/** 读取某站点所有页面的头图（缺记录的页面返回空 pic） */
export async function readBannerEntries(env: AppEnv, siteId: number): Promise<BannerEntry[]> {
	const list = await rows(
		env.DB.prepare('SELECT "Page", "Pic", "NoteTime" FROM t_banner WHERE "SiteId" = ?').bind(siteId),
	);
	const map = new Map(list.map((r) => [String(r.Page ?? ""), r]));
	return BANNER_PAGES.map((b) => {
		const pic = String(map.get(b.page)?.Pic ?? "");
		return {
			page: b.page,
			label: b.label,
			pic,
			url: pic ? `/assets/${pic.replace(/^\//, "")}` : "",
			updated: String(map.get(b.page)?.NoteTime ?? ""),
		};
	});
}

/** 写入/清空某页头图（key 为空 = 清除） */
export async function setBannerPic(env: AppEnv, siteId: number, page: string, key: string): Promise<void> {
	const now = nowSql();
	const exists = await env.DB.prepare('SELECT "id" FROM t_banner WHERE "SiteId" = ? AND "Page" = ?')
		.bind(siteId, page)
		.first();
	if (exists) {
		await exec(
			env.DB.prepare('UPDATE t_banner SET "Pic" = ?, "NoteTime" = ? WHERE "SiteId" = ? AND "Page" = ?'),
			key,
			now,
			siteId,
			page,
		);
	} else {
		const order = BANNER_PAGES.findIndex((b) => b.page === page);
		await exec(
			env.DB.prepare(
				'INSERT INTO t_banner ("SiteId","Page","Title","Pic","OrderBy","IsShow","NoteTime") VALUES (?,?,?,?,?,1,?)',
			),
			siteId,
			page,
			BANNER_PAGES[order]?.label ?? page,
			key,
			order < 0 ? 0 : order,
			now,
		);
	}
}

/** 上传并替换某站点某页头图：落到 cn-banner/<code>/<page>.<ext>，再写库 */
export async function saveBannerFile(
	env: AppEnv,
	site: SiteInfo,
	page: string,
	file: File,
): Promise<{ ok: true; pic: string } | { ok: false; error: string; status: number }> {
	if (!env.IMAGES) return { ok: false, error: "R2 未开通，无法上传头图", status: 503 };
	if (!isBannerPage(page)) return { ok: false, error: "未知头图页面", status: 400 };
	if (file.size > MAX_SIZE) return { ok: false, error: "文件超过 5MB 限制", status: 400 };
	const dot = file.name.lastIndexOf(".");
	const ext = dot >= 0 ? file.name.slice(dot).toLowerCase() : ".jpg";
	if (!ALLOWED_EXT[ext]) return { ok: false, error: "只支持 jpg/png/gif/webp", status: 400 };
	const sniffed = await sniffImage(file);
	if (!sniffed) return { ok: false, error: "文件内容不是有效图片", status: 400 };

	const key = `cn-banner/${site.code}/${page}${ext}`;
	await env.IMAGES.put(key, file.stream(), { httpMetadata: { contentType: sniffed } });
	await setBannerPic(env, site.id, page, key);
	return { ok: true, pic: key };
}
