// 成功案例列表："图片 + 文字"卡片网格（还原旧站 case.php，悬停放大）
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, imgUrl, type NewsItem, type Paged } from "../api";
import Pager from "../components/Pager";
import { applySeo } from "../lib/seo";
import PageHero from "../components/PageHero";

const PAGE_SIZE = 10;

export default function Cases() {
	// 页面级 SEO：标题/描述覆盖站点默认值
	useEffect(() => {
		applySeo({ raw: "成功案例" });
	}, []);
	const [params, setParams] = useSearchParams();
	const page = Math.max(Number(params.get("page") ?? 1), 1);
	const [data, setData] = useState<Paged<NewsItem> | null>(null);

	useEffect(() => {
		api.cases(page, PAGE_SIZE).then(setData).catch(() => setData(null));
	}, [page]);

	return (
		<>
			<PageHero
				page="cases"
				title="成功案例"
				crumb={
					<>
						<Link to="/">首页</Link> / 成功案例
					</>
				}
			/>

			<section className="section">
				<div className="container">
					{data?.items.length ? (
						<div className="card-grid">
							{data.items.map((n) => (
								<Link className="card-item" to={`/cases/${n.id}`} key={n.id}>
									<div className="card-pic">
										{n.pic ? <img src={imgUrl(n.pic)} alt={n.title} loading="lazy" /> : null}
									</div>
									<div className="card-info">
										<div className="card-title">{n.title}</div>
										<div className="card-date">{n.noteTime.slice(0, 10)}</div>
									</div>
								</Link>
							))}
						</div>
					) : (
						<div className="empty">暂无案例</div>
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
