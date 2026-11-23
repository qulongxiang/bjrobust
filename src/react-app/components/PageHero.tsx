// 内页头部：还原原版 PHP 站——整宽纯图（无文字压图、橙色底边）+ 标题栏下移
// 头图按「页面键」从数据库取（t_banner，每站独立配置）；没有配置时退回主题渐变底
import { useEffect, useState, type ReactNode } from "react";
import { api, imgUrl } from "../api";

type BannerMap = Record<string, { title: string; pic: string }>;

// 全站共享一次请求：整站所有页面的头图一起取回，页面切换不重复请求
let bannerCache: Promise<BannerMap> | null = null;
function fetchBanners(): Promise<BannerMap> {
	if (!bannerCache) {
		bannerCache = api
			.banners()
			.then((d) => d.pages ?? {})
			.catch(() => ({}));
	}
	return bannerCache;
}

export type PageKey = "about" | "products" | "news" | "cases" | "support" | "contact";

export default function PageHero({
	title,
	crumb,
	page,
	banner,
}: {
	title: string;
	crumb: ReactNode;
	/** 页面键：从站点数据库里取这一页的头图 */
	page?: PageKey;
	/** 兼容旧调用：直接给图片地址（优先于 page） */
	banner?: string;
}) {
	const [pic, setPic] = useState(banner ?? "");

	useEffect(() => {
		if (banner) return setPic(banner);
		if (!page) return;
		let alive = true;
		fetchBanners().then((map) => {
			if (alive) setPic(map[page]?.pic ?? "");
		});
		return () => {
			alive = false;
		};
	}, [banner, page]);

	return (
		<>
			{/* 该站点这一页没配头图时，整块 banner 区域不渲染（只留标题栏） */}
			{pic ? (
				<div className="page-hero">
					<img src={imgUrl(pic)} alt="" />
				</div>
			) : null}
			<div className="page-titlebar">
				<div className="container page-titlebar-inner">
					<h1>{title}</h1>
					<div className="breadcrumb">{crumb}</div>
				</div>
			</div>
		</>
	);
}
