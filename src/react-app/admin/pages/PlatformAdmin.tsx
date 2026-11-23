// 平台管理（仅超管）：站点（租户）列表、新建、编辑、域名绑定、空白模板初始化、启停、删除
import { useEffect, useState } from "react";
import { adminApi, type PlatformSite, type PlatformStats, type SiteTheme } from "../api";

const DEFAULT_THEME: SiteTheme = { primary: "#14508c", primaryDark: "#0e3c6e", accent: "#ff9f00" };

type EditState = {
	id: number | null; // null = 新建
	code: string;
	name: string;
	companyName: string;
	hotline: string;
	email: string;
	logoUrl: string;
	theme: SiteTheme;
	domains: string;
	init: boolean;
};

const emptyEdit = (): EditState => ({
	id: null,
	code: "",
	name: "",
	companyName: "",
	hotline: "",
	email: "",
	logoUrl: "",
	theme: { ...DEFAULT_THEME },
	domains: "",
	init: true,
});

function toState(s: PlatformSite): EditState {
	return {
		id: s.id,
		code: s.code,
		name: s.name,
		companyName: s.companyName,
		hotline: s.hotline,
		email: s.email,
		logoUrl: s.logoUrl,
		theme: { ...DEFAULT_THEME, ...s.theme },
		domains: s.domains.join("\n"),
		init: false,
	};
}

