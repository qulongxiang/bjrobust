// 后台登录页
import { useState } from "react";
import { adminApi, type AdminUser } from "./api";

export default function Login({ onLogin }: { onLogin: (u: AdminUser) => void }) {
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");
	const [busy, setBusy] = useState(false);
	const [err, setErr] = useState("");

	const submit = async () => {
		if (!username.trim() || !password || busy) return;
		setBusy(true);
		setErr("");
		try {
			const d = await adminApi.login(username.trim(), password);
			onLogin(d.user);
		} catch (e) {
			setErr(e instanceof Error ? e.message : "登录失败");
		} finally {
			setBusy(false);
		}
	};

	return (
		<div className="admin-login-wrap">
			<form
				className="admin-login-card"
				onSubmit={(e) => {
					// 用真表单包一层：浏览器密码管理器能识别，回车也能提交（之前只有密码框监听 Enter）
					e.preventDefault();
					void submit();
				}}
			>
				<h1>管理后台登录</h1>
				<label htmlFor="admin-user">用户名</label>
				<input
					id="admin-user"
					value={username}
					onChange={(e) => setUsername(e.target.value)}
					autoFocus
					autoComplete="username"
					placeholder="请输入用户名"
				/>
				<label htmlFor="admin-pass">密码</label>
				<input
					id="admin-pass"
					type="password"
					value={password}
					onChange={(e) => setPassword(e.target.value)}
					autoComplete="current-password"
					placeholder="请输入密码"
				/>
				{err ? <div className="admin-err">{err}</div> : null}
				<button className="admin-login-btn" type="submit" disabled={busy}>
					{busy ? "登录中…" : "登 录"}
				</button>
				<p className="admin-login-tip">
					站点管理员账号只能在其所属站点的域名下登录；平台超管账号可在任意域名登录。
				</p>
			</form>
		</div>
	);
}
