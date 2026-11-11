import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

// R2 未开通期间：图片 404 时换成浅色图片图标占位（R2 恢复后可删除本段）
const PLACEHOLDER =
	"data:image/svg+xml," +
	encodeURIComponent(
		'<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200">' +
			'<rect width="100%" height="100%" fill="#eef1f5"/>' +
			'<rect x="104" y="64" width="112" height="72" rx="8" fill="none" stroke="#c3cad4" stroke-width="6"/>' +
			'<circle cx="132" cy="90" r="9" fill="#c3cad4"/>' +
			'<path d="M104 126 L140 98 L166 118 L188 100 L216 126" fill="none" stroke="#c3cad4" stroke-width="6" stroke-linejoin="round"/>' +
			'<text x="160" y="170" font-size="13" fill="#a8b0bc" text-anchor="middle" font-family="sans-serif">图片待上传</text>' +
			"</svg>",
	);
document.addEventListener(
	"error",
	(e) => {
		const t = e.target as HTMLImageElement | null;
		if (t && t.tagName === "IMG" && !t.dataset.ph) {
			t.dataset.ph = "1";
			// 数据库内容里的空 src 图片（如页脚备案图标占位）：直接移除，不显示占位块
			if (!t.getAttribute("src")) {
				t.remove();
				return;
			}
			t.classList.add("img-ph");
			t.src = PLACEHOLDER;
		}
	},
	true,
);

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<App />
	</StrictMode>,
);
