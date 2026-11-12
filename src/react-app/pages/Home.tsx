// 首页：纯图 banner 轮播 + 各栏目带图（还原旧 PHP 站排版）
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
		const t = setInterval(() => setSlide((s) => (s + 1) % d.banners.length), 6000);
		return () => clearInterval(t);
	}, [d]);

	if (!d) return <div className="empty">加载中…</div>;

	return (
		<>
			{/* banner：纯图轮播（无文字压图），6 秒自动切换 */}
			<div className="hero">
				{d.banners.map((b, i) => (
					<img
						key={b.id}
						src={imgUrl(b.pic)}
						alt={b.title}
						className={`hero-img ${i === slide ? "on" : ""}`}
					/>
				))}
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

			{/* 主体：左产品中心 / 右各栏目（还原旧站两栏） */}
			<div className="container home-center">
				<section className="home-main">
					<div className="side-title">
						<span>产品中心</span>
						<Link className="mores" to="/products">MORE+</Link>
					</div>
					<div className="home-pro-grid">
						{d.products.map((p) => (
							<Link className="home-pro" to={`/products/${p.id}`} key={p.id}>
								<div className="pic">
									{p.pic ? <img src={imgUrl(p.pic)} alt={p.name} loading="lazy" /> : null}
								</div>
								<div className="name">{p.name}</div>
							</Link>
						))}
						{!d.products.length ? <div className="empty">暂无产品</div> : null}
					</div>
				</section>

				<aside className="home-side">
					{d.about ? (
						<section className="home-block">
							<div className="side-title">
								<span>公司概况</span>
								<Link className="mores" to="/about">MORE+</Link>
							</div>
							<div className="about-brief" dangerouslySetInnerHTML={{ __html: d.about }} />
						</section>
					) : null}

					{d.cases.length ? (
						<section className="home-block">
							<div className="side-title">
								<span>成功案例</span>
								<Link className="mores" to="/cases">MORE+</Link>
							</div>
							<div className="case-grid">
								{d.cases.slice(0, 4).map((c) => (
									<Link to={`/cases/${c.id}`} key={c.id} className="case-item">
										<img src={imgUrl(c.pic)} alt={c.title} loading="lazy" />
										<div className="name">{c.title}</div>
									</Link>
								))}
							</div>
						</section>
					) : null}

					{d.news.length ? (
						<section className="home-block">
							<div className="side-title">
								<span>新闻活动</span>
								<Link className="mores" to="/news">MORE+</Link>
							</div>
							<ul className="news-brief">
								{d.news.slice(0, 5).map((n) => (
									<li key={n.id}>
										<span className="dot" />
										<Link to={`/news/${n.id}`}>{n.title}</Link>
										<span className="date">{n.noteTime.slice(0, 10)}</span>
									</li>
								))}
							</ul>
						</section>
					) : null}

					{d.brands.length ? (
						<section className="home-block">
							<div className="side-title">
								<span>代理品牌</span>
								<Link className="mores" to="/news?type=6">MORE+</Link>
							</div>
							<div className="brand-grid">
								{d.brands.map((b) => (
									<a
										key={b.id}
										href={b.link || "#"}
										target="_blank"
										rel="noreferrer"
										className="brand-item"
										title={b.title}
									>
										<img src={imgUrl(b.pic)} alt={b.title} loading="lazy" />
									</a>
								))}
							</div>
						</section>
					) : null}

					{d.partners.length ? (
						<section className="home-block">
							<div className="side-title">
								<span>合作伙伴</span>
								<Link className="mores" to="/news?type=7">MORE+</Link>
							</div>
							<div className="partner-grid">
								{d.partners.slice(0, 9).map((p) => (
									<a
										key={p.id}
										href={p.link || "#"}
										target="_blank"
										rel="noreferrer"
										className="partner-item"
										title={p.title}
									>
										<img src={imgUrl(p.pic)} alt={p.title} loading="lazy" />
									</a>
								))}
							</div>
						</section>
					) : null}
				</aside>
			</div>
		</>
	);
}
