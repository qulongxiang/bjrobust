// 新闻/案例管理（t_news）：分类 tabs + 列表 + 新增/编辑弹框 + 删除
import { useCallback, useEffect, useState } from "react";
import { adminApi, type AdminNews } from "../api";

type NewsTypeOpt = { id: number; name: string };

const EMPTY: AdminNews = {
	id: 0,
	title: "",
	noteTime: "",
	content: "",
	userName: "",
	isShow: 1,
	isCommend: 0,
	order: 0,
	newType: 3,
	hits: 0,
	smallPic: "",
	webTitle: "",
	webKey: "",
	webDesc: "",
	link: "",
	down: "",
	memo: "",
};

export default function NewsAdmin() {
	const [types, setTypes] = useState<NewsTypeOpt[]>([]);
	const [type, setType] = useState(0);
	const [page, setPage] = useState(1);
	const [total, setTotal] = useState(0);
	const [items, setItems] = useState<AdminNews[]>([]);
	const [editing, setEditing] = useState<AdminNews | null>(null);
	const [newTypeName, setNewTypeName] = useState("");
	const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
	const [busy, setBusy] = useState(false);

	const load = useCallback(async () => {
		try {
			const d = await adminApi.news(type || undefined, page);
			setTotal(d.total);
			setItems(d.items);
		} catch (e) {
			setMsg({ ok: false, text: e instanceof Error ? e.message : "加载失败" });
		}
	}, [type, page]);

	useEffect(() => {
		adminApi
			.newsTypes()
			.then((d) => setTypes(d.items))
			.catch(() => {});
	}, []);

	useEffect(() => {
		load();
	}, [load]);

	const flash = (ok: boolean, text: string) => {
		setMsg({ ok, text });
		setTimeout(() => setMsg(null), 3000);
	};

	const remove = async (id: number) => {
		if (!confirm("确定删除这条内容？")) return;
		try {
			await adminApi.delNews(id);
			flash(true, "已删除");
			await load();
		} catch (e) {
			flash(false, e instanceof Error ? e.message : "删除失败");
		}
	};

	const toggleShow = async (n: AdminNews) => {
		try {
			await adminApi.updateNews(n.id, { isShow: n.isShow ? 0 : 1 });
			await load();
		} catch (e) {
			flash(false, e instanceof Error ? e.message : "操作失败");
		}
	};

	const addType = async () => {
		if (!newTypeName.trim()) return;
		try {
			await adminApi.addNewsType(newTypeName.trim());
			setNewTypeName("");
			const d = await adminApi.newsTypes();
			setTypes(d.items);
			flash(true, "分类已添加");
		} catch (e) {
			flash(false, e instanceof Error ? e.message : "添加失败");
		}
	};

	const save = async () => {
		if (!editing) return;
		setBusy(true);
		try {
			if (editing.id) {
				await adminApi.updateNews(editing.id, editing);
				flash(true, "已保存");
			} else {
				await adminApi.addNews(editing);
				flash(true, "已添加");
			}
			setEditing(null);
			await load();
		} catch (e) {
			flash(false, e instanceof Error ? e.message : "保存失败");
		} finally {
			setBusy(false);
		}
	};

	const pages = Math.max(Math.ceil(total / 20), 1);

	return (
		<div>
			<div className="admin-page-head">
				<h2>新闻/案例管理</h2>
				<button className="btn primary" onClick={() => setEditing({ ...EMPTY, newType: type || 3 })}>
					+ 新增
				</button>
			</div>

			{msg ? <div className={`admin-msg ${msg.ok ? "ok" : "err"}`}>{msg.text}</div> : null}

			<div className="admin-tabs">
				<button className={type === 0 ? "on" : ""} onClick={() => { setType(0); setPage(1); }}>
					全部
				</button>
				{types.map((t) => (
					<button
						key={t.id}
						className={type === t.id ? "on" : ""}
						onClick={() => {
							setType(t.id);
							setPage(1);
						}}
					>
						{t.name}
					</button>
				))}
			</div>

			<div className="admin-row" style={{ marginBottom: 14 }}>
				<input
					value={newTypeName}
					onChange={(e) => setNewTypeName(e.target.value)}
					placeholder="新分类名"
					style={{ maxWidth: 200, padding: "7px 12px", border: "1px solid #e0e5ee", borderRadius: 8 }}
				/>
				<button className="btn small" onClick={addType}>
					添加分类
				</button>
			</div>

			{items.length ? (
				<table className="admin-table">
					<thead>
						<tr>
							<th>ID</th>
							<th>标题</th>
							<th>分类</th>
							<th>时间</th>
							<th>排序</th>
							<th>状态</th>
							<th>浏览</th>
							<th>操作</th>
						</tr>
					</thead>
					<tbody>
						{items.map((n) => (
							<tr key={n.id}>
								<td className="muted">{n.id}</td>
								<td className="cell-title" title={n.title}>
									{n.title}
								</td>
								<td className="muted">{types.find((t) => t.id === n.newType)?.name ?? n.newType}</td>
								<td className="muted">{n.noteTime.slice(0, 10)}</td>
								<td className="muted">{n.order}</td>
								<td>
									<span className={`badge ${n.isShow ? "on" : "off"}`}>{n.isShow ? "显示" : "隐藏"}</span>
								</td>
								<td className="muted">{n.hits}</td>
								<td style={{ whiteSpace: "nowrap" }}>
									<button className="btn small" onClick={() => setEditing({ ...n })}>
										编辑
									</button>{" "}
									<button className="btn small" onClick={() => toggleShow(n)}>
										{n.isShow ? "隐藏" : "显示"}
									</button>{" "}
									<button className="btn small danger" onClick={() => remove(n.id)}>
										删除
									</button>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			) : (
				<div className="empty-tip">暂无内容</div>
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
						<h3>{editing.id ? `编辑 #${editing.id}` : "新增内容"}</h3>
						<div className="admin-field">
							<label>标题</label>
							<input
								value={editing.title}
								onChange={(e) => setEditing({ ...editing, title: e.target.value })}
								maxLength={255}
							/>
						</div>
						<div className="admin-row">
							<div className="admin-field">
								<label>分类</label>
								<select
									value={editing.newType}
									onChange={(e) => setEditing({ ...editing, newType: Number(e.target.value) })}
								>
									{types.map((t) => (
										<option key={t.id} value={t.id}>
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
						</div>
						<div className="admin-field">
							<label>缩略图（/assets 路径，如 /upload/xx.jpg）</label>
							<input
								value={editing.smallPic}
								onChange={(e) => setEditing({ ...editing, smallPic: e.target.value })}
								placeholder="/upload/xxx.jpg"
							/>
						</div>
						<div className="admin-row">
							<div className="admin-field">
								<label>SEO 标题</label>
								<input
									value={editing.webTitle}
									onChange={(e) => setEditing({ ...editing, webTitle: e.target.value })}
								/>
							</div>
							<div className="admin-field">
								<label>SEO 关键词</label>
								<input
									value={editing.webKey}
									onChange={(e) => setEditing({ ...editing, webKey: e.target.value })}
								/>
							</div>
						</div>
						<div className="admin-field">
							<label>SEO 描述</label>
							<input
								value={editing.webDesc}
								onChange={(e) => setEditing({ ...editing, webDesc: e.target.value })}
							/>
						</div>
						<div className="admin-field">
							<label>正文（HTML）</label>
							<textarea
								value={editing.content}
								onChange={(e) => setEditing({ ...editing, content: e.target.value })}
								style={{ minHeight: 200 }}
							/>
						</div>
						<div className="modal-foot">
							<button className="btn" disabled={busy} onClick={() => setEditing(null)}>
								取消
							</button>
							<button className="btn primary" disabled={busy} onClick={save}>
								{busy ? "保存中…" : "保存"}
							</button>
						</div>
					</div>
				</div>
			) : null}
		</div>
	);
}
