// 产品管理（t_products + t_img）：分类筛选 + 列表 + 图集弹框
// 编辑/新增统一走整页表单（/admin/products/add 与 /admin/products/edit/:id 共用 ProductForm），
// 这里不再维护第二套表单；分类的新增/改名/排序/删除全部收敛到「产品分类」页，避免两处入口互相打架。
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import ImageField from "../components/ImageField";
import { adminApi, type AdminProduct, type ProType } from "../api";

const PAGE_SIZE = 20;

export default function ProductAdmin() {
	const [types, setTypes] = useState<ProType[]>([]);
	const [tree, setTree] = useState<ProType[]>([]);
	const [typeId, setTypeId] = useState(0);
	const [page, setPage] = useState(1);
	const [total, setTotal] = useState(0);
	const [items, setItems] = useState<AdminProduct[]>([]);
	const [imgFor, setImgFor] = useState<AdminProduct | null>(null);
	const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
	const nav = useNavigate();

	const flash = (ok: boolean, text: string) => {
		setMsg({ ok, text });
		setTimeout(() => setMsg(null), 3000);
	};

	const loadTypes = useCallback(async () => {
		try {
			const d = await adminApi.productTypes();
			setTypes(d.items);
			setTree(d.tree);
		} catch (e) {
			flash(false, e instanceof Error ? e.message : "加载分类失败");
		}
	}, []);

	const loadList = useCallback(async () => {
		try {
			const d = await adminApi.products(typeId || undefined, page);
			// 删掉最后一页的最后一条后会停在空页，往上退一页
			if (!d.items.length && page > 1 && d.total > 0) {
				setPage((p) => Math.max(p - 1, 1));
				return;
			}
			setTotal(d.total);
			setItems(d.items);
		} catch (e) {
			flash(false, e instanceof Error ? e.message : "加载失败");
		}
	}, [typeId, page]);

	useEffect(() => {
		loadTypes();
	}, [loadTypes]);
	useEffect(() => {
		loadList();
	}, [loadList]);

	const typeOf = (id: number) => types.find((t) => t.id === id)?.name ?? (id ? `#${id}` : "未分类");

	const pickType = (id: number) => {
		setTypeId(id);
		setPage(1);
	};

	const remove = async (id: number) => {
		if (!confirm("确定删除该产品（含其图集）？")) return;
		try {
			await adminApi.delProduct(id);
			flash(true, "已删除");
			await loadList();
		} catch (e) {
			flash(false, e instanceof Error ? e.message : "删除失败");
		}
	};

	const pages = Math.max(Math.ceil(total / PAGE_SIZE), 1);
	const currentType = typeId ? types.find((t) => t.id === typeId) : null;

	return (
		<div>
			<div className="admin-page-head">
				<h2>产品列表</h2>
				<div className="admin-row" style={{ margin: 0 }}>
					<Link className="btn" to="/admin/products/types">
						分类管理
					</Link>
					<button className="btn primary" onClick={() => nav("/admin/products/add")}>
						+ 新增产品
					</button>
				</div>
			</div>

			{msg ? <div className={`admin-msg ${msg.ok ? "ok" : "err"}`}>{msg.text}</div> : null}

			<div className="admin-panel">
				<div className="type-filters">
					<div className="type-row">
						<button className={typeId === 0 ? "on" : ""} onClick={() => pickType(0)}>
							全部产品（{typeId === 0 ? total : "—"}）
						</button>
					</div>
					{tree.map((t) => {
						const children = t.children ?? [];
						const childOn = children.some((c) => c.id === typeId);
						return (
							<div className="type-row" key={t.id}>
								<button
									className={`type-parent${typeId === t.id ? " on" : childOn ? " has-child-on" : ""}`}
									title="选中父分类会包含其下所有子分类的产品"
									onClick={() => pickType(t.id)}
								>
									{t.name}
								</button>
								{children.map((c) => (
									<button key={c.id} className={typeId === c.id ? "on" : ""} onClick={() => pickType(c.id)}>
										{c.name}
									</button>
								))}
							</div>
						);
					})}
				</div>
				{currentType ? (
					<div className="muted" style={{ fontSize: 12, marginTop: -6 }}>
						当前筛选：{currentType.name}
						{currentType.pid ? "（子分类）" : `（含 ${currentType.children?.length ?? 0} 个子分类）`}，共 {total} 件
					</div>
				) : null}
			</div>

			{items.length ? (
				<table className="admin-table">
					<thead>
						<tr>
							<th>ID</th>
							<th>产品名</th>
							<th>分类</th>
							<th>时间</th>
							<th>排序</th>
							<th>推荐</th>
							<th>状态</th>
							<th>操作</th>
						</tr>
					</thead>
					<tbody>
						{items.map((p) => (
							<tr key={p.id}>
								<td className="muted">{p.id}</td>
								<td className="cell-title" title={p.name}>
									{p.name}
								</td>
								<td className="muted">{typeOf(p.typeId)}</td>
								<td className="muted">{p.noteTime.slice(0, 10)}</td>
								<td className="muted">{p.order}</td>
								<td>
									<span className={`badge ${p.isCommend ? "on" : ""}`}>{p.isCommend ? "推荐" : "—"}</span>
								</td>
								<td>
									<span className={`badge ${p.isShow ? "on" : "off"}`}>{p.isShow ? "显示" : "隐藏"}</span>
								</td>
								<td style={{ whiteSpace: "nowrap" }}>
									<button className="btn small" onClick={() => nav(`/admin/products/edit/${p.id}`)}>
										编辑
									</button>{" "}
									<button className="btn small" onClick={() => setImgFor(p)}>
										图集
									</button>{" "}
									<button className="btn small danger" onClick={() => remove(p.id)}>
										删除
									</button>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			) : (
				<div className="empty-tip">暂无产品</div>
			)}

			{pages > 1 ? (
				<div className="pager" style={{ marginTop: 18 }}>
					<button disabled={page <= 1} onClick={() => setPage(page - 1)}>
						上一页
					</button>
					<span className="muted">
						{page} / {pages}（共 {total} 件，每页 {PAGE_SIZE}）
					</span>
					<button disabled={page >= pages} onClick={() => setPage(page + 1)}>
						下一页
					</button>
				</div>
			) : null}

			{imgFor ? <ImageModal product={imgFor} onClose={() => setImgFor(null)} flash={flash} /> : null}
		</div>
	);
}

// ---- 图集管理弹框（t_img）：一律走上传控件，不再手填路径 ----
function ImageModal({
	product,
	onClose,
	flash,
}: {
	product: AdminProduct;
	onClose: () => void;
	flash: (ok: boolean, text: string) => void;
}) {
	const [imgs, setImgs] = useState<{ id: number; name: string; pic: string; big: string; order: number }[]>([]);
	const [pic, setPic] = useState("");
	const [name, setName] = useState("");
	const [busy, setBusy] = useState(false);

	const load = useCallback(async () => {
		try {
			const d = await adminApi.productImages(product.id);
			setImgs(d.items);
		} catch (e) {
			flash(false, e instanceof Error ? e.message : "加载图集失败");
		}
	}, [product.id]);

	useEffect(() => {
		load();
	}, [load]);

	const add = async () => {
		if (!pic.trim()) {
			flash(false, "请先选择图片");
			return;
		}
		setBusy(true);
		try {
			await adminApi.addProductImage(product.id, { pic: pic.trim(), name: name.trim() });
			setPic("");
			setName("");
			flash(true, "图片已添加");
			await load();
		} catch (e) {
			flash(false, e instanceof Error ? e.message : "添加失败");
		} finally {
			setBusy(false);
		}
	};

	const del = async (id: number) => {
		try {
			await adminApi.delProductImage(id);
			await load();
		} catch (e) {
			flash(false, e instanceof Error ? e.message : "删除失败");
		}
	};

	return (
		<div className="modal-mask" onClick={onClose}>
			<div className="modal" onClick={(e) => e.stopPropagation()}>
				<h3>图集：{product.name}（共 {imgs.length} 张）</h3>
				<div className="upload-grid">
					{imgs.map((im) => (
						<div className="upload-item" key={im.id}>
							<img src={`/assets/${im.pic.replace(/^\//, "")}`} alt={im.name} />
							<div className="info" title={`${im.pic}（排序 ${im.order}）`}>
								{im.name || im.pic}
							</div>
							<button className="del" onClick={() => del(im.id)} aria-label="删除图片">
								×
							</button>
						</div>
					))}
					{!imgs.length ? <div className="empty-tip" style={{ gridColumn: "1/-1" }}>暂无图片</div> : null}
				</div>
				<ImageField
					label="新增图片"
					value={pic}
					onChange={setPic}
					ratio="4 / 3"
					hint="选图后上传到本站目录，再填写名称点「添加」"
				/>
				<div className="admin-row">
					<div className="admin-field">
						<label>图片名称（可空）</label>
						<input value={name} onChange={(e) => setName(e.target.value)} placeholder="如图：表面振动压实仪" />
					</div>
					<button className="btn primary" disabled={busy || !pic} onClick={add}>
						{busy ? "添加中…" : "添加"}
					</button>
				</div>
				<div className="modal-foot">
					<button className="btn" onClick={onClose}>
						关闭
					</button>
				</div>
			</div>
		</div>
	);
}
