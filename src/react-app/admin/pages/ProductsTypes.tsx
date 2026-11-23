// 产品分类管理（t_protype，两级树）：列表 + 添加 + 重命名/改排序 + 删除
// 删除有服务端保护：下有子分类或仍有产品的分类不能删除
import { useCallback, useEffect, useState } from "react";
import { adminApi, type ProType } from "../api";

export default function ProductsTypes() {
	const [items, setItems] = useState<ProType[]>([]);
	const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
	const [newName, setNewName] = useState("");
	const [newPid, setNewPid] = useState(0);
	const [newOrder, setNewOrder] = useState(0);
	const [editId, setEditId] = useState(0);
	const [editName, setEditName] = useState("");
	const [editOrder, setEditOrder] = useState(0);
	const [busy, setBusy] = useState(false);

	const flash = (ok: boolean, text: string) => {
		setMsg({ ok, text });
		setTimeout(() => setMsg(null), 3000);
	};

	const load = useCallback(async () => {
		try {
			const d = await adminApi.productTypes();
			setItems(d.items);
		} catch (e) {
			flash(false, e instanceof Error ? e.message : "加载失败");
		}
	}, []);

	useEffect(() => {
		load();
	}, [load]);

	const nameOf = (id: number) => items.find((t) => t.id === id)?.name ?? "";
	const hasChildren = (id: number) => items.some((t) => t.pid === id);

	const add = async () => {
		if (!newName.trim()) return;
		setBusy(true);
		try {
			await adminApi.addProductType({ name: newName.trim(), pid: newPid, order: newOrder });
			setNewName("");
			setNewPid(0);
			setNewOrder(0);
			flash(true, "分类已添加");
			await load();
		} catch (e) {
			flash(false, e instanceof Error ? e.message : "添加失败");
		} finally {
			setBusy(false);
		}
	};

	const startEdit = (t: ProType) => {
		setEditId(t.id);
		setEditName(t.name);
		setEditOrder(t.order);
	};

	const saveEdit = async () => {
		if (!editId || !editName.trim()) return;
		setBusy(true);
		try {
			await adminApi.updateProductType(editId, { name: editName.trim(), order: editOrder });
			setEditId(0);
			flash(true, "已保存");
			await load();
		} catch (e) {
			flash(false, e instanceof Error ? e.message : "保存失败");
		} finally {
			setBusy(false);
		}
	};

	const remove = async (id: number) => {
		if (!confirm("确定删除该分类？")) return;
		try {
			await adminApi.delProductType(id);
			flash(true, "已删除");
			await load();
		} catch (e) {
			flash(false, e instanceof Error ? e.message : "删除失败");
		}
	};

	// 分类排序是升序（OrderBy 小在前），与产品列表相反；之前文案写成"大在前"，误导
	const toggleShow = async (t: ProType) => {
		setBusy(true);
		try {
			await adminApi.updateProductType(t.id, { isShow: t.isShow ? 0 : 1 });
			flash(true, t.isShow ? `「${t.name}」已隐藏` : `「${t.name}」已显示`);
			await load();
		} catch (e) {
			flash(false, e instanceof Error ? e.message : "切换失败");
		} finally {
			setBusy(false);
		}
	};

	return (
		<div>
			<div className="admin-page-head">
				<h2>产品分类</h2>
			</div>

			{msg ? <div className={`admin-msg ${msg.ok ? "ok" : "err"}`}>{msg.text}</div> : null}

			<div className="admin-panel" style={{ marginBottom: 14 }}>
				<div className="admin-row">
					<div className="admin-field">
						<label>分类名</label>
						<input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="如：土工类 SOIL" />
					</div>
					<div className="admin-field">
						<label>上级分类</label>
						<select value={newPid} onChange={(e) => setNewPid(Number(e.target.value))}>
							<option value={0}>顶级分类</option>
							{items.map((t) => (
								<option key={t.id} value={t.id}>
									{t.pid ? `${nameOf(t.pid)} / ` : ""}
									{t.name}
								</option>
							))}
						</select>
					</div>
					<div className="admin-field" style={{ flex: "0 0 130px", minWidth: 120 }}>
						<label>排序（小在前）</label>
						<input type="number" value={newOrder} onChange={(e) => setNewOrder(Number(e.target.value) || 0)} />
					</div>
					<div className="admin-field" style={{ flex: "0 0 auto", minWidth: 0, alignSelf: "flex-end" }}>
						<button className="btn primary" disabled={busy || !newName.trim()} onClick={add}>
							+ 添加分类
						</button>
					</div>
				</div>
			</div>

			{items.length ? (
				<table className="admin-table">
					<thead>
						<tr>
							<th>ID</th>
							<th>名称</th>
							<th>上级分类</th>
							<th>排序</th>
							<th>状态</th>
							<th>操作</th>
						</tr>
					</thead>
					<tbody>
						{items.map((t) => (
							<tr key={t.id}>
								<td className="muted">{t.id}</td>
								<td>
									{editId === t.id ? (
										<input value={editName} onChange={(e) => setEditName(e.target.value)} style={{ width: 200 }} />
									) : (
										<span style={{ paddingLeft: t.pid ? 22 : 0, fontWeight: t.pid ? 400 : 600 }}>{t.name}</span>
									)}
								</td>
								<td className="muted">{t.pid ? nameOf(t.pid) : "—"}</td>
								<td>
									{editId === t.id ? (
										<input
											type="number"
											value={editOrder}
											onChange={(e) => setEditOrder(Number(e.target.value) || 0)}
											style={{ width: 80 }}
										/>
									) : (
										<span className="muted">{t.order}</span>
									)}
								</td>
								<td>
									<button
										className={`badge ${t.isShow ? "on" : "off"}`}
										style={{ border: 0, cursor: "pointer" }}
										disabled={busy}
										title={t.isShow ? "点击隐藏该分类" : "点击显示该分类"}
										onClick={() => toggleShow(t)}
									>
										{t.isShow ? "显示" : "隐藏"}
									</button>
								</td>
								<td>
									{editId === t.id ? (
										<>
											<button className="btn small" disabled={busy} onClick={saveEdit}>
												保存
											</button>{" "}
											<button className="btn small" onClick={() => setEditId(0)}>
												取消
											</button>
										</>
									) : (
										<>
											<button className="btn small" onClick={() => startEdit(t)}>
												编辑
											</button>{" "}
											<button
												className="btn small danger"
												disabled={hasChildren(t.id)}
												title={hasChildren(t.id) ? "该分类下有子分类，不能删除" : ""}
												onClick={() => remove(t.id)}
											>
												删除
											</button>
										</>
									)}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			) : (
				<div className="empty-tip">暂无分类</div>
			)}
		</div>
	);
}
