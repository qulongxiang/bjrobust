// 成功案例列表
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, type NewsItem, type Paged } from "../api";
import Pager from "../components/Pager";
import PageHero from "../components/PageHero";

const PAGE_SIZE = 10;

export default function Cases() {
	const [params, setParams] = useSearchParams();
	const page = Math.max(Number(params.get("page") ?? 1), 1);
	const [data, setData] = useState<Paged<NewsItem> | null>(null);

	useEffect(() => {
		api.cases(page, PAGE_SIZE).then(setData).catch(() => setData(null));
	}, [page]);

	return (
		<>
			<PageHero
				title="成功案例"
				crumb={
					<>
						<Link to="/">首页</Link> / 成功案例
					</>
				}
			/>

			<section className="section">
				<div className="container">
					<div className="news-list">
						{data?.items.length ? (
							data.items.map((n) => (
								<div className="news-row" key={n.id}>
									<span className="date">{n.noteTime.slice(0, 10)}</span>
									<Link className="title" to={`/cases/${n.id}`}>
										{n.title}
									</Link>
									<span className="arrow">›</span>
								</div>
							))
						) : (
							<div className="empty">暂无案例</div>
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
