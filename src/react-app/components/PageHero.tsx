// 内页头部：内页 banner 图（t_news NewType=2）+ 渐变遮罩；图缺失时自动回退纯渐变
import { useEffect, useState, type ReactNode } from "react";
import { api, imgUrl } from "../api";

// 全站共享一次请求
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

export default function PageHero({ title, crumb }: { title: string; crumb: ReactNode }) {
	const [pic, setPic] = useState("");

	useEffect(() => {
		fetchBanner().then((d) => setPic(d.pic));
	}, []);

	return (
		<div className="page-hero">
			{pic ? <img src={imgUrl(pic)} alt="" /> : null}
			<div className="container">
				<h1>{title}</h1>
				<div className="breadcrumb">{crumb}</div>
			</div>
		</div>
	);
}
