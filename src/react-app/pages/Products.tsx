// 产品列表：左侧分类树 + 右侧产品网格 + 分页；支持快速查找产品（编号/标准/关键词）
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, imgUrl, type Paged, type ProductItem, type ProTypeItem } from "../api";
import Pager from "../components/Pager";
import PageHero from "../components/PageHero";

const PAGE_SIZE = 12;

export default function Products() {
	const [params, setParams] = useSearchParams();
	const typeId = params.get("typeId") ? Number(params.get("typeId")) : 0;
	const page = Math.max(Number(params.get("page") ?? 1), 1);
	const bh = params.get("bh") ?? "";
	const bz = params.get("bz") ?? "";
	const kw = params.get("kw") ?? "";
	const searching = Boolean(bh || bz || kw);
	const [tree, setTree] = useState<ProTypeItem[]>([]);
	const [data, setData] = useState<Paged<ProductItem> | null>(null);

	useEffect(() => {
		api.productTypes().then((d) => setTree(d.tree)).catch(() => {});
	}, []);

	useEffect(() => {
		api
			.products(typeId || undefined, page, PAGE_SIZE, { bh, bz, kw })
			.then(setData)
			.catch(() => setData(null));
	}, [typeId, page, bh, bz, kw]);

	const setParam = (patch: Record<string, string | null>) => {
		const next = new URLSearchParams(params);
		for (const [k, v] of Object.entries(patch)) {
			if (v === null || v === "") next.delete(k);
			else next.set(k, v);
		}
		if (Object.keys(patch).length && patch.page === undefined) next.delete("page");
		setParams(next);
	};

	const clearSearch = () => setParam({ bh: null, bz: null, kw: null, typeId: null });

	const active = typeId ? tree.flatMap((t) => [t, ...(t.children ?? [])]).find((t) => t.id === typeId) : null;

	return (
		<>
			<PageHero
				banner="cn-banner/banner2.jpg"
				title="产品中心"
				crumb={
					<>
						<Link to="/">首页</Link> / 产品中心{active ? ` / ${active.name}` : ""}
					</>
				}
			/>

			<section className="section">
				<div className="container list-layout">
					{!searching ? (
						<aside className="cat-tree">
							<span className={`cat-item ${typeId === 0 ? "on" : ""}`} onClick={() => setParam({ typeId: null })}>
								全部产品
							</span>
							{tree.map((t) => (
								<div key={t.id}>
									<span
										className={`cat-item ${typeId === t.id ? "on" : ""}`}
										onClick={() => setParam({ typeId: String(t.id) })}
									>
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
					) : null}

					<div>
						{searching ? (
							<div className="home-search" style={{ marginBottom: 16, borderRadius: 8 }}>
								<div className="container home-search-inner">
									<span className="home-search-label">快速查找产品-</span>
									<div className="search-bar">
										<input placeholder="编号" defaultValue={bh} onChange={(e) => setParam({ bh: e.target.value })} />
										<input placeholder="标准" defaultValue={bz} onChange={(e) => setParam({ bz: e.target.value })} />
										<input placeholder="关键词" defaultValue={kw} onChange={(e) => setParam({ kw: e.target.value })} />
										<button className="btn-search" onClick={() => setParam({ page: null })}>
											搜索
										</button>
										<a className="search-clear" href="/products" onClick={() => clearSearch()}>
											清除搜索
										</a>
										{data ? <span className="search-result-note">共 {data.total} 条结果</span> : null}
									</div>
								</div>
							</div>
						) : null}

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
							<div className="empty">{searching ? "未找到匹配的产品" : "暂无产品"}</div>
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
