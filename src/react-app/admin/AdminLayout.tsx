// 后台布局：侧边栏导航（支持二级菜单）+ 站点切换 + 主区域
// 注意：user/onLogout 必须走 props——本组件在 <Outlet> 之外，
// 这里调 useOutletContext() 会返回 null，解构直接抛错导致整个后台白屏（子页面在 Outlet 内部可正常使用）
import { NavLink, useLocation } from "react-router-dom";
import { useEffect, useState, type ReactNode } from "react";
import type { AdminUser, SiteSummary, SiteTheme } from "./api";
import "./admin.css";

type MenuChild = { to: string; label: string };
type MenuItem = { to: string; label: string; children?: MenuChild[]; superOnly?: boolean };

const MENUS: MenuItem[] = [
	{ to: "/admin/stats", label: "数据统计" },
	{ to: "/admin/news", label: "新闻/案例" },
	{
		to: "/admin/products",
		label: "产品管理",
		children: [
			{ to: "/admin/products/list", label: "产品列表" },
			{ to: "/admin/products/add", label: "产品添加" },
			{ to: "/admin/products/types", label: "产品分类" },
		],
	},
	{ to: "/admin/feedback", label: "留言管理" },
	{ to: "/admin/site", label: "站点设置" },
	{ to: "/admin/upload", label: "图片库" },
	{ to: "/admin/users", label: "用户管理" },
	{ to: "/admin/platform", label: "平台管理", superOnly: true },
];

// 折叠状态持久化：刷新/切页后仍保持用户的收起习惯
const OPEN_KEY = "bjrobust:admin-menu-open";

function readOpen(): Record<string, boolean> {
	try {
		const raw = localStorage.getItem(OPEN_KEY);
		const v = raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
		return v && typeof v === "object" ? v : {};
	} catch {
		return {};
	}
}

function hitChild(m: MenuItem, pathname: string): boolean {
	return Boolean(m.children?.some((ch) => pathname === ch.to || pathname.startsWith(`${ch.to}/`)));
}

export type AdminCtx = {
	user: AdminUser;
	onLogout: () => void;
	/** 超管可选的站点列表（站点管理员为空） */
	sites: SiteSummary[];
	/** 当前生效站点的 code */
	siteCode: string;
};

export default function AdminLayout({
	user,
	site,
	sites,
	onSwitchSite,
	onLogout,
	children,
}: {
	user: AdminUser;
	site?: { code: string; name: string; companyName: string; theme: SiteTheme };
	sites?: SiteSummary[];
	onSwitchSite?: (code: string) => void;
	onLogout: () => void;
	children: ReactNode;
}) {
	const location = useLocation();
	const visible = MENUS.filter((m) => !m.superOnly || user.isSuper);

	// 分组默认展开；进到某个分组的子页面时自动展开该分组（用户手动收起后仍尊重收起状态）
	const [open, setOpen] = useState<Record<string, boolean>>(() => {
		const initial = readOpen();
		for (const m of MENUS) if (m.children && hitChild(m, location.pathname)) initial[m.to] = true;
		return initial;
	});

	useEffect(() => {
		const active = MENUS.filter((m) => m.children && hitChild(m, location.pathname)).map((m) => m.to);
		if (!active.length) return;
		setOpen((prev) => {
			if (active.every((to) => prev[to])) return prev;
			const next = { ...prev };
			for (const to of active) next[to] = true;
			localStorage.setItem(OPEN_KEY, JSON.stringify(next));
			return next;
		});
	}, [location.pathname]);

	const toggle = (to: string) => {
		setOpen((prev) => {
			const next = { ...prev, [to]: !(prev[to] ?? false) };
			// 只存显式收起的分组，未记录的默认展开
			localStorage.setItem(OPEN_KEY, JSON.stringify(next));
			return next;
		});
	};

	return (
		<div className="admin-layout">
			<aside className="admin-side">
				<div className="admin-brand">
					<span className="admin-brand-dot" />
					管理后台
				</div>
				{user.isSuper && sites && sites.length > 1 && onSwitchSite ? (
					<div className="admin-site-switch">
						<label>当前站点</label>
						<select value={site?.code ?? ""} onChange={(e) => onSwitchSite(e.target.value)}>
							{sites.map((s) => (
								<option key={s.code} value={s.code}>
									{s.name}（{s.code}）
								</option>
							))}
						</select>
					</div>
				) : site ? (
					<div className="admin-site-badge" title="当前站点">
						{site.companyName || site.name}
					</div>
				) : null}
				<nav className="admin-nav">
					{visible.map((m) => {
						if (!m.children) {
							return (
								<NavLink key={m.to} to={m.to} className={({ isActive }) => (isActive ? "on" : "")}>
									{m.label}
								</NavLink>
							);
						}
						const active = hitChild(m, location.pathname);
						const expanded = open[m.to] ?? true;
						return (
							<div key={m.to} className={`admin-menu-group${active ? " active" : ""}`}>
								<button
									type="button"
									className={`group-parent${active ? " has-active" : ""}`}
									aria-expanded={expanded}
									title={expanded ? "收起子菜单" : "展开子菜单"}
									onClick={() => toggle(m.to)}
								>
									<span className="group-label">{m.label}</span>
									<span className={`group-caret${expanded ? " open" : ""}`}>▾</span>
								</button>
								{expanded ? (
									<div className="admin-sub-wrap">
										{m.children.map((ch) => (
											<NavLink key={ch.to} to={ch.to} className={({ isActive }) => `admin-sub${isActive ? " on" : ""}`}>
												{ch.label}
											</NavLink>
										))}
									</div>
								) : null}
							</div>
						);
					})}
					<NavLink to="/" className="admin-back">
						← 返回前台
					</NavLink>
				</nav>
				<div className="admin-side-foot">
					<div className="admin-user" title={user.UserName}>
						{user.UserRoleCalled || user.UserName}
						{user.isSuper ? " · 超管" : ""}
					</div>
					<button className="admin-logout" onClick={onLogout}>
						退出登录
					</button>
					<div className="admin-ver" title="前端版本（强刷后核对是否为此版本号）">
						v{__APP_VERSION__}
					</div>
				</div>
			</aside>
			<main className="admin-main">{children}</main>
		</div>
	);
}
