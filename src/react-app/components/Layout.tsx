// 公共布局：顶部导航 + 页脚
// 多站点：品牌信息（公司名/热线/邮箱/Logo/主题色）全部来自 /api/site/site-info，
// 不同域名访问同一套前端，只换品牌与配色。
import { useEffect, useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { api, assetUrl, type GlobalInfo, type SiteMeta, type SiteTheme } from "../api";
import { safeHtml } from "../lib/html";
import { applySiteSeo, setBrand } from "../lib/seo";

const NAV = [
	{ to: "/", label: "首页", end: true },
	{ to: "/products", label: "产品中心" },
	{ to: "/news", label: "新闻资讯" },
	{ to: "/cases", label: "成功案例" },
	{ to: "/about", label: "公司概况" },
	{ to: "/contact", label: "联系我们" },
];

/** 把站点主题色写进 CSS 变量（styles.css 里所有主色都引用这三个变量） */
function applyTheme(theme?: SiteTheme) {
	if (!theme) return;
	const root = document.documentElement;
	if (theme.primary) root.style.setProperty("--primary", theme.primary);
	if (theme.primaryDark) root.style.setProperty("--primary-dark", theme.primaryDark);
	if (theme.accent) root.style.setProperty("--accent-strong", theme.accent);
}

export default function Layout() {
	const [g, setG] = useState<GlobalInfo>(null);
	const [site, setSite] = useState<SiteMeta | null>(null);
	const [fragments, setFragments] = useState<Record<string, string>>({});

	useEffect(() => {
		api
			.site()
			.then((d) => {
				setSite(d.site);
				applyTheme(d.site.theme);
				setBrand(d.site.name || d.site.companyName || "");
				// index.html 里的标题/关键词/描述是写死的 bjrobust 文案，多站点必须按本站覆盖
				applySiteSeo({
					title: `${d.site.name || "官网"} - ${d.site.companyName || ""}`.replace(/ - $/, ""),
					description: `${d.site.companyName || d.site.name} 官方网站`,
				});
			})
			.catch(() => {});
		api
			.global()
			.then((d) => {
				setG(d.global);
				setFragments(d.fragments);
				// 站点默认值先铺底；页面级 applySeo 会锁定并覆盖，避免详情页标题被这里顶回站点名
				applySiteSeo({
					title: d.global?.title || undefined,
					keywords: d.global?.keywords || undefined,
					description: d.global?.description || undefined,
				});
			})
			.catch(() => {});
	}, []);

	const brandName = g?.webname && g.webname !== "网站名称" ? g.webname : site?.companyName || g?.title || "";
	const companyName = site?.companyName || g?.title || "";

	return (
		<div className="layout">
			{/* 顶栏：公司名欢迎语 + 全国服务热线/邮箱（按站点取，空则不显示） */}
			<div className="top-bar">
				<div className="container top-bar-inner">
					<span className="top-bar-welcome">
						{companyName ? `欢迎进入${companyName}官网！` : "欢迎访问本站！"}
					</span>
					<span className="top-bar-hotline">
						{site?.hotline ? (
							<span>
								全国服务热线：<b>{site.hotline}</b>
							</span>
						) : null}
						{site?.email ? (
							<span className="top-bar-mail">
								全国服务邮箱：<b>{site.email}</b>
							</span>
						) : null}
					</span>
				</div>
			</div>
			<header className="site-header">
				<div className="container header-inner">
					<Link to="/" className="logo">
						<span className="logo-dot" />
						{brandName || "本站"}
					</Link>
					<nav className="main-nav">
						{NAV.map((n) => (
							<NavLink
								key={n.to}
								to={n.to}
								end={(n as { end?: boolean }).end}
								className={({ isActive }) => (isActive ? "active" : "")}
							>
								{n.label}
							</NavLink>
						))}
					</nav>
				</div>
			</header>

			<main className="site-main">
				<Outlet />
			</main>

			{/* 页脚：三栏（Logo+版权 / 联系方式 / 二维码），内容来自各站点的 t_content 片段 */}
			<footer className="site-footer">
				<div className="container footer-inner">
					<div className="footer-col footer-left">
						{site?.logoUrl ? (
							<img className="footer-logo" src={assetUrl(site.logoUrl)} alt={companyName} />
						) : null}
						<div className="footer-copy" dangerouslySetInnerHTML={{ __html: safeHtml(fragments["底部版权"]) }} />
					</div>
					{fragments["首页联系方式"] ? (
						<div
							className="footer-col footer-contact"
							dangerouslySetInnerHTML={{ __html: safeHtml(fragments["首页联系方式"]) }}
						/>
					) : null}
					{fragments["二维码"] ? (
						<div className="footer-col footer-qr" dangerouslySetInnerHTML={{ __html: safeHtml(fragments["二维码"]) }} />
					) : null}
				</div>
			</footer>
		</div>
	);
}
