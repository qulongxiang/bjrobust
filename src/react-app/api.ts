// 前台 API 客户端 + 类型
export type GlobalInfo = {
	webname: string;
	title: string;
	keywords: string;
	description: string;
	beian: string;
	web: string;
} | null;

export type HomeData = {
	global: GlobalInfo;
	about: string;
	banners: { id: number; title: string; pic: string; noteTime: string }[];
	news: { id: number; title: string; noteTime: string; pic: string; hits: number }[];
	products: { id: number; name: string; pic: string; noteTime: string }[];
	cases: { id: number; title: string; pic: string }[];
	brands: { id: number; title: string; pic: string; link: string }[];
	partners: { id: number; title: string; pic: string; link: string }[];
};

export type GlobalData = { global: GlobalInfo; fragments: Record<string, string> };

export type Paged<T> = { total: number; page: number; pageSize: number; items: T[] };

export type NewsItem = { id: number; title: string; noteTime: string; pic: string; hits: number };
export type NewsDetailData = {
	news: {
		id: number;
		title: string;
		noteTime: string;
		content: string;
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
	prev: { id: number; title: string } | null;
	next: { id: number; title: string } | null;
};

export type ProductItem = {
	id: number;
	name: string;
	smallPic: string;
	noteTime: string;
	hits: number;
	typeId: number;
	webTitle: string;
	webKey: string;
	webDesc: string;
};
export type ProductDetailData = {
	product: ProductItem & { content: string; memo: string };
	typeName: string;
	images: { id: number; name: string; pic: string; big: string }[];
	prev: { id: number; name: string } | null;
	next: { id: number; name: string } | null;
};

export type ProTypeItem = {
	id: number;
	name: string;
	pid: number;
	level: number;
	order: number;
	memo: string;
	children?: ProTypeItem[];
};

export type NewsType = { id: number; name: string };

// 图片路径：库里是 /upload/xx.jpg（原站根路径）→ 新系统走 R2：/assets/upload/xx.jpg
export function imgUrl(path?: string | null): string {
	if (!path) return "";
	if (/^https?:\/\//.test(path)) return path;
	return `/assets/${path.replace(/^\//, "")}`;
}

async function get<T>(url: string): Promise<T> {
	const res = await fetch(url, { headers: { Accept: "application/json" } });
	if (!res.ok) throw new Error(`API ${res.status}: ${url}`);
	return (await res.json()) as T;
}

export const api = {
	home: () => get<HomeData>("/api/site/home"),
	global: () => get<GlobalData>("/api/site/global"),
	pageBanner: () => get<{ title: string; pic: string }>("/api/site/page-banner"),
	productTypes: () =>
		get<{ items: ProTypeItem[]; tree: ProTypeItem[] }>("/api/site/product-types"),
	products: (typeId?: number, page = 1, pageSize = 12) => {
		// 注意：无 typeId 时 URL 必须以 ? 开头，否则 &page=... 会被当成路径 → 404
		const qs = new URLSearchParams();
		if (typeId) qs.set("typeId", String(typeId));
		qs.set("page", String(page));
		qs.set("pageSize", String(pageSize));
		return get<Paged<ProductItem>>(`/api/site/products?${qs.toString()}`);
	},
	product: (id: number) => get<ProductDetailData>(`/api/site/product/${id}`),
	newsTypes: () =>
		get<NewsType[]>("/api/site/news-types").catch(() =>
			Promise.resolve([] as NewsType[]),
		),
	news: (type = 3, page = 1, pageSize = 10) =>
		get<Paged<NewsItem> & { type: NewsType }>(
			`/api/site/news?type=${type}&page=${page}&pageSize=${pageSize}`,
		),
	newsDetail: (id: number) => get<NewsDetailData>(`/api/site/news/${id}`),
	cases: (page = 1, pageSize = 10) =>
		get<Paged<NewsItem>>(`/api/site/cases?page=${page}&pageSize=${pageSize}`),
	caseDetail: (id: number) => get<NewsDetailData>(`/api/site/case/${id}`),
	staticPage: (called: string) =>
		get<{ called: string; content: string; noteTime: string }>(
			`/api/site/page/${encodeURIComponent(called)}`,
		),
	submitFeedback: (name: string, content: string) =>
		fetch("/api/site/feedback", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name, content }),
		}).then(async (r) => {
			const d = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
			if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
			return d;
		}),
};
