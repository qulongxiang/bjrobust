// 案例详情
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, type NewsDetailData } from "../api";
import PageHero from "../components/PageHero";

export default function CaseDetail() {
	const { id } = useParams();
	const [d, setD] = useState<NewsDetailData | null>(null);
	const [failed, setFailed] = useState(false);

	useEffect(() => {
		setD(null);
		setFailed(false);
		api
			.caseDetail(Number(id))
			.then((data) => {
				setD(data);
				if (data.news.webTitle || data.news.title) {
					document.title = data.news.webTitle || data.news.title;
				}
			})
			.catch(() => setFailed(true));
	}, [id]);

	if (failed) return <div className="empty">案例不存在或已下架</div>;
	if (!d) return <div className="empty">加载中…</div>;

	const n = d.news;

	return (
		<>
			<PageHero
				banner="cn-banner/banner4.jpg"
				title="成功案例"
				crumb={
					<>
						<Link to="/">首页</Link> / <Link to="/cases">成功案例</Link> / 详情
					</>
				}
			/>

			<section className="section">
				<div className="container">
					<div className="detail-body">
						<h1>{n.title}</h1>
						<div className="detail-meta">
							<span>发布时间：{n.noteTime.slice(0, 16)}</span>
							<span>浏览：{n.hits}</span>
						</div>
						<div className="rich" dangerouslySetInnerHTML={{ __html: n.content }} />
						<div className="prev-next">
							<span>
								上一案例：
								{d.prev ? <Link to={`/cases/${d.prev.id}`}>{d.prev.title}</Link> : <em>没有了</em>}
							</span>
							<span>
								下一案例：
								{d.next ? <Link to={`/cases/${d.next.id}`}>{d.next.title}</Link> : <em>没有了</em>}
							</span>
						</div>
					</div>
				</div>
			</section>
		</>
	);
}
