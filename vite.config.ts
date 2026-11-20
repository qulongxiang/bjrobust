import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
	plugins: [react(), cloudflare()],
	// 侧栏版本戳：强刷后一眼确认浏览器跑的是哪一版（排查缓存问题）
	define: {
		__APP_VERSION__: JSON.stringify("20261120c"),
	},
	server: {
		// 显式绑定 IPv4 回环：否则 vite 重启后可能只听 [::1]:5173，
		// 浏览器走 127.0.0.1 时就"访问不到"
		host: "127.0.0.1",
	},
});
