// 公共布局：顶部导航 + 页脚（站点信息来自 /api/site/global）
import { useEffect, useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { api, type GlobalInfo } from "../api";

const NAV = [
	{ to: "/", label: "首页", end: true },
	{ to: "/products", label: "产品中心" },
	{ to: "/news", label: "新闻资讯" },
	{ to: "/cases", label: "成功案例" },
	{ to: "/about", label: "关于我们" },
	{ to: "/contact", label: "联系我们" },
];

export default function Layout() {
	const [g, setG] = useState<GlobalInfo>(null);
	const [fragments, setFragments] = useState<Record<string, string>>({});

	useEffect(() => {
		api
			.global()
			.then((d) => {
				setG(d.global);
				setFragments(d.fragments);
				if (d.global?.title) document.title = d.global.title;
			})
			.catch(() => {});
	}, []);

	return (
		<div className="layout">
			{/* 顶栏：还原旧站——公司名欢迎语 + 全国服务热线/邮箱 */}
			<div className="top-bar">
				<div className="container top-bar-inner">
					<span className="top-bar-welcome">欢迎进入北京罗巴斯特科技有限公司官网！</span>
					<span className="top-bar-hotline">
						<span>
							全国服务热线：<b>+86 10 61252911 / 15810050111</b>
						</span>
						<span className="top-bar-mail">
							全国服务邮箱：<b>sales@bjrobust.com</b>
						</span>
					</span>
				</div>
			</div>
			<header className="site-header">
				<div className="container header-inner">
					<Link to="/" className="logo">
						<span className="logo-dot" />
						{g?.webname && g.webname !== "网站名称" ? g.webname : g?.title || "北京罗布斯"}
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

			{/* 页脚：还原旧站三栏（底部版权 / 首页联系方式 / 二维码），配色见 index.css */}
			<footer className="site-footer">
				<div className="container footer-inner">
					<div className="footer-col footer-left">
						<div
							className="footer-copy"
							dangerouslySetInnerHTML={{ __html: fragments["底部版权"] || "" }}
						/>
					</div>
					{fragments["首页联系方式"] ? (
						<div
							className="footer-col footer-contact"
							dangerouslySetInnerHTML={{ __html: fragments["首页联系方式"] }}
						/>
					) : null}
					{fragments["二维码"] ? (
						<div
							className="footer-col footer-qr"
							dangerouslySetInnerHTML={{ __html: fragments["二维码"] }}
						/>
					) : null}
				</div>
			</footer>
		</div>
	);
}
