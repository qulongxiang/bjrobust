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
	/** 0 = 平台超管；>0 = 站点管理员 */
	siteId: number;
	/** 超管可跨站切换（/me 返回） */
	isSuper?: boolean;
};

export type SiteSummary = { code: string; name: string };

/** 后台当前操作的站点：超管切站点时写这里，其他请求都会带上 X-Site-Code */
const SITE_KEY = "admin_active_site";

export function getActiveSiteCode(): string {
	try {
		return localStorage.getItem(SITE_KEY) ?? "";
	} catch {
		return "";
	}
}

export function setActiveSiteCode(code: string): void {
	try {
		if (code) localStorage.setItem(SITE_KEY, code);
		else localStorage.removeItem(SITE_KEY);
	} catch {
		/* 忽略 */
	}
}

export type PlatformSite = {
	id: number;
	code: string;
	name: string;
	companyName: string;
	hotline: string;
	email: string;
	logoUrl: string;
	theme: SiteTheme;
	isActive: number;
	sort: number;
	domains: string[];
};

export type PlatformStats = { news: number; products: number; feedback: number; initialized: boolean };

export type SiteTheme = { primary?: string; primaryDark?: string; accent?: string };

export type SiteMetaInfo = {
	id: number;
	code: string;
	name: string;
	companyName: string;
	hotline: string;
	email: string;
	logoUrl: string;
	theme: SiteTheme;
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
	siteId: number;
};

