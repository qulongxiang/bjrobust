// 应用路由：前台页面 + 后台管理（/admin）
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import AdminApp from "./admin/AdminApp";
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
			<Routes>
				<Route path="/admin/*" element={<AdminApp />} />
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
