// 新闻详情：内容 + 上一篇/下一篇
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, type NewsDetailData } from "../api";
import PageHero from "../components/PageHero";

export default function NewsDetail() {
	const { id } = useParams();
	const [d, setD] = useState<NewsDetailData | null>(null);
	const [failed, setFailed] = useState(false);

	useEffect(() => {
		setD(null);
		setFailed(false);
		api
			.newsDetail(Number(id))
			.then((data) => {
				setD(data);
				if (data.news.webTitle || data.news.title) {
					document.title = data.news.webTitle || data.news.title;
				}
			})
			.catch(() => setFailed(true));
	}, [id]);

	if (failed) return <div className="empty">内容不存在或已下架</div>;
	if (!d) return <div className="empty">加载中…</div>;

	const n = d.news;

	return (
		<>
			<PageHero
				title="新闻资讯"
				crumb={
					<>
						<Link to="/">首页</Link> / <Link to="/news">新闻资讯</Link> / 详情
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
						{n.memo ? (
							<div className="rich" style={{ marginTop: 14, color: "#6b7280", fontSize: 14 }}>
								{n.memo}
							</div>
						) : null}
						<div className="prev-next">
							<span>
								上一篇：
								{d.prev ? <Link to={`/news/${d.prev.id}`}>{d.prev.title}</Link> : <em>没有了</em>}
							</span>
							<span>
								下一篇：
								{d.next ? <Link to={`/news/${d.next.id}`}>{d.next.title}</Link> : <em>没有了</em>}
							</span>
						</div>
					</div>
				</div>
			</section>
		</>
	);
}
