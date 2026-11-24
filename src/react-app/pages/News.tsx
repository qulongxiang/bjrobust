// 新闻列表：分类 tabs + 列表 + 分页
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, imgUrl, type NewsItem, type NewsType, type Paged } from "../api";
import Pager from "../components/Pager";
import { applySeo } from "../lib/seo";
import PageHero from "../components/PageHero";

const PAGE_SIZE = 10;

export default function News() {
	// 页面级 SEO：标题/描述覆盖站点默认值
	useEffect(() => {
		applySeo({ raw: "新闻资讯" });
	}, []);
	const [params, setParams] = useSearchParams();
	const type = Number(params.get("type") ?? 3);
	const page = Math.max(Number(params.get("page") ?? 1), 1);
	const [types, setTypes] = useState<NewsType[]>([]);
	const [data, setData] = useState<(Paged<NewsItem> & { type: NewsType }) | null>(null);

	useEffect(() => {
		// 6/7 是代理品牌/合作伙伴，属于「公司概况」页的图片墙，不放在新闻 tab 里（点进去只会是几张 logo）
		api
			.newsTypes()
			.then((list) => setTypes(list.filter((t) => t.id !== 6 && t.id !== 7)))
			.catch(() => {});
	}, []);

	useEffect(() => {
		api.news(type, page, PAGE_SIZE).then(setData).catch(() => setData(null));
	}, [type, page]);

	return (
		<>
			<PageHero
				page="news"
				title="新闻资讯"
				crumb={
					<>
						<Link to="/">首页</Link> / 新闻资讯
					</>
				}
			/>

			<section className="section">
				<div className="container">
					<div className="tabs">
						{types.map((t) => (
							<button
								key={t.id}
								className={t.id === type ? "on" : ""}
								onClick={() =>
									setParams(
										t.id === 3
											? {}
											: { type: String(t.id), page: undefined as unknown as string },
									)
								}
							>
								{t.name}
							</button>
						))}
					</div>

					{data?.items.length ? (
						<div className="news-line-list">
							{data.items.map((n) => (
								<Link className="news-line" to={`/news/${n.id}`} key={n.id}>
									<div className="news-line-pic">
										{n.pic ? <img src={imgUrl(n.pic)} alt={n.title} loading="lazy" /> : null}
									</div>
									<div className="news-line-body">
										<div className="news-line-title">{n.title}</div>
										{n.memo ? <div className="news-line-memo">{n.memo}</div> : null}
										<div className="news-line-meta">
											<span>{n.noteTime.slice(0, 10)}</span>
											<span>浏览：{n.hits}</span>
										</div>
									</div>
								</Link>
							))}
						</div>
					) : (
						<div className="empty">暂无内容</div>
					)}

					<Pager
						page={page}
						pageSize={PAGE_SIZE}
						total={data?.total ?? 0}
						onChange={(p) => setParams(p === 1 ? {} : { page: String(p) })}
					/>
				</div>
			</section>
		</>
	);
}
