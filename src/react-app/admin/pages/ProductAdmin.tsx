// 产品管理（t_products + t_protype + t_img）：分类筛选 + 列表 + 编辑弹框 + 图集弹框
import { useCallback, useEffect, useState } from "react";
import { adminApi, type AdminProduct, type ProType } from "../api";

const EMPTY: AdminProduct = {
	id: 0,
	name: "",
	content: "",
	memo: "",
	noteTime: "",
	smallPic: "",
	isShow: 1,
	isCommend: 0,
	order: 0,
	typeId: 0,
	hits: 0,
	webTitle: "",
	webKey: "",
	webDesc: "",
	bh: "",
	bz: "",
};

export default function ProductAdmin() {
	const [types, setTypes] = useState<ProType[]>([]);
	const [tree, setTree] = useState<ProType[]>([]);
	const [typeId, setTypeId] = useState(0);
	const [page, setPage] = useState(1);
	const [total, setTotal] = useState(0);
	const [items, setItems] = useState<AdminProduct[]>([]);
	const [editing, setEditing] = useState<AdminProduct | null>(null);
	const [imgFor, setImgFor] = useState<AdminProduct | null>(null);
	const [newName, setNewName] = useState("");
	const [newPid, setNewPid] = useState(0);
	const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
	const [busy, setBusy] = useState(false);

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

	const saveProduct = async () => {
		if (!editing) return;
		setBusy(true);
		try {
			if (editing.id) {
				await adminApi.updateProduct(editing.id, editing);
				flash(true, "已保存");
			} else {
				await adminApi.addProduct(editing);
				flash(true, "已添加");
			}
			setEditing(null);
			await loadList();
		} catch (e) {
			flash(false, e instanceof Error ? e.message : "保存失败");
		} finally {
			setBusy(false);
		}
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

	const addType = async () => {
		if (!newName.trim()) return;
		try {
			await adminApi.addProductType({ name: newName.trim(), pid: newPid });
			setNewName("");
			setNewPid(0);
			flash(true, "分类已添加");
			await loadTypes();
		} catch (e) {
			flash(false, e instanceof Error ? e.message : "添加失败");
		}
	};

	const delType = async (id: number) => {
		if (!confirm("确定删除该分类？")) return;
		try {
			await adminApi.delProductType(id);
			flash(true, "已删除");
			await loadTypes();
		} catch (e) {
			flash(false, e instanceof Error ? e.message : "删除失败");
		}
	};

	const pages = Math.max(Math.ceil(total / 20), 1);

	return (
		<div>
			<div className="admin-page-head">
				<h2>产品管理</h2>
				<button className="btn primary" onClick={() => setEditing({ ...EMPTY, typeId: typeId || 0 })}>
					+ 新增产品
				</button>
			</div>

			{msg ? <div className={`admin-msg ${msg.ok ? "ok" : "err"}`}>{msg.text}</div> : null}

			<div className="admin-panel">
				<div className="admin-tabs">
					<button className={typeId === 0 ? "on" : ""} onClick={() => { setTypeId(0); setPage(1); }}>
						全部
					</button>
					{tree.map((t) => (
						<span key={t.id} style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
							<button className={typeId === t.id ? "on" : ""} onClick={() => { setTypeId(t.id); setPage(1); }}>
								{t.name}
							</button>
							{(t.children ?? []).map((c) => (
								<button
									key={c.id}
									className={typeId === c.id ? "on" : ""}
									style={{ fontSize: 12 }}
									onClick={() => { setTypeId(c.id); setPage(1); }}
								>
									{c.name}
								</button>
							))}
						</span>
					))}
				</div>
				<div className="admin-row">
					<input
						value={newName}
						onChange={(e) => setNewName(e.target.value)}
						placeholder="新分类名"
						style={{ maxWidth: 180, padding: "7px 12px", border: "1px solid #e0e5ee", borderRadius: 8 }}
					/>
					<select
						value={newPid}
						onChange={(e) => setNewPid(Number(e.target.value))}
						style={{ maxWidth: 160, padding: "7px 12px", border: "1px solid #e0e5ee", borderRadius: 8 }}
					>
						<option value={0}>作为顶级分类</option>
						{tree.map((t) => (
							<option key={t.id} value={t.id}>
								作为 {t.name} 的子分类
							</option>
						))}
					</select>
					<button className="btn small" onClick={addType}>
						添加分类
					</button>
					{typeId ? (
						<button className="btn small danger" onClick={() => delType(typeId)}>
							删除当前分类
						</button>
					) : null}
				</div>
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
									<button className="btn small" onClick={() => setEditing({ ...p })}>
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
						{page} / {pages}
					</span>
					<button disabled={page >= pages} onClick={() => setPage(page + 1)}>
						下一页
					</button>
				</div>
			) : null}

			{editing ? (
				<div className="modal-mask" onClick={() => !busy && setEditing(null)}>
					<div className="modal" onClick={(e) => e.stopPropagation()}>
						<h3>{editing.id ? `编辑 #${editing.id}` : "新增产品"}</h3>
						<div className="admin-field">
							<label>产品名</label>
							<input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} maxLength={200} />
						</div>
						<div className="admin-row">
							<div className="admin-field">
								<label>分类</label>
								<select
									value={editing.typeId}
									onChange={(e) => setEditing({ ...editing, typeId: Number(e.target.value) })}
								>
									<option value={0}>未分类</option>
									{types.map((t) => (
										<option key={t.id} value={t.id}>
											{t.level ? "　" : ""}
											{t.name}
										</option>
									))}
								</select>
							</div>
							<div className="admin-field">
								<label>排序（大靠前）</label>
								<input
									type="number"
									value={editing.order}
									onChange={(e) => setEditing({ ...editing, order: Number(e.target.value) })}
								/>
							</div>
							<div className="admin-field">
								<label>状态</label>
								<select
									value={editing.isShow}
									onChange={(e) => setEditing({ ...editing, isShow: Number(e.target.value) })}
								>
									<option value={1}>显示</option>
									<option value={0}>隐藏</option>
								</select>
							</div>
							<div className="admin-field">
								<label>首页推荐</label>
								<select
									value={editing.isCommend}
									onChange={(e) => setEditing({ ...editing, isCommend: Number(e.target.value) })}
								>
									<option value={0}>否</option>
									<option value={1}>是</option>
								</select>
							</div>
						</div>
						<div className="admin-field">
							<label>缩略图（/assets 路径）</label>
							<input
								value={editing.smallPic}
								onChange={(e) => setEditing({ ...editing, smallPic: e.target.value })}
								placeholder="/upload/xxx.jpg"
							/>
						</div>
						<div className="admin-row">
							<div className="admin-field">
								<label>SEO 标题</label>
								<input value={editing.webTitle} onChange={(e) => setEditing({ ...editing, webTitle: e.target.value })} />
							</div>
							<div className="admin-field">
								<label>SEO 关键词</label>
								<input value={editing.webKey} onChange={(e) => setEditing({ ...editing, webKey: e.target.value })} />
							</div>
						</div>
						<div className="admin-field">
							<label>SEO 描述</label>
							<input value={editing.webDesc} onChange={(e) => setEditing({ ...editing, webDesc: e.target.value })} />
						</div>
						<div className="admin-field">
							<label>正文（HTML）</label>
							<textarea
								value={editing.content}
								onChange={(e) => setEditing({ ...editing, content: e.target.value })}
								style={{ minHeight: 200 }}
							/>
						</div>
						<div className="admin-field">
							<label>备注</label>
							<input value={editing.memo} onChange={(e) => setEditing({ ...editing, memo: e.target.value })} />
						</div>
						<div className="modal-foot">
							<button className="btn" disabled={busy} onClick={() => setEditing(null)}>
								取消
							</button>
							<button className="btn primary" disabled={busy} onClick={saveProduct}>
								{busy ? "保存中…" : "保存"}
							</button>
						</div>
					</div>
				</div>
			) : null}

			{imgFor ? <ImageModal product={imgFor} onClose={() => setImgFor(null)} flash={flash} /> : null}
		</div>
	);
}

// ---- 图集管理弹框（t_img） ----
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
			flash(false, "请填写图片路径");
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
				<h3>图集：{product.name}</h3>
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
				<div className="admin-row" style={{ marginTop: 16 }}>
					<div className="admin-field">
						<label>图片路径（/assets 或 /upload 前缀均可）</label>
						<input value={pic} onChange={(e) => setPic(e.target.value)} placeholder="/upload/xxx.jpg" />
					</div>
					<div className="admin-field">
						<label>名称</label>
						<input value={name} onChange={(e) => setName(e.target.value)} />
					</div>
					<button className="btn primary" disabled={busy} onClick={add}>
						添加
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
