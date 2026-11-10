// 产品列表：左侧分类树 + 右侧产品网格 + 分页
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, imgUrl, type Paged, type ProductItem, type ProTypeItem } from "../api";
import Pager from "../components/Pager";

const PAGE_SIZE = 12;

export default function Products() {
	const [params, setParams] = useSearchParams();
	const typeId = params.get("typeId") ? Number(params.get("typeId")) : 0;
	const page = Math.max(Number(params.get("page") ?? 1), 1);
	const [tree, setTree] = useState<ProTypeItem[]>([]);
	const [data, setData] = useState<Paged<ProductItem> | null>(null);

	useEffect(() => {
		api.productTypes().then((d) => setTree(d.tree)).catch(() => {});
	}, []);

	useEffect(() => {
		api.products(typeId || undefined, page, PAGE_SIZE).then(setData).catch(() => setData(null));
	}, [typeId, page]);

	const setParam = (patch: Record<string, string | null>) => {
		const next = new URLSearchParams(params);
		for (const [k, v] of Object.entries(patch)) {
			if (v === null || v === "") next.delete(k);
			else next.set(k, v);
		}
		if (Object.keys(patch).length && patch.page === undefined) next.delete("page");
		setParams(next);
	};

	const active = typeId ? tree.flatMap((t) => [t, ...(t.children ?? [])]).find((t) => t.id === typeId) : null;

	return (
		<>
			<div className="page-hero">
				<div className="container">
					<h1>产品中心</h1>
					<div className="breadcrumb">
						<Link to="/">首页</Link> / 产品中心{active ? ` / ${active.name}` : ""}
					</div>
				</div>
			</div>

			<section className="section">
				<div className="container list-layout">
					<aside className="cat-tree">
						<span className={`cat-item ${typeId === 0 ? "on" : ""}`} onClick={() => setParam({ typeId: null })}>
							全部产品
						</span>
						{tree.map((t) => (
							<div key={t.id}>
								<span className={`cat-item ${typeId === t.id ? "on" : ""}`} onClick={() => setParam({ typeId: String(t.id) })}>
									{t.name}
								</span>
								{(t.children ?? []).map((c) => (
									<span
										key={c.id}
										className={`cat-item cat-sub ${typeId === c.id ? "on" : ""}`}
										onClick={() => setParam({ typeId: String(c.id) })}
									>
										{c.name}
									</span>
								))}
							</div>
						))}
					</aside>

					<div>
						{data?.items.length ? (
							<div className="product-grid">
								{data.items.map((p) => (
									<Link className="product-card" to={`/products/${p.id}`} key={p.id}>
										<div className="pic">
											{p.smallPic ? <img src={imgUrl(p.smallPic)} alt={p.name} loading="lazy" /> : null}
										</div>
										<div className="body">
											<div className="name">{p.name}</div>
											<div className="time">{p.noteTime.slice(0, 10)}</div>
										</div>
									</Link>
								))}
							</div>
						) : (
							<div className="empty">暂无产品</div>
						)}
						<Pager
							page={page}
							pageSize={PAGE_SIZE}
							total={data?.total ?? 0}
							onChange={(p) => setParam({ page: p === 1 ? null : String(p) })}
						/>
					</div>
				</div>
			</section>
		</>
	);
}
