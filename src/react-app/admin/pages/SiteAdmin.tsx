// 站点设置（t_global）+ 静态页（t_content）编辑
import { useEffect, useState } from "react";
import { adminApi, type ContentPage, type GlobalSettings } from "../api";

export default function SiteAdmin() {
	const [global, setGlobal] = useState<GlobalSettings>(null);
	const [pages, setPages] = useState<ContentPage[]>([]);
	const [editing, setEditing] = useState<ContentPage | null>(null);
	const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
	const [busy, setBusy] = useState(false);

	const flash = (ok: boolean, text: string) => {
		setMsg({ ok, text });
		setTimeout(() => setMsg(null), 3000);
	};

	useEffect(() => {
		adminApi
			.global()
			.then((d) => setGlobal(d.global))
			.catch((e) => flash(false, e instanceof Error ? e.message : "加载失败"));
		adminApi
			.content()
			.then((d) => setPages(d.items))
			.catch(() => {});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const saveGlobal = async () => {
		if (!global) return;
		setBusy(true);
		try {
			await adminApi.saveGlobal(global);
			flash(true, "站点设置已保存");
		} catch (e) {
			flash(false, e instanceof Error ? e.message : "保存失败");
		} finally {
			setBusy(false);
		}
	};

	const savePage = async () => {
		if (!editing) return;
		setBusy(true);
		try {
			await adminApi.saveContent(editing.called, editing.content);
			flash(true, `「${editing.called}」已保存`);
			setEditing(null);
			const d = await adminApi.content();
			setPages(d.items);
		} catch (e) {
			flash(false, e instanceof Error ? e.message : "保存失败");
		} finally {
			setBusy(false);
		}
	};

	if (!global) return <div className="empty-tip">加载中…</div>;

	return (
		<div>
			<div className="admin-page-head">
				<h2>站点设置</h2>
			</div>

			{msg ? <div className={`admin-msg ${msg.ok ? "ok" : "err"}`}>{msg.text}</div> : null}

			<div className="admin-panel">
				<h3 style={{ marginTop: 0 }}>全局信息（t_global）</h3>
				<div className="admin-row">
					<div className="admin-field">
						<label>网站名称（首页 Logo 文字）</label>
						<input
							value={global.webname}
							onChange={(e) => setGlobal({ ...global, webname: e.target.value })}
						/>
					</div>
					<div className="admin-field">
						<label>备案信息（页脚显示）</label>
						<input value={global.beian} onChange={(e) => setGlobal({ ...global, beian: e.target.value })} />
					</div>
				</div>
				<div className="admin-row">
					<div className="admin-field">
						<label>SEO 标题</label>
						<input value={global.title} onChange={(e) => setGlobal({ ...global, title: e.target.value })} />
					</div>
					<div className="admin-field">
						<label>SEO 关键词</label>
						<input value={global.keywords} onChange={(e) => setGlobal({ ...global, keywords: e.target.value })} />
					</div>
				</div>
				<div className="admin-field">
					<label>SEO 描述</label>
					<input
						value={global.description}
						onChange={(e) => setGlobal({ ...global, description: e.target.value })}
					/>
				</div>
				<button className="btn primary" disabled={busy} onClick={saveGlobal}>
					{busy ? "保存中…" : "保存站点设置"}
				</button>
			</div>

			<div className="admin-panel">
				<h3 style={{ marginTop: 0 }}>静态页内容（t_content，按页面键维护）</h3>
				<table className="admin-table">
					<thead>
						<tr>
							<th>页面键</th>
							<th>更新时间</th>
							<th>摘要</th>
							<th>操作</th>
						</tr>
					</thead>
					<tbody>
						{pages.map((p) => (
							<tr key={p.id}>
								<td>{p.called}</td>
								<td className="muted">{p.noteTime}</td>
								<td className="cell-title muted" title={p.content}>
									{p.content.replace(/<[^>]+>/g, "").slice(0, 60)}
								</td>
								<td>
									<button className="btn small" onClick={() => setEditing({ ...p })}>
										编辑
									</button>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>

			{editing ? (
				<div className="modal-mask" onClick={() => !busy && setEditing(null)}>
					<div className="modal" onClick={(e) => e.stopPropagation()}>
						<h3>编辑：{editing.called}</h3>
						<div className="admin-field">
							<label>内容（HTML）</label>
							<textarea
								value={editing.content}
								onChange={(e) => setEditing({ ...editing, content: e.target.value })}
								style={{ minHeight: 260 }}
							/>
						</div>
						<div className="modal-foot">
							<button className="btn" disabled={busy} onClick={() => setEditing(null)}>
								取消
							</button>
							<button className="btn primary" disabled={busy} onClick={savePage}>
								{busy ? "保存中…" : "保存"}
							</button>
						</div>
					</div>
				</div>
			) : null}
		</div>
	);
}
