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

			<footer className="site-footer">
				<div className="container">
					<div
						className="footer-copy"
						dangerouslySetInnerHTML={{ __html: fragments["底部版权"] || "" }}
					/>
					{g?.beian ? <div className="footer-beian">{g.beian}</div> : null}
				</div>
			</footer>
		</div>
	);
}
