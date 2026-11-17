// 路由（路径）变化时自动回滚到页面顶部——SPA 切菜单不重置滚动的修复
import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export default function ScrollToTop() {
	const { pathname } = useLocation();
	useEffect(() => {
		window.scrollTo(0, 0);
	}, [pathname]);
	return null;
}