export default function PlatformAdmin() {
	const [sites, setSites] = useState<PlatformSite[]>([]);
	const [stats, setStats] = useState<Record<string, PlatformStats>>({});
	const [defaultCode, setDefaultCode] = useState("bjrobust");
	const [currentCode, setCurrentCode] = useState("");
	const [editing, setEditing] = useState<EditState | null>(null);
	const [busy, setBusy] = useState(false);
	const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

	const flash = (ok: boolean, text: string) => {
		setMsg({ ok, text });
		setTimeout(() => setMsg(null), 3500);
	};

	const load = () =>
		adminApi
			.platformSites()
			.then((d) => {
				setSites(d.sites);
				setStats(d.stats);
				setDefaultCode(d.defaultCode);
				setCurrentCode(d.currentCode);
			})
			.catch((e) => flash(false, e instanceof Error ? e.message : "加载失败"));

	useEffect(() => {
		load();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const save = async () => {
		if (!editing) return;
		const hosts = editing.domains
			.split(/[\n,，\s]+/)
			.map((s) => s.trim())
			.filter(Boolean);
		setBusy(true);
		try {
			if (editing.id == null) {
				await adminApi.createPlatformSite({
					code: editing.code.trim().toLowerCase(),
					name: editing.name.trim(),
					companyName: editing.companyName.trim(),
					hotline: editing.hotline.trim(),
					email: editing.email.trim(),
					logoUrl: editing.logoUrl.trim(),
					theme: editing.theme,
					hosts,
					init: editing.init,
				});
				flash(true, "站点已创建");
			} else {
				await adminApi.updatePlatformSite(editing.id, {
					name: editing.name.trim(),
					companyName: editing.companyName.trim(),
					hotline: editing.hotline.trim(),
					email: editing.email.trim(),
					logoUrl: editing.logoUrl.trim(),
					theme: editing.theme,
				});
				await adminApi.savePlatformDomains(editing.id, hosts);
				flash(true, "站点已保存（域名已更新）");
			}
			setEditing(null);
			await load();
		} catch (e) {
			flash(false, e instanceof Error ? e.message : "保存失败");
		} finally {
			setBusy(false);
		}
	};

	const toggleActive = async (s: PlatformSite) => {
		try {
			await adminApi.updatePlatformSite(s.id, { isActive: s.isActive === 1 ? 0 : 1 });
			flash(true, s.isActive === 1 ? `已停用 ${s.code}` : `已启用 ${s.code}`);
			await load();
		} catch (e) {
			flash(false, e instanceof Error ? e.message : "操作失败");
		}
	};

	const scaffold = async (s: PlatformSite) => {
		if (!confirm(`为「${s.code}」生成空白模板内容？（已有内容时不会重复生成）`)) return;
		try {
			const r = await adminApi.scaffoldPlatformSite(s.id);
			flash(true, r.message);
			await load();
		} catch (e) {
			flash(false, e instanceof Error ? e.message : "操作失败");
		}
	};

	const remove = async (s: PlatformSite) => {
		const hasContent = stats[s.code]?.initialized;
		const tip = hasContent
			? `「${s.code}」已有内容，删除会连同新闻/产品/留言一起清空，且不可恢复。确认删除？`
			: `确认删除站点「${s.code}」？`;
		if (!confirm(tip)) return;
		try {
			await adminApi.deletePlatformSite(s.id, hasContent);
			flash(true, "已删除");
			await load();
		} catch (e) {
			flash(false, e instanceof Error ? e.message : "删除失败");
		}
	};

	return (
		<div>
			<div className="admin-page-head">
				<h2>平台管理</h2>
				<p className="muted" style={{ marginTop: 6 }}>
					一套部署服务多个域名：每个域名按 Host 命中一个站点，前台展示对应公司的内容与配色。
					当前生效站点：<b>{currentCode}</b>（默认站 {defaultCode} 为未知域名的兜底）。
				</p>
			</div>

			{msg ? <div className={`admin-msg ${msg.ok ? "ok" : "err"}`}>{msg.text}</div> : null}

			<div className="admin-panel">
				<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
					<h3 style={{ margin: 0 }}>站点列表</h3>
					<button className="btn primary" onClick={() => setEditing(emptyEdit())}>
						新建站点
					</button>
				</div>
				<table className="admin-table platform-table" style={{ marginTop: 12 }}>
					<thead>
						<tr>
							<th>标识</th>
							<th>名称</th>
							<th>绑定域名</th>
							<th>内容量</th>
							<th>状态</th>
							<th>操作</th>
						</tr>
					</thead>
					<tbody>
						{sites.map((s) => {
							const st = stats[s.code];
							return (
								<tr key={s.id}>
									<td>
										<b>{s.code}</b>
										{s.code === defaultCode ? <div className="muted" style={{ fontSize: 12 }}>默认站</div> : null}
									</td>
									<td>
										{s.name}
										<div className="muted" style={{ fontSize: 12 }}>{s.companyName}</div>
									</td>
									<td className="muted" style={{ fontSize: 12 }}>
										{s.domains.length ? s.domains.join("、") : "未绑定域名"}
									</td>
									<td className="muted" style={{ fontSize: 12 }}>
										新闻 {st?.news ?? 0} · 产品 {st?.products ?? 0} · 留言 {st?.feedback ?? 0}
									{st?.initialized ? "" : " · 未初始化"}
									</td>
									<td>
										<span className={`tag${s.isActive === 1 ? "" : " off"}`}>{s.isActive === 1 ? "启用" : "停用"}</span>
									</td>
									<td>
										<button className="btn small" onClick={() => setEditing(toState(s))}>
											编辑
										</button>{" "}
										<button className="btn small" onClick={() => toggleActive(s)}>
											{s.isActive === 1 ? "停用" : "启用"}
										</button>{" "}
										<button className="btn small" onClick={() => scaffold(s)}>
											初始化内容
										</button>{" "}
										<button className="btn small danger" disabled={s.code === defaultCode} onClick={() => remove(s)}>
											删除
										</button>
									</td>
								</tr>
							);
						})}
						{!sites.length ? (
							<tr>
								<td colSpan={6} className="empty-tip">
									暂无站点
								</td>
							</tr>
						) : null}
					</tbody>
				</table>
			</div>

			{editing ? (
				<div className="modal-mask" onClick={() => !busy && setEditing(null)}>
					<div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 720 }}>
						<h3>{editing.id == null ? "新建站点" : `编辑站点：${editing.code}`}</h3>
						<div className="platform-form">
							<div className="admin-row">
								<div className="admin-field">
									<label>站点标识（小写字母/数字/短横线，用于图片前缀）</label>
									<input
										value={editing.code}
										disabled={editing.id != null}
										placeholder="例如 aaaa"
										onChange={(e) => setEditing({ ...editing, code: e.target.value })}
									/>
								</div>
								<div className="admin-field">
									<label>站点名称（后台显示）</label>
									<input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
								</div>
							</div>
							<div className="admin-row">
								<div className="admin-field">
									<label>公司全称（前台欢迎语 / 页脚版权占位）</label>
									<input
										value={editing.companyName}
										onChange={(e) => setEditing({ ...editing, companyName: e.target.value })}
									/>
								</div>
								<div className="admin-field">
									<label>服务热线</label>
									<input value={editing.hotline} onChange={(e) => setEditing({ ...editing, hotline: e.target.value })} />
								</div>
							</div>
							<div className="admin-row">
								<div className="admin-field">
									<label>服务邮箱</label>
									<input value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} />
								</div>
								<div className="admin-field">
									<label>Logo 地址（/assets/... 或 https://）</label>
									<input value={editing.logoUrl} onChange={(e) => setEditing({ ...editing, logoUrl: e.target.value })} />
								</div>
							</div>
							<div className="admin-row">
								<div className="admin-field">
									<label>主色</label>
									<div className="color-input">
										<input
											type="color"
											value={editing.theme.primary ?? "#14508c"}
											onChange={(e) => setEditing({ ...editing, theme: { ...editing.theme, primary: e.target.value } })}
										/>
										<input
											value={editing.theme.primary ?? ""}
											onChange={(e) => setEditing({ ...editing, theme: { ...editing.theme, primary: e.target.value } })}
										/>
									</div>
								</div>
								<div className="admin-field">
									<label>主色（深）</label>
									<div className="color-input">
										<input
											type="color"
											value={editing.theme.primaryDark ?? "#0e3c6e"}
											onChange={(e) =>
												setEditing({ ...editing, theme: { ...editing.theme, primaryDark: e.target.value } })
											}
										/>
										<input
											value={editing.theme.primaryDark ?? ""}
											onChange={(e) =>
												setEditing({ ...editing, theme: { ...editing.theme, primaryDark: e.target.value } })
											}
										/>
									</div>
								</div>
								<div className="admin-field">
									<label>强调色（橙色系装饰）</label>
									<div className="color-input">
										<input
											type="color"
											value={editing.theme.accent ?? "#ff9f00"}
											onChange={(e) => setEditing({ ...editing, theme: { ...editing.theme, accent: e.target.value } })}
										/>
										<input
											value={editing.theme.accent ?? ""}
											onChange={(e) => setEditing({ ...editing, theme: { ...editing.theme, accent: e.target.value } })}
										/>
									</div>
								</div>
							</div>
							<div className="admin-field">
								<label>绑定域名（每行一个，不含 https://）</label>
								<textarea
									value={editing.domains}
									placeholder={"aaaa.qlxtools.asia\nwww.aaaa.qlxtools.asia"}
									onChange={(e) => setEditing({ ...editing, domains: e.target.value })}
									style={{ minHeight: 80 }}
								/>
							</div>
							{editing.id == null ? (
								<label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
									<input
										type="checkbox"
										checked={editing.init}
										onChange={(e) => setEditing({ ...editing, init: e.target.checked })}
									/>
									创建后立即生成空白模板内容（新闻/3 个产品分类/静态页占位）
								</label>
							) : null}
						</div>
						<div className="modal-foot">
							<button className="btn" disabled={busy} onClick={() => setEditing(null)}>
								取消
							</button>
							<button className="btn primary" disabled={busy} onClick={save}>
								{busy ? "保存中…" : "保存"}
							</button>
						</div>
					</div>
				</div>
			) : null}
		</div>
	);
}
