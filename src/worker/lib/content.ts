// 富文本里的图片引用规范化：保存时把能解析到的本地引用统一改写成 /assets/<R2 key>
// 这一步是"写入侧收口"，避免以后再靠迁移脚本对 Content 做字符串 REPLACE
import type { AppEnv } from "../env";
import { assetCandidates, bareKey } from "./storage";

const SRC_ATTR = /(src|href)\s*=\s*(["'])([^"']+)\2/gi;

/** 看起来是本站存储路径（而非外链/data:） */
function isLocalRef(url: string): boolean {
	const u = url.trim();
	if (!u || /^(https?:|data:|blob:|mailto:|tel:|javascript:|#)/i.test(u)) return false;
	const k = bareKey(u);
	return k.startsWith("upload/") || k.startsWith("cn-banner/") || k.startsWith("assets/");
}

/** 取出候选 key：/assets/<key> → <key>；/upload/x → upload/x */
function toStorageKey(url: string): string {
	const k = bareKey(url);
	return k.startsWith("assets/") ? k.slice("assets/".length) : k;
}

/**
 * 解析到真实存在的 key：命中返回 `/assets/<key>`，一个都命中就原样返回
 * legacy 候选顺序使用 assetCandidates（包含上一版目录与老站布局）
 */
export async function normalizeContentImages(env: AppEnv, siteCode: string, html: string): Promise<string> {
	if (!html || !env.IMAGES) return html;
	if (!/src\s*=/.test(html)) return html;

	const refs = new Set<string>();
	for (const m of html.matchAll(SRC_ATTR)) {
		if (isLocalRef(m[3])) refs.add(m[3]);
	}
	if (!refs.size) return html;

	const resolved = new Map<string, string>();
	for (const ref of refs) {
		const key = toStorageKey(ref);
		for (const candidate of assetCandidates(key, siteCode, true)) {
			const hit = await env.IMAGES.head(candidate);
			if (hit) {
				resolved.set(ref, `/assets/${candidate}`);
				break;
			}
		}
	}
	if (!resolved.size) return html;

	let out = html;
	for (const [from, to] of resolved) {
		if (from === to) continue;
		out = out.split(from).join(to);
	}
	return out;
}
