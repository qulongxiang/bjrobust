// 用户管理（t_admin）：列表 + 重置密码 + 启用/停用
import { useEffect, useState } from "react";
import { adminApi, type AdminUserRow } from "../api";
import { useOutletContext } from "react-router-dom";
import type { AdminCtx } from "../AdminLayout";

export default function UserAdmin() {
	const { user, siteCode } = useOutletContext<AdminCtx>();
	const [items, setItems] = useState<AdminUserRow[]>([]);
	const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
	const [pwdFor, setPwdFor] = useState<AdminUserRow | null>(null);
	const [pwd, setPwd] = useState("");
	const [busy, setBusy] = useState(false);
	const [adding, setAdding] = useState(false);
	const [aUser, setAUser] = useState("");
	const [aPwd, setAPwd] = useState("");
	const [aCalled, setACalled] = useState("");
	// 超管可选把账号挂到哪个站点（0 = 平台级超管）
	const [aSiteId, setASiteId] = useState(0);

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

	const isSuper = user.isSuper ?? user.siteId === 0;

	/** 可选站点（超管从平台概览拿 id；站点管理员只有本站） */
	const [siteOpts, setSiteOpts] = useState<{ id: number; code: string; name: string }[]>([]);
	useEffect(() => {
		if (!isSuper) {
			if (user.siteId) setSiteOpts([{ id: user.siteId, code: siteCode, name: `本站（${siteCode}）` }]);
			return;
		}
		adminApi
			.platformBanners()
			.then((d) => setSiteOpts(d.sites.map((s) => ({ id: s.id, code: s.code, name: s.name }))))
			.catch(() => {});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isSuper, user.siteId, siteCode]);

	const siteLabel = (siteId: number) => {
		if (siteId === 0) return "平台级（超管）";
		const s = siteOpts.find((x) => x.id === siteId);
		return s ? `${s.name}（${s.code}）` : `站点 #${siteId}`;
	};

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

	const addUser = async () => {
		if (!aUser.trim()) {
			flash(false, "用户名不能为空");
			return;
		}
		if (aPwd.length < 6) {
			flash(false, "密码至少 6 位");
			return;
		}
		setBusy(true);
		try {
			await adminApi.addUser({
				username: aUser.trim(),
				password: aPwd,
				called: aCalled.trim(),
				...(isSuper ? { siteId: aSiteId } : {}),
			});
			flash(true, "管理员已添加");
			setAdding(false);
			setAUser("");
			setAPwd("");
			setACalled("");
			const d = await adminApi.users();
			setItems(d.items);
		} catch (e) {
			flash(false, e instanceof Error ? e.message : "添加失败");
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
				<button className="btn primary" onClick={() => setAdding(true)}>
					+ 添加管理员
				</button>
			</div>

			<p className="muted" style={{ marginTop: -4, marginBottom: 14 }}>
				{isSuper
					? "你是平台超管：可以给每个站点各配一个管理员（挂到对应站点后，对方登录只能看到并维护自己站点的内容），也可以建平台级账号。"
					: "你是本站管理员：只能看到并维护本站账号，无法操作其它站点。"}
			</p>

			{msg ? <div className={`admin-msg ${msg.ok ? "ok" : "err"}`}>{msg.text}</div> : null}

			<table className="admin-table">
				<thead>
					<tr>
						<th>ID</th>
						<th>用户名</th>
						<th>姓名</th>
						<th>所属站点</th>
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
							<td className="muted">{siteLabel(u.siteId)}</td>
							<td className="muted">{u.userRoleCalled || u.userRole}</td>
							<td className="muted">{u.loginTime || "—"}</td>
							<td>
								<span className={`badge ${u.isLock ? "off" : "on"}`}>{u.isLock ? "已锁定" : "正常"}</span>
							</td>
							<td style={{ whiteSpace: "nowrap" }}>
								<button className="btn small" onClick={() => setPwdFor(u)}>
									重置密码
								</button>{" "}
								{u.id !== user.id ? (
									<button className="btn small danger" onClick={() => toggleLock(u)}>
										{u.isLock ? "解锁" : "锁定"}
									</button>
								) : null}							</td>
						</tr>
					))}
				</tbody>
			</table>

			{adding ? (
			 <div className="modal-mask" onClick={() => !busy && setAdding(false)}>
			  <div className="modal" style={{ width: 460 }} onClick={(e) => e.stopPropagation()}>
			   <h3>添加管理员</h3>
			   <div className="admin-field">
			    <label>用户名</label>
			    <input value={aUser} onChange={(e) => setAUser(e.target.value)} autoFocus placeholder="登录用户名" />
			   </div>
			   <div className="admin-field">
			    <label>姓名（显示用，可留空）</label>
			    <input value={aCalled} onChange={(e) => setACalled(e.target.value)} placeholder="如：张三" />
			   </div>
			   <div className="admin-field">
			    <label>密码（至少 6 位）</label>
			    <input type="password" value={aPwd} onChange={(e) => setAPwd(e.target.value)} />
			   </div>
			   {isSuper ? (
			    <div className="admin-field">
			     <label>所属站点（决定这个账号能维护哪一家）</label>
			     <select value={aSiteId} onChange={(e) => setASiteId(Number(e.target.value))}>
			      <option value={0}>平台级（超管，可管理所有站点）</option>
			      {siteOpts.map((s) => (
			       <option key={s.id} value={s.id}>
			        {s.name}（{s.code}）
			       </option>
			      ))}
			     </select>
			     <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
			      挂到某个站点后，该账号登录只能看到并维护该站点的内容、设置和账号，看不到别的站点。
			     </div>
			    </div>
			   ) : (
			    <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>
			     该账号将属于本站：{siteCode}
			    </div>
			   )}
			   <div className="modal-foot">
			    <button className="btn" disabled={busy} onClick={() => setAdding(false)}>
			     取消
			    </button>
			    <button className="btn primary" disabled={busy} onClick={addUser}>
			     {busy ? "提交中…" : "确认添加"}
			    </button>
			   </div>
			  </div>
			 </div>
			) : null}

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
