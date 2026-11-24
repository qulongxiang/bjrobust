// 联系我们：静态内容 + 地图 + 留言表单
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import PageHero from "../components/PageHero";
import { safeHtml } from "../lib/html";
import { applySeo } from "../lib/seo";

// 地图片段是旧站整页 HTML（含 <script>），dangerouslySetInnerHTML 不会执行脚本，
// 所以这里解析出 AMap key 与坐标后动态加载高德 JS API 初始化地图；加载失败显示跳转链接兜底
function plainText(html: string): string {
	return html
		.replace(/<[^>]*>/g, " ")
		.replace(/&nbsp;/gi, " ")
		.replace(/\s+/g, " ")
		.trim();
}

/** 没有 key / 坐标时不要再画一个空地图框，直接给"地址 + 在高德地图查看" */
function mapSearchUrl(keyword: string): string {
	return `https://uri.amap.com/search?keyword=${encodeURIComponent(keyword)}&city=${encodeURIComponent("北京")}&src=bjrobust&coordinate=gaode&callnative=0`;
}

function AMapBox({ html }: { html: string }) {
	const [failed, setFailed] = useState(false);
	const divRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const keyM = html.match(/key=([a-f0-9]{16,})/);
		const lngM = html.match(/lnglat:\s*\{\s*lng:\s*([\d.]+),\s*lat:\s*([\d.]+)/);
		const cM = html.match(/center\s*=\s*\{lng:\s*([\d.]+),\s*lat:\s*([\d.]+)/);
		const nameM = html.match(/name:\s*"([^"]+)"/);
		if (!keyM || !lngM || !divRef.current) {
			setFailed(true);
			return;
		}
		let cancelled = false;
		const w = window as unknown as { AMap?: unknown };
		const init = () => {
			if (cancelled || !divRef.current) return;
			try {
				const AMap = (window as unknown as { AMap: any }).AMap;
				const center = cM ? [parseFloat(cM[1]), parseFloat(cM[2])] : [parseFloat(lngM[1]), parseFloat(lngM[2])];
				const map = new AMap.Map(divRef.current, { center, zoom: 15 });
				new AMap.Marker({
					map,
					position: [parseFloat(lngM[1]), parseFloat(lngM[2])],
					title: nameM?.[1] ?? "",
				});
			} catch {
				setFailed(true);
			}
		};
		// 已经加载过高德 SDK（比如从联系页来回切）就复用，别每次访问都往 head 里再塞一个 script
		if (w.AMap) {
			init();
			return () => {
				cancelled = true;
			};
		}
		const s = document.createElement("script");
		s.src = `https://webapi.amap.com/maps?v=1.3&key=${keyM[1]}`;
		s.onload = init;
		s.onerror = () => setFailed(true);
		document.head.appendChild(s);
		return () => {
			cancelled = true;
		};
	}, [html]);

	if (failed) {
		const m = html.match(/lnglat:\s*\{\s*lng:\s*([\d.]+),\s*lat:\s*([\d.]+)/);
		const nameM = html.match(/name:\s*"([^"]+)"/);
		const label = nameM?.[1] ?? "公司地址";
		return (
			<div className="map-fallback">
				<div>{label}</div>
				<a
					href={m ? `https://uri.amap.com/marker?position=${m[1]},${m[2]}&name=${encodeURIComponent(label)}` : mapSearchUrl(label)}
					target="_blank"
					rel="noreferrer"
				>
					点击在高德地图中查看位置
				</a>
			</div>
		);
	}
	return (
		<div className="map-box">
			<div ref={divRef} className="map-canvas" />
		</div>
	);
}

export default function Contact() {
	// 页面级 SEO：标题/描述覆盖站点默认值
	useEffect(() => {
		applySeo({ raw: "联系我们" });
	}, []);
	const [info, setInfo] = useState("");
	const [map, setMap] = useState("");
	const [name, setName] = useState("");
	const [content, setContent] = useState("");
	// 地图数据是否足够（key + 经纬度），不够就不画地图
	const hasGeo = /key=[a-f0-9]{16,}/.test(map) && /lnglat/.test(map);
	const addrText = (() => {
		const t = plainText(info);
		const m = t.match(/地址[：:]\s*([^:：]{4,80})/);
		// 中英混排时把尾巴上的英文字段一起切掉，只留中文地址
		return (m?.[1] ?? "").replace(/\s*[A-Za-z][\s\S]*$/, "").trim();
	})();
	const [sending, setSending] = useState(false);
	const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

	useEffect(() => {
		api.staticPage("联系我们").then((d) => setInfo(d.content)).catch(() => {});
		api.staticPage("地图").then((d) => setMap(d.content)).catch(() => {});
	}, []);

	const submit = async () => {
		if (!name.trim() || !content.trim()) {
			setMsg({ ok: false, text: "请填写姓名和留言内容" });
			return;
		}
		setSending(true);
		setMsg(null);
		try {
			await api.submitFeedback(name.trim(), content.trim());
			setMsg({ ok: true, text: "留言已提交，我们会尽快与您联系" });
			setName("");
			setContent("");
		} catch (e) {
			setMsg({ ok: false, text: e instanceof Error ? e.message : "提交失败，请稍后再试" });
		} finally {
			setSending(false);
		}
	};

	return (
		<>
			<PageHero
				page="contact"
				title="联系我们"
				crumb={
					<>
						<Link to="/">首页</Link> / 联系我们
					</>
				}
			/>

			<section className="section">
				<div className="container">
					{info ? <div className="rich static-page" dangerouslySetInnerHTML={{ __html: safeHtml(info) }} /> : null}
					{hasGeo ? (
						<div style={{ marginTop: 24 }}>
							<AMapBox html={map} />
						</div>
					) : addrText ? (
						// 没有地图坐标/密钥时不再吊一个空框，改成地址 + 可点的地图链接
						<div className="map-addr" style={{ marginTop: 24 }}>
							<div>公司地址：{addrText}</div>
							<a href={mapSearchUrl(addrText)} target="_blank" rel="noreferrer">
								在高德地图中查看位置
							</a>
						</div>
					) : null}

					<div className="form-card" style={{ marginTop: 36 }}>
						<h3 style={{ marginTop: 0 }}>在线留言</h3>
						<label>您的姓名</label>
						<input value={name} onChange={(e) => setName(e.target.value)} placeholder="请输入姓名" maxLength={100} />
						<label>留言内容</label>
						<textarea
							value={content}
							onChange={(e) => setContent(e.target.value)}
							placeholder="请输入留言内容"
							maxLength={2000}
						/>
						<button className="btn" disabled={sending} onClick={submit}>
							{sending ? "提交中…" : "提交留言"}
						</button>
						{msg ? (
							<div className={`form-msg ${msg.ok ? "ok" : "err"}`}>{msg.text}</div>
						) : null}
					</div>
				</div>
			</section>
		</>
	);
}
