// 后台入口：登录页（AdminLogin）+ 登录守卫布局（默认导出 AdminApp）
// 注意：子路由（news/products/…）在 App.tsx 里以 children 声明，这里通过 <Outlet/> 渲染——
// react-router 7 下 splat 路由内嵌套 <Routes> 不渲染（曾导致 /admin 白屏），必须用扁平结构。
import { useEffect, useState } from "react";
import { Navigate, Outlet, useNavigate } from "react-router-dom";
import AdminLayout, { type AdminCtx } from "./AdminLayout";
import Login from "./Login";
import { adminApi, type AdminUser } from "./api";

// 会话检查（登录页与守卫共用）
function useMe() {
	const [user, setUser] = useState<AdminUser | null>(null);
	const [checking, setChecking] = useState(true);
	useEffect(() => {
		adminApi
			.me()
			.then((d) => setUser(d.user))
			.catch(() => setUser(null))
			.finally(() => setChecking(false));
	}, []);
	return { user, setUser, checking };
}

/** /admin/login：未登录显示表单；已登录直接进后台 */
export function AdminLogin() {
	const { user, checking } = useMe();
	const navigate = useNavigate();
	if (checking) return <div className="admin-loading">加载中…</div>;
	if (user) return <Navigate to="/admin/news" replace />;
	return <Login onLogin={() => navigate("/admin/news")} />;
}

/** /admin/*：登录守卫 + 后台布局，子路由来自 App.tsx */
export default function AdminApp() {
	const { user, setUser, checking } = useMe();
	const navigate = useNavigate();

	const onLogout = async () => {
		try {
			await adminApi.logout();
		} catch {
			/* 忽略退出时的网络错误 */
		}
		setUser(null);
		navigate("/admin/login");
	};

	if (checking) return <div className="admin-loading">加载中…</div>;
	if (!user) return <Navigate to="/admin/login" replace />;

	const ctx: AdminCtx = { user, onLogout };
	return (
		<AdminLayout user={user} onLogout={onLogout}>
			{/* Outlet context 供子页面（如 UserAdmin）用 useOutletContext 读取 */}
			<Outlet context={ctx} />
		</AdminLayout>
	);
}
