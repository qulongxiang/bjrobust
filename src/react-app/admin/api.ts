// 后台 API 客户端（Cookie 会话，同源自动携带）
export class ApiError extends Error {
	status: number;
	constructor(status: number, message: string) {
		super(message);
		this.status = status;
	}
}

export type AdminUser = {
	id: number;
	UserName: string;
	UserRole: string;
	UserRoleCalled: string;
};

export type AdminNews = {
	id: number;
	title: string;
	noteTime: string;
	content: string;
	userName: string;
	isShow: number;
	isCommend: number;
	order: number;
	newType: number;
	hits: number;
	smallPic: string;
	webTitle: string;
	webKey: string;
	webDesc: string;
	link: string;
	down: string;
	memo: string;
};

export type AdminProduct = {
	id: number;
	name: string;
	content: string;
	memo: string;
	noteTime: string;
	smallPic: string;
	isShow: number;
	isCommend: number;
	order: number;
	typeId: number;
	hits: number;
	webTitle: string;
	webKey: string;
	webDesc: string;
	bh: string;
	bz: string;
};

export type AdminFeedback = { id: number; name: string; content: string; noteTime: string; ip: string };

export type AdminUserRow = {
	id: number;
	userName: string;
	called: string;
	userRole: string;
	userRoleCalled: string;
	isLock: number;
	status: number;
	loginTime: string;
	userType: number;
};

export type ProType = {
	id: number;
	name: string;
	pic: string;
	order: number;
	isShow: number;
	memo: string;
	pid: number;
	level: number;
	children?: ProType[];
};

export type GlobalSettings = {
	id: number;
	webname: string;
	title: string;
	keywords: string;
	description: string;
	beian: string;
	web: string;
} | null;

export type ContentPage = { id: number; called: string; content: string; noteTime: string };

export type UploadFile = { key: string; size: number; updated: string; url: string };

export type Paged<T> = { total: number; page: number; pageSize: number; items: T[] };

async function req<T>(url: string, init?: RequestInit): Promise<T> {
	const res = await fetch(url, {
		credentials: "same-origin",
		...init,
		headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
	});
	if (res.status === 401 && !url.includes("/api/admin/login") && !location.pathname.startsWith("/admin/login")) {
		location.href = "/admin/login";
		throw new ApiError(401, "会话已过期");
	}
	const data = (await res.json().catch(() => ({}))) as T & { error?: string };
	if (!res.ok) throw new ApiError(res.status, data.error ?? `HTTP ${res.status}`);
	return data;
}

const j = (body: unknown) => JSON.stringify(body);

