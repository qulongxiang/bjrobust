import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

// R2 未开通期间：图片 404 时换成灰色占位图（R2 恢复后可删除本段）
const PLACEHOLDER =
	"data:image/svg+xml," +
	encodeURIComponent(
		'<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="100%" height="100%" fill="#ebebeb"/><text x="50%" y="50%" fill="#b0b0b0" font-size="14" font-family="sans-serif" text-anchor="middle" dominant-baseline="middle">图片待上传</text></svg>',
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
