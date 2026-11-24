// 站点级/页面级 SEO 元信息。
// 背景：index.html 里写死了 bjrobust 的 title/keywords/description，一套前端跑三个站点，
// 如果不按站点覆盖，aaaa/bbbb 两个站点的搜索结果里全是 bjrobust 的品牌词。
// 规则：站点默认值先铺底，页面级设置后到者生效；页面一旦锁定，站点默认就不再回写覆盖。
let pageLocked = false;
let brand = "";
/** 页面注册的"裸标题"（不含站点名后缀），站点名晚到时用它重算一次 */
let lastRaw = "";

/** 站点名（Layout 启动时写入），用于页面标题后缀 */
export function setBrand(name: string): void {
	brand = name;
	if (lastRaw && pageLocked) {
		document.title = pageTitle(lastRaw);
		setOg("og:title", document.title);
	}
}

export function pageTitle(title: string): string {
	return brand ? `${title} - ${brand}` : title;
}

type Seo = { title?: string; description?: string; keywords?: string; raw?: string };

function setMeta(name: string, content: string): void {
	let el = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
	if (!content) {
		if (el) el.remove();
		return;
	}
	if (!el) {
		el = document.createElement("meta");
		el.name = name;
		document.head.appendChild(el);
	}
	el.content = content;
}

function setOg(prop: string, content: string): void {
	if (!content) return;
	let el = document.head.querySelector<HTMLMetaElement>(`meta[property="${prop}"]`);
	if (!el) {
		el = document.createElement("meta");
		el.setAttribute("property", prop);
		document.head.appendChild(el);
	}
	el.content = content;
}

/** 页面级 SEO：标题/描述/关键词，设置后站点默认值不再覆盖 */
export function applySeo(seo: Seo): void {
	pageLocked = true;
	// raw = 不含站点名的标题，站点名晚到时 setBrand 会用它重算，避免出现"产品中心"这种没有品牌的标题
	const title = seo.raw ? pageTitle(seo.raw) : seo.title;
	if (seo.raw) lastRaw = seo.raw;
	if (title) {
		document.title = title;
		setOg("og:title", title);
	}
	if (seo.description) {
		setMeta("description", seo.description);
		setOg("og:description", seo.description);
	}
	if (seo.keywords) setMeta("keywords", seo.keywords);
}

/** 站点默认 SEO（Layout 调）：页面已锁定就跳过，避免把详情页刚设置的标题覆盖回站点名 */
export function applySiteSeo(seo: Seo): void {
	if (pageLocked) return;
	if (seo.title) {
		document.title = seo.title;
		setOg("og:title", seo.title);
	}
	if (seo.description) {
		setMeta("description", seo.description);
		setOg("og:description", seo.description);
	}
	setMeta("keywords", seo.keywords ?? "");
}

/** 路由切换时重置锁定，否则从详情页回到列表页，列表页标题会被站点默认值顶掉 */
export function resetSeoLock(): void {
	pageLocked = false;
}
