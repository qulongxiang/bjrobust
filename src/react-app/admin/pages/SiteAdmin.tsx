// 站点设置（t_global）+ 静态页（t_content）+ 品牌主题（t_sites）+ 内页头图（t_banner，每页一张）
import { useEffect, useState } from "react";
import { adminApi, type ContentPage, type GlobalSettings, type SiteMetaInfo } from "../api";

type BannerItem = { page: string; label: string; pic: string; url: string; updated: string };

export default function SiteAdmin() {
	const [global, setGlobal] = useState<GlobalSettings>(null);
	const [meta, setMeta] = useState<SiteMetaInfo | null>(null);
	const [pages, setPages] = useState<ContentPage[]>([]);
	const [editing, setEditing] = useState<ContentPage | null>(null);
	const [banners, setBanners] = useState<BannerItem[]>([]);
	const [bannerBusy, setBannerBusy] = useState<string | null>(null);
	const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
	const [busy, setBusy] = useState(false);

	const flash = (ok: boolean, text: string) => {
		setMsg({ ok, text });
		setTimeout(() => setMsg(null), 3000);
	};

	const loadBanners = () => adminApi.bannerList().then((d) => setBanners(d.items)).catch(() => {});

	useEffect(() => {
		adminApi
			.global()
			.then((d) => setGlobal(d.global))
			.catch((e) => flash(false, e instanceof Error ? e.message : "加载失败"));
		adminApi
			.content()
			.then((d) => setPages(d.items))
			.catch(() => {});
		loadBanners();
		adminApi
			.siteMeta()
			.then((d) => setMeta(d.meta))
			.catch(() => {});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const saveGlobal = async () => {
		if (!global) return;
		setBusy(true);
		try {
			await adminApi.saveGlobal(global);
			flash(true, "站点设置已保存");
		} catch (e) {
			flash(false, e instanceof Error ? e.message : "保存失败");
		} finally {
			setBusy(false);
		}
	};

	const savePage = async () => {
		if (!editing) return;
		setBusy(true);
		try {
			await adminApi.saveContent(editing.called, editing.content);
			flash(true, `「${editing.called}」已保存`);
			setEditing(null);
			const d = await adminApi.content();
			setPages(d.items);
		} catch (e) {
			flash(false, e instanceof Error ? e.message : "保存失败");
		} finally {
			setBusy(false);
		}
	};

	const saveMeta = async () => {
		if (!meta) return;
		setBusy(true);
		try {
			await adminApi.saveSiteMeta({
				companyName: meta.companyName,
				hotline: meta.hotline,
				email: meta.email,
				logoUrl: meta.logoUrl,
				theme: meta.theme,
			});
			flash(true, "品牌与主题已保存");
		} catch (e) {
			flash(false, e instanceof Error ? e.message : "保存失败");
		} finally {
			setBusy(false);
		}
	};

	const onBannerFile = async (page: string, file: File | null) => {
		if (!file) return;
		setBannerBusy(page);
		try {
			await adminApi.replaceBanner(page, file);
			flash(true, "头图已替换");
			await loadBanners();
		} catch (e) {
			flash(false, e instanceof Error ? e.message : "上传失败");
		} finally {
			setBannerBusy(null);
		}
	};

	const onBannerClear = async (b: BannerItem) => {
		if (!confirm(`清除「${b.label}」的头图？（前台会退回主题色渐变底，图片文件保留）`)) return;
		setBannerBusy(b.page);
		try {
			await adminApi.clearBanner(b.page);
			flash(true, "头图已清除");
			await loadBanners();
		} catch (e) {
			flash(false, e instanceof Error ? e.message : "操作失败");
		} finally {
			setBannerBusy(null);
		}
	};

	if (!global) return <div className="empty-tip">加载中…</div>;

	return (
		<div>
			<div className="admin-page-head">
				<h2>站点设置</h2>
			</div>

			{msg ? <div className={`admin-msg ${msg.ok ? "ok" : "err"}`}>{msg.text}</div> : null}

			{meta ? (
				<div className="admin-panel">
					<h3 style={{ marginTop: 0 }}>品牌与主题（站点 {meta.code}）</h3>
					<p className="muted" style={{ marginTop: 0, marginBottom: 12 }}>
						这里决定前台顶栏的公司名 / 热线 / 邮箱 / Logo 与主色调；保存后前台强刷（Ctrl+F5）生效。
					</p>
					<div className="admin-row">
						<div className="admin-field">
							<label>公司全称（前台欢迎语、页脚版权）</label>
							<input
								value={meta.companyName}
								onChange={(e) => setMeta({ ...meta, companyName: e.target.value })}
							/>
						</div>
						<div className="admin-field">
							<label>服务热线</label>
							<input value={meta.hotline} onChange={(e) => setMeta({ ...meta, hotline: e.target.value })} />
						</div>
					</div>
					<div className="admin-row">
						<div className="admin-field">
							<label>服务邮箱</label>
							<input value={meta.email} onChange={(e) => setMeta({ ...meta, email: e.target.value })} />
						</div>
						<div className="admin-field">
							<label>Logo 地址（/assets/... 或 https://）</label>
							<input value={meta.logoUrl} onChange={(e) => setMeta({ ...meta, logoUrl: e.target.value })} />
						</div>
					</div>
					<div className="admin-row">
						<div className="admin-field">
							<label>主色</label>
							<div className="color-input">
								<input
									type="color"
									value={meta.theme.primary ?? "#14508c"}
									onChange={(e) => setMeta({ ...meta, theme: { ...meta.theme, primary: e.target.value } })}
								/>
								<input
									value={meta.theme.primary ?? ""}
									onChange={(e) => setMeta({ ...meta, theme: { ...meta.theme, primary: e.target.value } })}
								/>
							</div>
						</div>
						<div className="admin-field">
							<label>主色（深）</label>
							<div className="color-input">
								<input
									type="color"
									value={meta.theme.primaryDark ?? "#0e3c6e"}
									onChange={(e) => setMeta({ ...meta, theme: { ...meta.theme, primaryDark: e.target.value } })}
								/>
								<input
									value={meta.theme.primaryDark ?? ""}
									onChange={(e) => setMeta({ ...meta, theme: { ...meta.theme, primaryDark: e.target.value } })}
								/>
							</div>
						</div>
						<div className="admin-field">
							<label>强调色</label>
							<div className="color-input">
								<input
									type="color"
									value={meta.theme.accent ?? "#ff9f00"}
									onChange={(e) => setMeta({ ...meta, theme: { ...meta.theme, accent: e.target.value } })}
								/>
								<input
									value={meta.theme.accent ?? ""}
									onChange={(e) => setMeta({ ...meta, theme: { ...meta.theme, accent: e.target.value } })}
								/>
							</div>
						</div>
					</div>
					<button className="btn primary" disabled={busy} onClick={saveMeta}>
						{busy ? "保存中…" : "保存品牌与主题"}
					</button>
				</div>
			) : null}

			<div className="admin-panel">
				<h3 style={{ marginTop: 0 }}>全局信息（t_global）</h3>
				<div className="admin-row">
					<div className="admin-field">
						<label>网站名称（首页 Logo 文字）</label>
						<input
							value={global.webname}
							onChange={(e) => setGlobal({ ...global, webname: e.target.value })}
						/>
					</div>
					<div className="admin-field">
						<label>备案信息（页脚显示）</label>
						<input value={global.beian} onChange={(e) => setGlobal({ ...global, beian: e.target.value })} />
					</div>
				</div>
				<div className="admin-row">
					<div className="admin-field">
						<label>SEO 标题</label>
						<input value={global.title} onChange={(e) => setGlobal({ ...global, title: e.target.value })} />
					</div>
					<div className="admin-field">
						<label>SEO 关键词</label>
						<input value={global.keywords} onChange={(e) => setGlobal({ ...global, keywords: e.target.value })} />
					</div>
				</div>
				<div className="admin-field">
					<label>SEO 描述</label>
					<input
						value={global.description}
						onChange={(e) => setGlobal({ ...global, description: e.target.value })}
					/>
				</div>
				<button className="btn primary" disabled={busy} onClick={saveGlobal}>
					{busy ? "保存中…" : "保存站点设置"}
				</button>
			</div>

			<div className="admin-panel">
				<h3 style={{ marginTop: 0 }}>内页头图（每页一张，存数据库，各站点独立）</h3>
				<p className="muted" style={{ marginTop: 0, marginBottom: 12 }}>
					建议尺寸 1200–1920 宽、高 300–450，≤5MB（jpg/png/webp）。这里改的是<b>当前站点</b>的头图，其它站点互不影响；清除后前台退回主题色渐变底。
				</p>
				<div className="banner-grid">
					{banners.map((b) => (
						<div className="banner-slot" key={b.page}>
							{b.url ? (
								<img src={b.updated ? `${b.url}?v=${encodeURIComponent(b.updated)}` : b.url} alt={b.label} />
							) : (
								<div className="banner-slot-empty">未配置（前台显示主题渐变）</div>
							)}
							<div className="banner-slot-meta">
								<span>{b.label}</span>
								<label className="btn small">
									{bannerBusy === b.page ? "上传中…" : b.url ? "替换" : "上传"}
									<input
										type="file"
										accept="image/jpeg,image/png,image/gif,image/webp"
										hidden
										disabled={bannerBusy === b.page}
										onChange={(e) => {
											onBannerFile(b.page, e.target.files?.[0] ?? null);
											e.target.value = "";
										}}
									/>
								</label>
								{b.url ? (
									<button className="btn small" disabled={bannerBusy === b.page} onClick={() => onBannerClear(b)}>
										清除
									</button>
								) : null}
							</div>
						</div>
					))}
					{!banners.length ? <div className="empty-tip">头图加载失败（请检查登录状态）</div> : null}
				</div>
			</div>

			<div className="admin-panel">
				<h3 style={{ marginTop: 0 }}>静态页内容（t_content，按页面键维护）</h3>
				<table className="admin-table">
					<thead>
						<tr>
							<th>页面键</th>
							<th>更新时间</th>
							<th>摘要</th>
							<th>操作</th>
						</tr>
					</thead>
					<tbody>
						{pages.map((p) => (
							<tr key={p.id}>
								<td>{p.called}</td>
								<td className="muted">{p.noteTime}</td>
								<td className="cell-title muted" title={p.content}>
									{p.content.replace(/<[^>]+>/g, "").slice(0, 60)}
								</td>
								<td>
									<button className="btn small" onClick={() => setEditing({ ...p })}>
										编辑
									</button>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>

			{editing ? (
				<div className="modal-mask" onClick={() => !busy && setEditing(null)}>
					<div className="modal" onClick={(e) => e.stopPropagation()}>
						<h3>编辑：{editing.called}</h3>
						<div className="admin-field">
							<label>内容（HTML）</label>
							<textarea
								value={editing.content}
								onChange={(e) => setEditing({ ...editing, content: e.target.value })}
								style={{ minHeight: 260 }}
							/>
						</div>
						<div className="modal-foot">
							<button className="btn" disabled={busy} onClick={() => setEditing(null)}>
								取消
							</button>
							<button className="btn primary" disabled={busy} onClick={savePage}>
								{busy ? "保存中…" : "保存"}
							</button>
						</div>
					</div>
				</div>
			) : null}
		</div>
	);
}
