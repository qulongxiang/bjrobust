// 产品详情：图集 + 内容 + 上一件/下一件
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, imgUrl, type ProductDetailData } from "../api";

export default function ProductDetail() {
	const { id } = useParams();
	const [d, setD] = useState<ProductDetailData | null>(null);
	const [failed, setFailed] = useState(false);
	const [pic, setPic] = useState(0);

	useEffect(() => {
		setD(null);
		setFailed(false);
		setPic(0);
		api
			.product(Number(id))
			.then((data) => {
				setD(data);
				if (data.product.webTitle || data.product.name) {
					document.title = data.product.webTitle || data.product.name;
				}
			})
			.catch(() => setFailed(true));
	}, [id]);

	if (failed) return <div className="empty">产品不存在或已下架</div>;
	if (!d) return <div className="empty">加载中…</div>;

	const p = d.product;
	const pics = d.images.length ? d.images.map((i) => i.big || i.pic) : p.smallPic ? [p.smallPic] : [];

	return (
		<>
			<div className="page-hero">
				<div className="container">
					<h1>产品中心</h1>
					<div className="breadcrumb">
						<Link to="/">首页</Link> / <Link to="/products">产品中心</Link>
						{d.typeName ? <> / {d.typeName}</> : null}
					</div>
				</div>
			</div>

			<section className="section">
				<div className="container detail-wrap">
					<div className="gallery">
						<div className="main-pic">
							{pics.length ? (
								<img src={imgUrl(pics[Math.min(pic, pics.length - 1)])} alt={p.name} />
							) : (
								<span style={{ color: "#9aa4b2" }}>暂无图片</span>
							)}
						</div>
						{pics.length > 1 ? (
							<div className="thumbs">
								{pics.map((u, i) => (
									<button key={i} className={i === pic ? "on" : ""} onClick={() => setPic(i)} aria-label={`图 ${i + 1}`}>
										<img src={imgUrl(u)} alt="" />
									</button>
								))}
							</div>
						) : null}
					</div>

					<div className="detail-body">
						<h1>{p.name}</h1>
						<div className="detail-meta">
							<span>发布时间：{p.noteTime.slice(0, 16)}</span>
							<span>浏览：{p.hits}</span>
						</div>
						<div className="rich" dangerouslySetInnerHTML={{ __html: p.content }} />
						{p.memo ? (
							<div className="rich" style={{ marginTop: 14, color: "#6b7280", fontSize: 14 }}>
								{p.memo}
							</div>
						) : null}
						<div className="prev-next">
							<span>
								上一产品：
								{d.prev ? <Link to={`/products/${d.prev.id}`}>{d.prev.name}</Link> : <em>没有了</em>}
							</span>
							<span>
								下一产品：
								{d.next ? <Link to={`/products/${d.next.id}`}>{d.next.name}</Link> : <em>没有了</em>}
							</span>
						</div>
					</div>
				</div>
			</section>
		</>
	);
}
