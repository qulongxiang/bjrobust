// 关于我们（静态页：t_content 公司概况 + 旧站 about.php 还原的合作伙伴图片墙）
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, imgUrl, type NewsItem } from "../api";
import PageHero from "../components/PageHero";
import { safeHtml } from "../lib/html";

export default function About() {
	const [content, setContent] = useState("");
	const [partners, setPartners] = useState<NewsItem[]>([]);
	const [failed, setFailed] = useState(false);

	useEffect(() => {
		api
			.staticPage("公司概况")
			.then((d) => setContent(d.content))
			.catch(() => setFailed(true));
		// 合作伙伴图片墙（旧站 about.php：newslist("合作伙伴")）
		api
			.news(7, 1, 50)
			.then((d) => setPartners(d.items))
			.catch(() => {});
	}, []);

	return (
		<>
			<PageHero
				page="about"
				title="公司概况"
				crumb={
					<>
						<Link to="/">首页</Link> / 公司概况
					</>
				}
			/>

			<section className="section">
				<div className="container">
					{failed ? (
						<div className="empty">页面不存在</div>
					) : content ? (
						<div className="rich static-page" dangerouslySetInnerHTML={{ __html: safeHtml(content) }} />
					) : (
						<div className="empty">加载中…</div>
					)}

					{partners.length ? (
						<div className="about-partners">
							<div className="about-sec-title">合作伙伴</div>
							<div className="about-partner-grid">
								{partners.map((p) => (
									<div className="about-partner-item" key={p.id} title={p.title}>
										{p.pic ? <img src={imgUrl(p.pic)} alt={p.title} loading="lazy" /> : null}
									</div>
								))}
							</div>
						</div>
					) : null}
				</div>
			</section>
		</>
	);
}
