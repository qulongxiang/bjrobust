// 数据统计：内容/浏览概览 + 原系统操作日志（对应旧后台 stat/anal.php 数据分析 + right.php 系统首页）
import { useEffect, useState } from "react";
import { adminApi } from "../api";

type Stats = {
	news: number;
	products: number;
	feedback: number;
	logTotal: number;
	hits: number;
	recentLog: { id: number; ip: string; time: string; description: string }[];
};

export default function StatsAdmin() {
	const [data, setData] = useState<Stats | null>(null);
	const [err, setErr] = useState("");

	useEffect(() => {
		adminApi
			.stats()
			.then(setData)
			.catch((e) => setErr(e instanceof Error ? e.message : "加载失败"));
	}, []);

	if (err)
		return (
			<div>
				<div className="admin-page-head">
					<h2>数据统计</h2>
				</div>
				<div className="admin-msg err">{err}</div>
			</div>
		);
	if (!data) return <div className="admin-loading">加载中…</div>;

	const cards = [
		{ label: "新闻/案例", value: data.news },
		{ label: "产品", value: data.products },
		{ label: "留言", value: data.feedback },
		{ label: "累计浏览", value: data.hits },
		{ label: "操作日志", value: data.logTotal },
	];

	return (
		<div>
			<div className="admin-page-head">
				<h2>数据统计</h2>
			</div>
			<div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
				{cards.map((c) => (
					<div
						key={c.label}
						style={{
							flex: "1 1 120px",
							minWidth: 120,
							background: "#f7f8fb",
							border: "1px solid #e8ebf2",
							borderRadius: 10,
							padding: "14px 16px",
						}}
					>
						<div style={{ fontSize: 24, fontWeight: 700, color: "#1a3c8b" }}>{c.value}</div>
						<div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>{c.label}</div>
					</div>
				))}
			</div>
			<h3 style={{ margin: "18px 0 8px", fontSize: 15 }}>最近操作记录（原系统日志）</h3>
			{data.recentLog.length ? (
				<table className="admin-table">
					<thead>
						<tr>
							<th>时间</th>
							<th>IP</th>
							<th>操作</th>
						</tr>
					</thead>
					<tbody>
						{data.recentLog.map((l) => (
							<tr key={l.id}>
								<td className="muted">{l.time}</td>
								<td className="muted">{l.ip}</td>
								<td>{l.description}</td>
							</tr>
						))}
					</tbody>
				</table>
			) : (
				<div className="empty-tip">暂无记录</div>
			)}
		</div>
	);
}
