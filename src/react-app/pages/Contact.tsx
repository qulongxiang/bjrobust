// 联系我们：静态内容 + 地图 + 留言表单
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import PageHero from "../components/PageHero";

// 地图片段是旧站整页 HTML（含 <script>），dangerouslySetInnerHTML 不会执行脚本，
// 所以这里解析出 AMap key 与坐标后动态加载高德 JS API 初始化地图；加载失败显示跳转链接兜底
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
		const s = document.createElement("script");
		s.src = `https://webapi.amap.com/maps?v=1.3&key=${keyM[1]}`;
		s.onload = () => {
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
		s.onerror = () => setFailed(true);
		document.head.appendChild(s);
		return () => {
			cancelled = true;
		};
	}, [html]);

	if (failed) {
		const m = html.match(/lnglat:\s*\{\s*lng:\s*([\d.]+),\s*lat:\s*([\d.]+)/);
		const nameM = html.match(/name:\s*"([^"]+)"/);
		return (
			<div className="map-fallback">
				<div>{nameM?.[1] ?? "公司地址"}</div>
				{m ? (
					<a href={`https://uri.amap.com/marker?position=${m[1]},${m[2]}&name=${encodeURIComponent(nameM?.[1] ?? "公司地址")}`} target="_blank" rel="noreferrer">
						点击在高德地图中查看位置
					</a>
				) : null}
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
	const [info, setInfo] = useState("");
	const [map, setMap] = useState("");
	const [name, setName] = useState("");
	const [content, setContent] = useState("");
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
				banner="cn-banner/banner6.jpg"
				title="联系我们"
				crumb={
					<>
						<Link to="/">首页</Link> / 联系我们
					</>
				}
			/>

			<section className="section">
				<div className="container">
					{info ? <div className="rich static-page" dangerouslySetInnerHTML={{ __html: info }} /> : null}
					{map ? <div style={{ marginTop: 24 }}><AMapBox html={map} /></div> : null}

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
