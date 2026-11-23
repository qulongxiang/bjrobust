// 富文本净化：库内 HTML 全部经 DOMPurify 清洗后再进 dangerouslySetInnerHTML
// 说明：后端只做了 <script> 粗过滤，这里用成熟开源库补齐 on* 事件、javascript: 协议等 XSS 面
import DOMPurify from "dompurify";

const CONFIG = {
	FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "input", "button", "link", "meta"],
	FORBID_ATTR: ["srcdoc", "formaction"],
	ADD_ATTR: ["target"],
	ALLOW_DATA_ATTR: false,
};

export function safeHtml(html?: string | null): string {
	if (!html) return "";
	return DOMPurify.sanitize(html, CONFIG);
}
