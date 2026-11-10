// 首页：横幅轮播 + 公司简介 + 最新新闻 + 推荐产品
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, imgUrl, type HomeData } from "../api";

export default function Home() {
	const [d, setD] = useState<HomeData | null>(null);
	const [slide, setSlide] = useState(0);

	useEffect(() => {
		api.home().then(setD).catch(() => setD(null));
	}, []);

	useEffect(() => {
		if (!d || d.banners.length < 2) return;
		const t = setInterval(() => setSlide((s) => (s + 1) % d.banners.length), 5000);
		return () => clearInterval(t);
	}, [d]);

	if (!d) return <div className="empty">加载中…</div>;

	const siteName = d.global?.webname && d.global.webname !== "网站名称" ? d.global.webname : d.global?.title || "";

	return (
		<>
			{/* 横幅 */}
			<div className="hero">
				{d.banners.length ? (
					d.banners.map((b, i) => (
						<div key={b.id} className={`hero-slide ${i === slide ? "on" : ""}`}>
							{b.pic ? <img src={imgUrl(b.pic)} alt={b.title} /> : null}
							<div className="hero-text">{b.title || siteName}</div>
						</div>
					))
				) : (
					<div className="hero-slide on">
						<div className="hero-text">{siteName}</div>
					</div>
				)}
				{d.banners.length > 1 ? (
					<div className="hero-dots">
						{d.banners.map((b, i) => (
							<button
								key={b.id}
								className={i === slide ? "on" : ""}
								aria-label={`banner-${i + 1}`}
								onClick={() => setSlide(i)}
							/>
						))}
					</div>
				) : null}
			</div>

			{/* 公司简介 */}
			{d.about ? (
				<section className="section">
					<div className="container">
						<div className="section-head">
							<h2 className="section-title">关于我们</h2>
							<Link className="section-more" to="/about">
								了解更多 →
							</Link>
						</div>
						<div
							className="rich about-text"
							dangerouslySetInnerHTML={{ __html: d.about }}
						/>
					</div>
				</section>
			) : null}

			{/* 最新新闻 */}
			<section className="section section-alt">
				<div className="container">
					<div className="section-head">
						<h2 className="section-title">新闻中心</h2>
						<Link className="section-more" to="/news">
							全部新闻 →
						</Link>
					</div>
					<div className="news-grid">
						<div className="news-list">
							{d.news.slice(0, 5).map((n) => (
								<div className="news-row" key={n.id}>
									<span className="date">{n.noteTime.slice(0, 10)}</span>
									<Link className="title" to={`/news/${n.id}`}>
										{n.title}
									</Link>
									<span className="arrow">›</span>
								</div>
							))}
							{!d.news.length ? <div className="empty">暂无新闻</div> : null}
						</div>
						<div className="news-side">
							<h4>推荐产品</h4>
							{d.products.slice(0, 5).map((p) => (
								<Link
									key={p.id}
									to={`/products/${p.id}`}
									className="news-row"
									style={{ padding: "9px 0" }}
								>
									<span className="title">{p.name}</span>
									<span className="arrow">›</span>
								</Link>
							))}
							{!d.products.length ? <div className="empty">暂无产品</div> : null}
						</div>
					</div>
				</div>
			</section>

			{/* 推荐产品 */}
			{d.products.length ? (
				<section className="section">
					<div className="container">
						<div className="section-head">
							<h2 className="section-title">产品中心</h2>
							<Link className="section-more" to="/products">
								全部产品 →
							</Link>
						</div>
						<div className="product-grid">
							{d.products.map((p) => (
								<Link className="product-card" to={`/products/${p.id}`} key={p.id}>
									<div className="pic">
										{p.pic ? <img src={imgUrl(p.pic)} alt={p.name} loading="lazy" /> : null}
									</div>
									<div className="body">
										<div className="name">{p.name}</div>
										<div className="time">{p.noteTime.slice(0, 10)}</div>
									</div>
								</Link>
							))}
						</div>
					</div>
				</section>
			) : null}
		</>
	);
}
