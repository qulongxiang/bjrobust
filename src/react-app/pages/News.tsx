// 新闻列表：分类 tabs + 列表 + 分页
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, type NewsItem, type NewsType, type Paged } from "../api";
import Pager from "../components/Pager";
import PageHero from "../components/PageHero";

const PAGE_SIZE = 10;

export default function News() {
	const [params, setParams] = useSearchParams();
	const type = Number(params.get("type") ?? 3);
	const page = Math.max(Number(params.get("page") ?? 1), 1);
	const [types, setTypes] = useState<NewsType[]>([]);
	const [data, setData] = useState<(Paged<NewsItem> & { type: NewsType }) | null>(null);

	useEffect(() => {
		api.newsTypes().then(setTypes).catch(() => {});
	}, []);

	useEffect(() => {
		api.news(type, page, PAGE_SIZE).then(setData).catch(() => setData(null));
	}, [type, page]);

	return (
		<>
			<PageHero
				banner="cn-banner/banner3.jpg"
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

					<div className="news-list">
						{data?.items.length ? (
							data.items.map((n) => (
								<div className="news-row" key={n.id}>
									<span className="date">{n.noteTime.slice(0, 10)}</span>
									<Link className="title" to={`/news/${n.id}`}>
										{n.title}
									</Link>
									<span className="arrow">›</span>
								</div>
							))
						) : (
							<div className="empty">暂无内容</div>
						)}
					</div>

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
