// 内页头部：还原原版 PHP 站——整宽纯图（无文字压图、橙色底边）+ 标题栏下移
import { useEffect, useState, type ReactNode } from "react";
import { api, imgUrl } from "../api";

// 全站共享一次请求（页面未传 banner 时的兜底图）
let bannerCache: Promise<{ title: string; pic: string }> | null = null;
function fetchBanner() {
	if (!bannerCache) {
		bannerCache = api
			.pageBanner()
			.then((d) => ({ title: d.title, pic: d.pic }))
			.catch(() => ({ title: "", pic: "" }));
	}
	return bannerCache;
}

export default function PageHero({
	title,
	crumb,
	banner,
}: {
	title: string;
	crumb: ReactNode;
	banner?: string;
}) {
	const [pic, setPic] = useState(banner ?? "");

	useEffect(() => {
		if (banner) return;
		fetchBanner().then((d) => setPic(d.pic));
	}, [banner]);

	return (
		<>
			<div className="page-hero">
				{pic ? <img src={imgUrl(pic)} alt="" /> : null}
			</div>
			<div className="page-titlebar">
				<div className="container page-titlebar-inner">
					<h1>{title}</h1>
					<div className="breadcrumb">{crumb}</div>
				</div>
			</div>
		</>
	);
}
