// 留言管理（t_feedback）：列表 + 删除
import { useCallback, useEffect, useState } from "react";
import { adminApi, type AdminFeedback } from "../api";

export default function FeedbackAdmin() {
	const [page, setPage] = useState(1);
	const [total, setTotal] = useState(0);
	const [items, setItems] = useState<AdminFeedback[]>([]);
	const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

	const load = useCallback(async () => {
		try {
			const d = await adminApi.feedback(page);
			setTotal(d.total);
			setItems(d.items);
		} catch (e) {
			setMsg({ ok: false, text: e instanceof Error ? e.message : "加载失败" });
		}
	}, [page]);

	useEffect(() => {
		load();
	}, [load]);

	const remove = async (id: number) => {
		if (!confirm("确定删除这条留言？")) return;
		try {
			await adminApi.delFeedback(id);
			await load();
		} catch (e) {
			setMsg({ ok: false, text: e instanceof Error ? e.message : "删除失败" });
		}
	};

	const pages = Math.max(Math.ceil(total / 20), 1);

	return (
		<div>
			<div className="admin-page-head">
				<h2>留言管理</h2>
			</div>
			{msg ? <div className={`admin-msg ${msg.ok ? "ok" : "err"}`}>{msg.text}</div> : null}
			{items.length ? (
				<table className="admin-table">
					<thead>
						<tr>
							<th>ID</th>
							<th>姓名</th>
							<th>内容</th>
							<th>时间</th>
							<th>IP</th>
							<th>操作</th>
						</tr>
					</thead>
					<tbody>
						{items.map((f) => (
							<tr key={f.id}>
								<td className="muted">{f.id}</td>
								<td>{f.name}</td>
								<td className="cell-title" title={f.content}>
									{f.content}
								</td>
								<td className="muted">{f.noteTime}</td>
								<td className="muted">{f.ip}</td>
								<td>
									<button className="btn small danger" onClick={() => remove(f.id)}>
										删除
									</button>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			) : (
				<div className="empty-tip">暂无留言</div>
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
		</div>
	);
}
