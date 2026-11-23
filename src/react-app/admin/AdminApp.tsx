// 后台入口：登录页（AdminLogin）+ 登录守卫布局（默认导出 AdminApp）
// 注意：子路由（news/products/…）在 App.tsx 里以 children 声明，这里通过 <Outlet/> 渲染——
// react-router 7 下 splat 路由内嵌套 <Routes> 不渲染（曾导致 /admin 白屏），必须用扁平结构。
import { useEffect, useState } from "react";
import { Navigate, Outlet, useNavigate } from "react-router-dom";
import AdminLayout, { type AdminCtx } from "./AdminLayout";
import Login from "./Login";
import { adminApi, setActiveSiteCode, type AdminUser, type SiteSummary, type SiteTheme } from "./api";

type MeState = {
	user: AdminUser;
	site: { code: string; name: string; companyName: string; theme: SiteTheme };
	sites: SiteSummary[];
};

// 会话检查（登录页与守卫共用）
function useMe() {
	const [me, setMe] = useState<MeState | null>(null);
	const [checking, setChecking] = useState(true);
	useEffect(() => {
		adminApi
			.me()
			.then((d) => setMe({ user: d.user, site: d.site, sites: d.sites }))
			.catch(() => setMe(null))
			.finally(() => setChecking(false));
	}, []);
	return { me, setMe, checking };
}

/** /admin/login：未登录显示表单；已登录直接进后台 */
export function AdminLogin() {
	const { me, checking } = useMe();
	const navigate = useNavigate();
	if (checking) return <div className="admin-loading">加载中…</div>;
	if (me) return <Navigate to="/admin/stats" replace />;
	return <Login onLogin={() => navigate("/admin/stats")} />;
}

/** /admin/*：登录守卫 + 后台布局，子路由来自 App.tsx */
export default function AdminApp() {
	const { me, setMe, checking } = useMe();
	const navigate = useNavigate();

	const onLogout = async () => {
		try {
			await adminApi.logout();
		} catch {
			/* 忽略退出时的网络错误 */
		}
		setMe(null);
		navigate("/admin/login");
	};

	// 超管切换站点：写入 localStorage 并刷新页面（各页面数据量不同，直接重载最省事也最不容易残留旧数据）
	const onSwitchSite = (code: string) => {
		setActiveSiteCode(code);
		location.reload();
	};

	if (checking) return <div className="admin-loading">加载中…</div>;
	if (!me) return <Navigate to="/admin/login" replace />;

	const ctx: AdminCtx = {
		user: me.user,
		onLogout,
		sites: me.user.isSuper ? me.sites : [],
		siteCode: me.site?.code ?? "",
	};
	return (
		<AdminLayout
			user={me.user}
			site={me.site}
			sites={me.sites}
			onSwitchSite={onSwitchSite}
			onLogout={onLogout}
		>
			{/* Outlet context 供子页面（如 UserAdmin）用 useOutletContext 读取 */}
			<Outlet context={ctx} />
		</AdminLayout>
	);
}