/** 首页 banner 轮播（t_slide） */
export type SlideItem = {
	id: number;
	pic: string;
	url: string;
	title: string;
	link: string;
	order: number;
	isShow: number;
	updated: string;
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
		headers: {
			"Content-Type": "application/json",
			// 后台写操作要求自定义头（服务端 csrfGuard 校验），顺带带上超管切换的站点
			"X-CSRF": "1",
			...(getActiveSiteCode() ? { "X-Site-Code": getActiveSiteCode() } : {}),
			...(init?.headers ?? {}),
		},
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
	me: () =>
		req<{ ok: boolean; user: AdminUser; site: { code: string; name: string; companyName: string; theme: SiteTheme }; sites: SiteSummary[] }>(
			"/api/admin/me",
		),
	login: (username: string, password: string) =>
		req<{ ok: boolean; user: AdminUser }>("/api/admin/login", { method: "POST", body: j({ username, password }) }),
	logout: () => req<{ ok: boolean }>("/api/admin/logout", { method: "POST" }),

	newsTypes: () => req<{ ok: boolean; items: { id: number; name: string }[] }>("/api/admin/news-types"),
	// 注意：? 必须始终存在——无 ? 时 &page=... 会被当作路径的一部分导致路由 404
	news: (type?: number, page = 1) =>
		req<Paged<AdminNews>>(`/api/admin/news?page=${page}&pageSize=20${type ? `&type=${type}` : ""}`),
	addNews: (b: Partial<AdminNews>) => req<{ ok: boolean; id: number }>("/api/admin/news", { method: "POST", body: j(b) }),
	updateNews: (id: number, b: Partial<AdminNews>) => req<{ ok: boolean }>(`/api/admin/news/${id}`, { method: "PUT", body: j(b) }),
	delNews: (id: number) => req<{ ok: boolean }>(`/api/admin/news/${id}`, { method: "DELETE" }),

	addNewsType: (name: string) => req<{ ok: boolean; id: number }>("/api/admin/news-types", { method: "POST", body: j({ name }) }),
	delNewsType: (id: number) => req<{ ok: boolean }>(`/api/admin/news-types/${id}`, { method: "DELETE" }),

	products: (typeId?: number, page = 1) =>
		req<Paged<AdminProduct>>(`/api/admin/products?page=${page}&pageSize=20${typeId ? `&typeId=${typeId}` : ""}`),
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

	addUser: (b: { username: string; password: string; called?: string; siteId?: number }) =>
		req<{ ok: boolean; id: number }>("/api/admin/users", { method: "POST", body: j(b) }),

	// ---- 首页 banner 轮播（当前站点） ----
	slides: () => req<{ ok: boolean; items: SlideItem[] }>("/api/admin/slides"),
	addSlide: (b: { pic: string; title?: string; link?: string; order?: number }) =>
		req<{ ok: boolean; id: number }>("/api/admin/slides", { method: "POST", body: j(b) }),
	updateSlide: (id: number, b: { pic?: string; title?: string; link?: string; order?: number; isShow?: number }) =>
		req<{ ok: boolean }>(`/api/admin/slides/${id}`, { method: "PUT", body: j(b) }),
	delSlide: (id: number) => req<{ ok: boolean }>(`/api/admin/slides/${id}`, { method: "DELETE" }),

	stats: () =>
		req<{
			ok: boolean;
			news: number;
			products: number;
			feedback: number;
			logTotal: number;
			hits: number;
			recentLog: { id: number; ip: string; time: string; description: string }[];
			productStats: {
				byType: { id: number; name: string; count: number }[];
				top: { id: number; name: string; typeName: string; hits: number }[];
			};
		}>("/api/admin/stats"),

	bannerList: () =>
		req<{
			ok: boolean;
			items: { page: string; label: string; pic: string; url: string; updated: string }[];
		}>("/api/admin/banners"),
	replaceBanner: (page: string, file: File): Promise<{ ok: boolean }> => {
		const form = new FormData();
		form.append("file", file);
		return fetch(`/api/admin/banners/${page}`, {
			method: "PUT",
			credentials: "same-origin",
			headers: {
				"X-CSRF": "1",
				...(getActiveSiteCode() ? { "X-Site-Code": getActiveSiteCode() } : {}),
			},
			body: form,
		}).then(async (r) => {
			const d = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
			if (!r.ok) throw new ApiError(r.status, d.error ?? `HTTP ${r.status}`);
			return d as { ok: true };
		});
	},

	clearBanner: (page: string) =>
		req<{ ok: boolean }>(`/api/admin/banners/${page}`, { method: "DELETE" }),

	uploadFiles: (file: File): Promise<{ ok: boolean; path: string; url: string }> => {
		const form = new FormData();
		form.append("file", file);
		return fetch("/api/admin/upload", {
			method: "POST",
			credentials: "same-origin",
			headers: {
				"X-CSRF": "1",
				...(getActiveSiteCode() ? { "X-Site-Code": getActiveSiteCode() } : {}),
			},
			body: form,
		}).then(async (r) => {
			const d = (await r.json().catch(() => ({}))) as { ok?: boolean; path?: string; url?: string; error?: string };
			if (!r.ok) throw new ApiError(r.status, d.error ?? `HTTP ${r.status}`);
			return d as { ok: true; path: string; url: string };
		});
	},
	uploadList: () => req<{ ok: boolean; items: UploadFile[] }>("/api/admin/upload/list"),
	delUpload: (path: string) =>
		req<{ ok: boolean }>(`/api/admin/upload?path=${encodeURIComponent(path)}`, { method: "DELETE" }),

	// ---- 站点品牌与主题（当前生效站点） ----
	siteMeta: () => req<{ ok: boolean; meta: SiteMetaInfo }>("/api/admin/site-meta"),
	saveSiteMeta: (b: Partial<SiteMetaInfo>) =>
		req<{ ok: boolean }>("/api/admin/site-meta", { method: "PUT", body: j(b) }),

	// ---- 平台管理（仅超管） ----
	platformSites: () =>
		req<{ ok: boolean; sites: PlatformSite[]; stats: Record<string, PlatformStats>; defaultCode: string; currentCode: string }>(
			"/api/admin/platform/sites",
		),
	createPlatformSite: (b: {
		code: string;
		name: string;
		companyName?: string;
		hotline?: string;
		email?: string;
		logoUrl?: string;
		theme?: SiteTheme;
		hosts?: string[];
		sort?: number;
		init?: boolean;
	}) => req<{ ok: boolean; id: number; code: string }>("/api/admin/platform/sites", { method: "POST", body: j(b) }),
	updatePlatformSite: (
		id: number,
		b: Partial<Pick<PlatformSite, "name" | "companyName" | "hotline" | "email" | "logoUrl" | "isActive" | "sort">> & {
			theme?: SiteTheme;
		},
	) => req<{ ok: boolean }>(`/api/admin/platform/sites/${id}`, { method: "PUT", body: j(b) }),
	savePlatformDomains: (id: number, hosts: string[]) =>
		req<{ ok: boolean; hosts: string[] }>(`/api/admin/platform/sites/${id}/domains`, { method: "PUT", body: j({ hosts }) }),
	scaffoldPlatformSite: (id: number) =>
		req<{ ok: boolean; created: boolean; message: string }>(`/api/admin/platform/sites/${id}/scaffold`, { method: "POST" }),
	deletePlatformSite: (id: number, force = false) =>
		req<{ ok: boolean }>(`/api/admin/platform/sites/${id}${force ? "?force=1" : ""}`, { method: "DELETE" }),

	// ---- 平台素材（仅超管） ----
	platformBanners: () =>
		req<{
			ok: boolean;
			pages: { page: string; label: string }[];
			sites: {
				id: number;
				code: string;
				name: string;
				isActive: number;
				bannerCount: number;
				bannerTotal: number;
				slideCount: number;
			}[];
		}>("/api/admin/platform/banners"),
	platformBannerDetail: (code: string) =>
		req<{
			ok: boolean;
			code: string;
			pages: { page: string; label: string }[];
			items: { page: string; label: string; pic: string; url: string; updated: string }[];
		}>(`/api/admin/platform/banners/${code}`),
	uploadPlatformBanner: (code: string, page: string, file: File): Promise<{ ok: boolean }> => {
		const form = new FormData();
		form.append("file", file);
		return fetch(`/api/admin/platform/banners/${code}/${page}`, {
			method: "PUT",
			credentials: "same-origin",
			headers: { "X-CSRF": "1" },
			body: form,
		}).then(async (r) => {
			const d = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
			if (!r.ok) throw new ApiError(r.status, d.error ?? `HTTP ${r.status}`);
			return d as { ok: true };
		});
	},
	clearPlatformBanner: (code: string, page: string) =>
		req<{ ok: boolean }>(`/api/admin/platform/banners/${code}/${page}`, { method: "DELETE" }),

	// 平台级首页轮播
	platformSlides: (code: string) =>
		req<{ ok: boolean; items: SlideItem[] }>(`/api/admin/platform/slides/${code}`),
	platformAddSlide: (code: string, b: { pic: string; title?: string; link?: string; order?: number }) =>
		req<{ ok: boolean; id: number }>(`/api/admin/platform/slides/${code}`, { method: "POST", body: j(b) }),
	platformUpdateSlide: (
		code: string,
		id: number,
		b: { pic?: string; title?: string; link?: string; order?: number; isShow?: number },
	) => req<{ ok: boolean }>(`/api/admin/platform/slides/${code}/${id}`, { method: "PUT", body: j(b) }),
	platformDelSlide: (code: string, id: number) =>
		req<{ ok: boolean }>(`/api/admin/platform/slides/${code}/${id}`, { method: "DELETE" }),

	/** 把图片上传到"指定站点"目录（超管跨站维护素材用） */
	uploadFilesFor: (code: string, file: File): Promise<{ ok: boolean; path: string; url: string }> => {
		const form = new FormData();
		form.append("file", file);
		return fetch("/api/admin/upload", {
			method: "POST",
			credentials: "same-origin",
			headers: { "X-CSRF": "1", "X-Site-Code": code },
			body: form,
		}).then(async (r) => {
			const d = (await r.json().catch(() => ({}))) as { ok?: boolean; path?: string; url?: string; error?: string };
			if (!r.ok) throw new ApiError(r.status, d.error ?? `HTTP ${r.status}`);
			return d as { ok: true; path: string; url: string };
		});
	},
};