export const adminApi = {
	me: () => req<{ ok: boolean; user: AdminUser }>("/api/admin/me"),
	login: (username: string, password: string) =>
		req<{ ok: boolean; user: AdminUser }>("/api/admin/login", { method: "POST", body: j({ username, password }) }),
	logout: () => req<{ ok: boolean }>("/api/admin/logout", { method: "POST" }),

	newsTypes: () => req<{ ok: boolean; items: { id: number; name: string }[] }>("/api/admin/news-types"),
	news: (type?: number, page = 1) =>
		req<Paged<AdminNews>>(`/api/admin/news${type ? `?type=${type}` : ""}&page=${page}&pageSize=20`),
	addNews: (b: Partial<AdminNews>) => req<{ ok: boolean; id: number }>("/api/admin/news", { method: "POST", body: j(b) }),
	updateNews: (id: number, b: Partial<AdminNews>) => req<{ ok: boolean }>(`/api/admin/news/${id}`, { method: "PUT", body: j(b) }),
	delNews: (id: number) => req<{ ok: boolean }>(`/api/admin/news/${id}`, { method: "DELETE" }),

	addNewsType: (name: string) => req<{ ok: boolean; id: number }>("/api/admin/news-types", { method: "POST", body: j({ name }) }),
	delNewsType: (id: number) => req<{ ok: boolean }>(`/api/admin/news-types/${id}`, { method: "DELETE" }),

	products: (typeId?: number, page = 1) =>
		req<Paged<AdminProduct>>(`/api/admin/products${typeId ? `?typeId=${typeId}` : ""}&page=${page}&pageSize=20`),
	addProduct: (b: Partial<AdminProduct>) =>
		req<{ ok: boolean; id: number }>("/api/admin/products", { method: "POST", body: j(b) }),
	updateProduct: (id: number, b: Partial<AdminProduct>) =>
		req<{ ok: boolean }>(`/api/admin/products/${id}`, { method: "PUT", body: j(b) }),
	delProduct: (id: number) => req<{ ok: boolean }>(`/api/admin/products/${id}`, { method: "DELETE" }),

	productImages: (id: number) =>
		req<{ ok: boolean; items: { id: number; name: string; pic: string; big: string; order: number; isShow: number }[] }>(
			`/api/admin/products/${id}/images`,
		),
	addProductImage: (id: number, b: { name?: string; pic: string; big?: string; order?: number }) =>
		req<{ ok: boolean; id: number }>(`/api/admin/products/${id}/images`, { method: "POST", body: j(b) }),
	delProductImage: (id: number) => req<{ ok: boolean }>(`/api/admin/images/${id}`, { method: "DELETE" }),

	productTypes: () => req<{ ok: boolean; items: ProType[]; tree: ProType[] }>("/api/admin/product-types"),
	addProductType: (b: { name: string; pid?: number; order?: number; memo?: string }) =>
		req<{ ok: boolean; id: number }>("/api/admin/product-types", { method: "POST", body: j(b) }),
	updateProductType: (id: number, b: Partial<ProType>) =>
		req<{ ok: boolean }>(`/api/admin/product-types/${id}`, { method: "PUT", body: j(b) }),
	delProductType: (id: number) => req<{ ok: boolean }>(`/api/admin/product-types/${id}`, { method: "DELETE" }),

	feedback: (page = 1) => req<Paged<AdminFeedback>>(`/api/admin/feedback?page=${page}&pageSize=20`),
	delFeedback: (id: number) => req<{ ok: boolean }>(`/api/admin/feedback/${id}`, { method: "DELETE" }),

	global: () => req<{ ok: boolean; global: GlobalSettings }>("/api/admin/global"),
	saveGlobal: (b: Partial<GlobalSettings>) => req<{ ok: boolean }>("/api/admin/global", { method: "PUT", body: j(b) }),

	content: () => req<{ ok: boolean; items: ContentPage[] }>("/api/admin/content"),
	saveContent: (called: string, content: string) =>
		req<{ ok: boolean }>(`/api/admin/content/${encodeURIComponent(called)}`, { method: "PUT", body: j({ content }) }),

	users: () => req<{ ok: boolean; items: AdminUserRow[] }>("/api/admin/users"),
	resetPassword: (id: number, password: string) =>
		req<{ ok: boolean }>(`/api/admin/users/${id}/password`, { method: "PUT", body: j({ password }) }),
	setUserLock: (id: number, locked: number) =>
		req<{ ok: boolean }>(`/api/admin/users/${id}/lock`, { method: "PUT", body: j({ locked }) }),

	uploadFiles: (file: File): Promise<{ ok: boolean; path: string; url: string }> => {
		const form = new FormData();
		form.append("file", file);
		return fetch("/api/admin/upload", { method: "POST", credentials: "same-origin", body: form }).then(async (r) => {
			const d = (await r.json().catch(() => ({}))) as { ok?: boolean; path?: string; url?: string; error?: string };
			if (!r.ok) throw new ApiError(r.status, d.error ?? `HTTP ${r.status}`);
			return d as { ok: true; path: string; url: string };
		});
	},
	uploadList: () => req<{ ok: boolean; items: UploadFile[] }>("/api/admin/upload/list"),
	delUpload: (path: string) =>
		req<{ ok: boolean }>(`/api/admin/upload?path=${encodeURIComponent(path)}`, { method: "DELETE" }),
};
