// 后台布局：侧边栏导航（支持二级菜单）+ 主区域
// 注意：user/onLogout 必须走 props——本组件在 <Outlet> 之外，
// 这里调 useOutletContext() 会返回 null，解构直接抛错导致整个后台白屏（子页面在 Outlet 内部可正常使用）
import { NavLink, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import type { AdminUser } from "./api";
import "./admin.css";

type MenuChild = { to: string; label: string };
type MenuItem = { to: string; label: string; children?: MenuChild[] };

const MENUS: MenuItem[] = [
	{ to: "/admin/stats", label: "数据统计" },
	{ to: "/admin/news", label: "新闻/案例" },
	{
		to: "/admin/products",
		label: "产品管理",
		children: [
			{ to: "/admin/products/list", label: "产品列表" },
			{ to: "/admin/products/types", label: "产品分类" },
		],
	},
	{ to: "/admin/feedback", label: "留言管理" },
	{ to: "/admin/site", label: "站点设置" },
	{ to: "/admin/upload", label: "图片库" },
	{ to: "/admin/users", label: "用户管理" },
];

export type AdminCtx = {
	user: AdminUser;
	onLogout: () => void;
};

export default function AdminLayout({
	user,
	onLogout,
	children,
}: {
	user: AdminUser;
	onLogout: () => void;
	children: ReactNode;
}) {
	const location = useLocation();
	return (
		<div className="admin-layout">
			<aside className="admin-side">
				<div className="admin-brand">
					<span className="admin-brand-dot" />
					管理后台
				</div>
				<nav className="admin-nav">
					{MENUS.map((m) =>
						m.children ? (
							<div key={m.to} className="admin-menu-group">
								<NavLink to={m.to} className={`group-label${location.pathname.startsWith(m.to) ? " on" : ""}`}>
									{m.label}
								</NavLink>
								{m.children.map((ch) => (
									<NavLink key={ch.to} to={ch.to} className={({ isActive }) => `admin-sub${isActive ? " on" : ""}`}>
										{ch.label}
									</NavLink>
								))}
							</div>
						) : (
							<NavLink key={m.to} to={m.to} className={({ isActive }) => (isActive ? "on" : "")}>
								{m.label}
							</NavLink>
						),
					)}
					<NavLink to="/" className="admin-back">
						← 返回前台
					</NavLink>
				</nav>
				<div className="admin-side-foot">
					<div className="admin-user" title={user.UserName}>
						{user.UserRoleCalled || user.UserName}
					</div>
					<button className="admin-logout" onClick={onLogout}>
						退出登录
					</button>
				</div>
			</aside>
			<main className="admin-main">{children}</main>
		</div>
	);
}
