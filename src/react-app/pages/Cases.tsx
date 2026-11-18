// 成功案例列表："图片 + 文字"卡片网格（还原旧站 case.php，悬停放大）
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, imgUrl, type NewsItem, type Paged } from "../api";
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
				banner="cn-banner/banner4.jpg"
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
						<div className="case-grid">
							{data.items.map((n) => (
								<Link className="case-card" to={`/cases/${n.id}`} key={n.id}>
									<div className="case-pic">
										{n.pic ? <img src={imgUrl(n.pic)} alt={n.title} loading="lazy" /> : null}
									</div>
									<div className="case-info">
										<div className="case-title">{n.title}</div>
										<div className="case-date">{n.noteTime.slice(0, 10)}</div>
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
