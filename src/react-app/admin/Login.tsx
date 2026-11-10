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
			<div className="admin-login-card">
				<h1>管理后台登录</h1>
				<label>用户名</label>
				<input
					value={username}
					onChange={(e) => setUsername(e.target.value)}
					autoFocus
					autoComplete="username"
					placeholder="请输入用户名"
				/>
				<label>密码</label>
				<input
					type="password"
					value={password}
					onChange={(e) => setPassword(e.target.value)}
					onKeyDown={(e) => e.key === "Enter" && submit()}
					autoComplete="current-password"
					placeholder="请输入密码"
				/>
				{err ? <div className="admin-err">{err}</div> : null}
				<button className="admin-login-btn" disabled={busy} onClick={submit}>
					{busy ? "登录中…" : "登 录"}
				</button>
			</div>
		</div>
	);
}
