// 存储路径的唯一权威：谁要拼 key、判断归属、算缓存，都从这里走
// 目标布局：<站点Code>/upload/<年>/<月>/<日>/<文件>、<站点Code>/cn-banner/<年>/<月>/<日>/<page>-<ver>.<ext>
// 上一版布局（upload/<code>/…、cn-banner/<code>/…）与老 PHP 站的 upload/<文件名> 只在 LEGACY_LOOKUP=1 时才回退

/** 北京时间（与老 PHP 站一致）：y/m/d 都是两位的月日 */
export function bjDate(d: Date = new Date()): { y: string; m: string; d: string } {
	const bj = new Date(d.getTime() + 8 * 3600 * 1000);
	const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
	return { y: String(bj.getUTCFullYear()), m: pad(bj.getUTCMonth() + 1), d: pad(bj.getUTCDate()) };
}

/** 普通图片 key */
export function imageKey(siteCode: string, fileName: string, date = bjDate()): string {
	return `${siteCode}/upload/${date.y}/${date.m}/${date.d}/${fileName}`;
}

/**
 * 内页头图 key：文件名带版本后缀，换图必换 key，避免"换完还是旧图"的缓存假象
 * page 已由调用方校验（about/products/news/cases/support/contact）
 */
export function bannerKey(siteCode: string, page: string, ext: string, date = bjDate(), ver = Date.now().toString(36)): string {
	return `${siteCode}/cn-banner/${date.y}/${date.m}/${date.d}/${page}-${ver}${ext}`;
}

/** 去掉前导斜杠 */
export function bareKey(key: string): string {
	return key.replace(/^\//, "");
}

/** legacy 回退是否开启（默认关；确认旧数据都搬完后就别再开） */
export function legacyEnabled(v: string | undefined): boolean {
	return v === "1";
}

/** 站点自有 key：只认 <code>/ 目录。legacy=true 时额外接受上一版与老站布局 */
export function isOwnedKey(key: string, siteCode: string, legacy = false): boolean {
	const k = bareKey(key);
	if (k.startsWith(`${siteCode}/`)) return true;
	if (!legacy) return false;
	if (siteCode !== "bjrobust") return false;
	if (k.startsWith("upload/bjrobust/") || k.startsWith("cn-banner/bjrobust/")) return true;
	if (k.startsWith("upload/") && !k.slice("upload/".length).includes("/")) return true;
	return false;
}

/**
 * 读取时的候选 key 顺序：精确 key 打头，LEGACY_LOOKUP 打开时才追加旧布局候选
 * 关闭后返回只有一个元素的数组 —— 坏链会如实 404，不再被兼容层掩盖
 */
export function assetCandidates(key: string, siteCode: string, legacy = false): string[] {
	const k = bareKey(key);
	const tries = [k];
	if (!legacy || !siteCode) return tries;
	if (k.startsWith("upload/")) {
		tries.push(`upload/${siteCode}/${k.slice("upload/".length)}`);
		tries.push(`${siteCode}/upload/${k.slice("upload/".length)}`);
	} else if (k.startsWith("cn-banner/")) {
		tries.push(`cn-banner/${siteCode}/${k.slice("cn-banner/".length)}`);
		tries.push(`${siteCode}/cn-banner/${k.slice("cn-banner/".length)}`);
	} else if (!k.startsWith(`${siteCode}/`)) {
		tries.push(`${siteCode}/upload/${k}`);
	}
	return tries;
}

/**
 * 缓存策略：头图文件名已带版本，可以长缓存；
 * 普通图片同样不可变（文件名带时间戳），给一天；其余资源短缓存
 */
export function cacheControlFor(key: string): string {
	if (key.includes("/cn-banner/")) return "public, max-age=604800, immutable";
	if (key.startsWith("upload/") || key.includes("/upload/")) return "public, max-age=86400";
	return "public, max-age=3600";
}
