// 应用路由：前台页面 + 后台管理（/admin）
// 后台用标准扁平路由结构：守卫组件作父路由 element，子页以 children 声明、<Outlet/> 渲染
// （react-router 7 下 splat 路由内嵌套 <Routes> 不渲染，不能那样写）
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import ScrollToTop from "./components/ScrollToTop";
import AdminApp, { AdminLogin } from "./admin/AdminApp";
import StatsAdmin from "./admin/pages/StatsAdmin";
import NewsAdmin from "./admin/pages/NewsAdmin";
import ProductAdmin from "./admin/pages/ProductAdmin";
import ProductForm from "./admin/pages/ProductForm";
import ProductsTypes from "./admin/pages/ProductsTypes";
import FeedbackAdmin from "./admin/pages/FeedbackAdmin";
import SiteAdmin from "./admin/pages/SiteAdmin";
import UploadAdmin from "./admin/pages/UploadAdmin";
import UserAdmin from "./admin/pages/UserAdmin";
import PlatformAdmin from "./admin/pages/PlatformAdmin";
import Home from "./pages/Home";
import Products from "./pages/Products";
import ProductDetail from "./pages/ProductDetail";
import News from "./pages/News";
import NewsDetail from "./pages/NewsDetail";
import Cases from "./pages/Cases";
import CaseDetail from "./pages/CaseDetail";
import About from "./pages/About";
import Contact from "./pages/Contact";
import "./styles.css";

export default function App() {
	return (
		<BrowserRouter>
			<ScrollToTop />
			<Routes>
				{/* 后台：独立布局，不用前台 Layout */}
				<Route path="/admin/login" element={<AdminLogin />} />
				<Route path="/admin" element={<AdminApp />}>
					<Route index element={<Navigate to="/admin/stats" replace />} />
					<Route path="stats" element={<StatsAdmin />} />
					<Route path="news" element={<NewsAdmin />} />
					<Route path="products" element={<Outlet />}>
						<Route index element={<Navigate to="/admin/products/list" replace />} />
						<Route path="list" element={<ProductAdmin />} />
						<Route path="add" element={<ProductForm />} />
						<Route path="edit/:id" element={<ProductForm />} />
						<Route path="types" element={<ProductsTypes />} />
					</Route>
					<Route path="feedback" element={<FeedbackAdmin />} />
					<Route path="site" element={<SiteAdmin />} />
					<Route path="upload" element={<UploadAdmin />} />
					<Route path="users" element={<UserAdmin />} />
					{/* 平台管理（超管）：多站点建站/域名绑定/启停；站点管理员进入会被后端 403 */}
					<Route path="platform" element={<PlatformAdmin />} />
					<Route path="*" element={<Navigate to="/admin/news" replace />} />
				</Route>
				{/* 前台页面 */}
				<Route element={<Layout />}>
					<Route path="/" element={<Home />} />
					<Route path="/products" element={<Products />} />
					<Route path="/products/:id" element={<ProductDetail />} />
					<Route path="/news" element={<News />} />
					<Route path="/news/:id" element={<NewsDetail />} />
					<Route path="/cases" element={<Cases />} />
					<Route path="/cases/:id" element={<CaseDetail />} />
					<Route path="/about" element={<About />} />
					<Route path="/contact" element={<Contact />} />
				</Route>
			</Routes>
		</BrowserRouter>
	);
}
