// 联系我们：静态内容 + 地图 + 留言表单
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";

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
			<div className="page-hero">
				<div className="container">
					<h1>联系我们</h1>
					<div className="breadcrumb">
						<Link to="/">首页</Link> / 联系我们
					</div>
				</div>
			</div>

			<section className="section">
				<div className="container">
					{info ? <div className="rich static-page" dangerouslySetInnerHTML={{ __html: info }} /> : null}
					{map ? (
						<div className="static-page" style={{ marginTop: 24 }} dangerouslySetInnerHTML={{ __html: map }} />
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
