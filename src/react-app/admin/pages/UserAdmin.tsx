// 用户管理（t_admin）：列表 + 重置密码 + 启用/停用
import { useEffect, useState } from "react";
import { adminApi, type AdminUserRow } from "../api";
import { useOutletContext } from "react-router-dom";
import type { AdminCtx } from "../AdminLayout";

export default function UserAdmin() {
	const { user } = useOutletContext<AdminCtx>();
	const [items, setItems] = useState<AdminUserRow[]>([]);
	const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
	const [pwdFor, setPwdFor] = useState<AdminUserRow | null>(null);
	const [pwd, setPwd] = useState("");
	const [busy, setBusy] = useState(false);

	const flash = (ok: boolean, text: string) => {
		setMsg({ ok, text });
		setTimeout(() => setMsg(null), 3000);
	};

	useEffect(() => {
		adminApi
			.users()
			.then((d) => setItems(d.items))
			.catch((e) => flash(false, e instanceof Error ? e.message : "加载失败"));
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const isSuper = user.UserRole === "0" || user.UserRoleCalled === "admin";

	const resetPwd = async () => {
		if (!pwdFor || pwd.length < 6) {
			flash(false, "密码至少 6 位");
			return;
		}
		setBusy(true);
		try {
			await adminApi.resetPassword(pwdFor.id, pwd);
			flash(true, `已重置 ${pwdFor.userName} 的密码`);
			setPwdFor(null);
			setPwd("");
		} catch (e) {
			flash(false, e instanceof Error ? e.message : "重置失败");
		} finally {
			setBusy(false);
		}
	};

	const toggleLock = async (u: AdminUserRow) => {
		try {
			await adminApi.setUserLock(u.id, u.isLock ? 0 : 1);
			const d = await adminApi.users();
			setItems(d.items);
			flash(true, "已更新");
		} catch (e) {
			flash(false, e instanceof Error ? e.message : "操作失败");
		}
	};

	return (
		<div>
			<div className="admin-page-head">
				<h2>用户管理</h2>
			</div>

			{msg ? <div className={`admin-msg ${msg.ok ? "ok" : "err"}`}>{msg.text}</div> : null}

			<table className="admin-table">
				<thead>
					<tr>
						<th>ID</th>
						<th>用户名</th>
						<th>姓名</th>
						<th>角色</th>
						<th>最后登录</th>
						<th>状态</th>
						<th>操作</th>
					</tr>
				</thead>
				<tbody>
					{items.map((u) => (
						<tr key={u.id}>
							<td className="muted">{u.id}</td>
							<td>{u.userName}</td>
							<td>{u.called || "—"}</td>
							<td className="muted">{u.userRoleCalled || u.userRole}</td>
							<td className="muted">{u.loginTime || "—"}</td>
							<td>
								<span className={`badge ${u.isLock ? "off" : "on"}`}>{u.isLock ? "已锁定" : "正常"}</span>
							</td>
							<td style={{ whiteSpace: "nowrap" }}>
								<button className="btn small" onClick={() => setPwdFor(u)}>
									重置密码
								</button>{" "}
								{isSuper && u.id !== user.id ? (
									<button className="btn small danger" onClick={() => toggleLock(u)}>
										{u.isLock ? "解锁" : "锁定"}
									</button>
								) : null}
							</td>
						</tr>
					))}
				</tbody>
			</table>

			{pwdFor ? (
				<div className="modal-mask" onClick={() => !busy && setPwdFor(null)}>
					<div className="modal" style={{ width: 420 }} onClick={(e) => e.stopPropagation()}>
						<h3>重置密码：{pwdFor.userName}</h3>
						<div className="admin-field">
							<label>新密码（至少 6 位）</label>
							<input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} autoFocus />
						</div>
						<div className="modal-foot">
							<button className="btn" disabled={busy} onClick={() => setPwdFor(null)}>
								取消
							</button>
							<button className="btn primary" disabled={busy} onClick={resetPwd}>
								{busy ? "提交中…" : "确认重置"}
							</button>
						</div>
					</div>
				</div>
			) : null}
		</div>
	);
}
