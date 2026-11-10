// 后台布局：侧边栏导航 + 主区域
import { NavLink, useOutletContext } from "react-router-dom";
import type { ReactNode } from "react";
import type { AdminUser } from "./api";
import "./admin.css";

const MENUS = [
	{ to: "/admin/news", label: "新闻/案例" },
	{ to: "/admin/products", label: "产品管理" },
	{ to: "/admin/feedback", label: "留言管理" },
	{ to: "/admin/site", label: "站点设置" },
	{ to: "/admin/upload", label: "图片库" },
	{ to: "/admin/users", label: "用户管理" },
];

export type AdminCtx = {
	user: AdminUser;
	onLogout: () => void;
};

export default function AdminLayout({ children }: { children: ReactNode }) {
	const { user, onLogout } = useOutletContext<AdminCtx>();
	return (
		<div className="admin-layout">
			<aside className="admin-side">
				<div className="admin-brand">
					<span className="admin-brand-dot" />
					管理后台
				</div>
				<nav className="admin-nav">
					{MENUS.map((m) => (
						<NavLink key={m.to} to={m.to} className={({ isActive }) => (isActive ? "on" : "")}>
							{m.label}
						</NavLink>
					))}
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
