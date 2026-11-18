// 产品列表：搜索条常驻（还原旧站 products.php 顶部搜索框）+ 左侧分类树 + 产品网格 + 分页
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
	// 搜索框本地状态：输入不打扰，点"搜索"/回车才真正查询（与旧站表单行为一致）
	const [form, setForm] = useState({ bh, bz, kw });

	useEffect(() => {
		api.productTypes().then((d) => setTree(d.tree)).catch(() => {});
	}, []);

	useEffect(() => {
		setForm({ bh, bz, kw });
	}, [bh, bz, kw]);

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

	const doSearch = () => {
		setParam({
			bh: form.bh.trim() || null,
			bz: form.bz.trim() || null,
			kw: form.kw.trim() || null,
		});
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
				<div className="container">
					{/* 快速查找产品（还原旧站：产品列表页顶部常驻搜索框） */}
					<div className="search-strip">
						<span className="home-search-label">快速查找产品-</span>
						<div className="search-bar">
							<input
								placeholder="编号"
								value={form.bh}
								onChange={(e) => setForm({ ...form, bh: e.target.value })}
								onKeyDown={(e) => e.key === "Enter" && doSearch()}
							/>
							<input
								placeholder="标准"
								value={form.bz}
								onChange={(e) => setForm({ ...form, bz: e.target.value })}
								onKeyDown={(e) => e.key === "Enter" && doSearch()}
							/>
							<input
								placeholder="关键词"
								value={form.kw}
								onChange={(e) => setForm({ ...form, kw: e.target.value })}
								onKeyDown={(e) => e.key === "Enter" && doSearch()}
							/>
							<button className="btn-search" onClick={doSearch}>
								搜索
							</button>
							{searching ? (
								<>
									<a
										className="search-clear"
										href="/products"
										onClick={(e) => {
											e.preventDefault();
											clearSearch();
										}}
									>
										清除搜索
									</a>
									{data ? <span className="search-result-note">共 {data.total} 条结果</span> : null}
								</>
							) : null}
						</div>
					</div>

					<div className="list-layout">
						{!searching ? (
							<aside className="cat-tree">
								<span
									className={`cat-item ${typeId === 0 ? "on" : ""}`}
									onClick={() => setParam({ typeId: null })}
								>
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
							{data?.items.length ? (
								<div className="product-grid">
									{data.items.map((p) => (
										<Link className="product-card" to={`/products/${p.id}`} key={p.id}>
											<div className="pic">
												{p.smallPic ? (
													<img src={imgUrl(p.smallPic)} alt={p.name} loading="lazy" />
												) : null}
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
				</div>
			</section>
		</>
	);
}
