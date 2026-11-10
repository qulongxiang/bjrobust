// 后台入口：登录守卫 + 模块路由
import { useEffect, useState } from "react";
import { Navigate, Outlet, Route, Routes, useNavigate } from "react-router-dom";
import AdminLayout, { type AdminCtx } from "./AdminLayout";
import Login from "./Login";
import { adminApi, type AdminUser } from "./api";
import NewsAdmin from "./pages/NewsAdmin";
import ProductAdmin from "./pages/ProductAdmin";
import FeedbackAdmin from "./pages/FeedbackAdmin";
import SiteAdmin from "./pages/SiteAdmin";
import UploadAdmin from "./pages/UploadAdmin";
import UserAdmin from "./pages/UserAdmin";

function Gate({
	user,
	onLogout,
}: {
	user: AdminUser;
	onLogout: () => void;
}) {
	const ctx: AdminCtx = { user, onLogout };
	return (
		<AdminLayout>
			<Outlet context={ctx} />
		</AdminLayout>
	);
}

export default function AdminApp() {
	const [user, setUser] = useState<AdminUser | null>(null);
	const [checking, setChecking] = useState(true);
	const navigate = useNavigate();

	useEffect(() => {
		adminApi
			.me()
			.then((d) => setUser(d.user))
			.catch(() => setUser(null))
			.finally(() => setChecking(false));
	}, []);

	const onLogout = async () => {
		try {
			await adminApi.logout();
		} catch {
			/* 忽略退出时的网络错误 */
		}
		setUser(null);
		navigate("/admin/login");
	};

	if (checking) return <div className="admin-loading">加载中…</div>;

	return (
		<Routes>
			<Route
				path="/admin/login"
				element={
					user ? (
						<Navigate to="/admin/news" replace />
					) : (
						<Login
							onLogin={(u) => {
								setUser(u);
								navigate("/admin/news");
							}}
						/>
					)
				}
			/>
			<Route path="/admin" element={user ? <Gate user={user} onLogout={onLogout} /> : <Navigate to="/admin/login" replace />}>
				<Route index element={<Navigate to="/admin/news" replace />} />
				<Route path="news" element={<NewsAdmin />} />
				<Route path="products" element={<ProductAdmin />} />
				<Route path="feedback" element={<FeedbackAdmin />} />
				<Route path="site" element={<SiteAdmin />} />
				<Route path="upload" element={<UploadAdmin />} />
				<Route path="users" element={<UserAdmin />} />
			</Route>
		</Routes>
	);
}
