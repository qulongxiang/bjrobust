// 平台管理（仅超管）：站点卡片网格（支撑几十个域名）+ 单站素材维护（6 页头图 + 首页轮播）
import { useEffect, useState } from "react";
import ImageField from "../components/ImageField";
import SlideEditor from "../components/SlideEditor";
import { adminApi, type PlatformSite, type PlatformStats, type SiteTheme, type SlideItem } from "../api";

const DEFAULT_THEME: SiteTheme = { primary: "#14508c", primaryDark: "#0e3c6e", accent: "#ff9f00" };

type EditState = {
	id: number | null;
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

type Coverage = { bannerCount: number; bannerTotal: number; slideCount: number };

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
		theme: s.theme ?? { ...DEFAULT_THEME },
		domains: s.domains.join("\n"),
		init: false,
	};
}

export default function PlatformAdmin() {
	const [sites, setSites] = useState<PlatformSite[]>([]);
	const [stats, setStats] = useState<Record<string, PlatformStats>>({});
	const [coverage, setCoverage] = useState<Record<string, Coverage>>({});
	const [defaultCode, setDefaultCode] = useState("bjrobust");
	const [currentCode, setCurrentCode] = useState("");
	const [editing, setEditing] = useState<EditState | null>(null);
	const [mediaCode, setMediaCode] = useState("");
	const [keyword, setKeyword] = useState("");
	const [filter, setFilter] = useState<"all" | "active" | "off">("all");
	const [busy, setBusy] = useState(false);
	const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

	const flash = (ok: boolean, text: string) => {
		setMsg({ ok, text });
		setTimeout(() => setMsg(null), 3500);
	};

	const load = async () => {
		try {
			const [d, cov] = await Promise.all([adminApi.platformSites(), adminApi.platformBanners()]);
			setSites(d.sites);
			setStats(d.stats);
			setDefaultCode(d.defaultCode);
			setCurrentCode(d.currentCode);
			setCoverage(
				Object.fromEntries(
					cov.sites.map((s) => [
						s.code,
						{ bannerCount: s.bannerCount, bannerTotal: s.bannerTotal, slideCount: s.slideCount },
					]),
				),
			);
		} catch (e) {
			flash(false, e instanceof Error ? e.message : "加载失败");
		}
	};

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
			? `「${s.code}」已有内容，删除会连同新闻/产品/留言/头图/轮播一起清空，且不可恢复。确认删除？`
			: `确认删除站点「${s.code}」？`;
		if (!confirm(tip)) return;
		try {
			await adminApi.deletePlatformSite(s.id, hasContent);
			flash(true, "已删除");
			if (mediaCode === s.code) setMediaCode("");
			await load();
		} catch (e) {
			flash(false, e instanceof Error ? e.message : "删除失败");
		}
	};

	const kw = keyword.trim().toLowerCase();
	const shown = sites.filter((s) => {
		if (filter === "active" && s.isActive !== 1) return false;
		if (filter === "off" && s.isActive === 1) return false;
		if (!kw) return true;
		return (
			s.code.toLowerCase().includes(kw) ||
			s.name.toLowerCase().includes(kw) ||
			s.companyName.toLowerCase().includes(kw) ||
			s.domains.some((d) => d.toLowerCase().includes(kw))
		);
	});

	const mediaSite = sites.find((s) => s.code === mediaCode);

	return (
		<div>
			<div className="admin-page-head">
				<h2>平台管理</h2>
				<button className="btn primary" onClick={() => setEditing(emptyEdit())}>
					新建站点
				</button>
			</div>
			<p className="muted" style={{ marginTop: -4, marginBottom: 14 }}>
				一套部署服务多个域名：每个域名按 Host 命中一个站点。当前生效站点 <b>{currentCode}</b>，默认站
				<b> {defaultCode}</b> 兜底未知域名。
			</p>

			{msg ? <div className={`admin-msg ${msg.ok ? "ok" : "err"}`}>{msg.text}</div> : null}

			<div className="admin-panel">
				<div className="site-toolbar">
					<input
						placeholder="搜索站点标识 / 名称 / 域名"
						value={keyword}
						onChange={(e) => setKeyword(e.target.value)}
					/>
					<div className="admin-tabs" style={{ margin: 0 }}>
						<button className={filter === "all" ? "on" : ""} onClick={() => setFilter("all")}>
							全部 {sites.length}
						</button>
						<button className={filter === "active" ? "on" : ""} onClick={() => setFilter("active")}>
							启用
						</button>
						<button className={filter === "off" ? "on" : ""} onClick={() => setFilter("off")}>
							停用
						</button>
					</div>
					<span className="muted" style={{ fontSize: 12 }}>
						{shown.length} / {sites.length} 个站点
					</span>
				</div>

				<div className="site-cards">
					{shown.map((s) => {
						const st = stats[s.code];
						const cov = coverage[s.code];
						const bannerMissing = cov ? cov.bannerTotal - cov.bannerCount : 0;
						return (
							<div className={`site-card${s.isActive === 1 ? "" : " off"}`} key={s.id}>
								<div className="site-card-head">
									<div>
										<div className="site-card-name">{s.name}</div>
										<div className="site-card-code">
											{s.code}
											{s.code === defaultCode ? <span className="tag">默认站</span> : null}
											<span className={`tag${s.isActive === 1 ? "" : " off"}`}>
												{s.isActive === 1 ? "启用" : "停用"}
											</span>
										</div>
									</div>
									<button className="btn small" onClick={() => setEditing(toState(s))}>
										编辑
									</button>
								</div>
								<div className="site-card-domains">
									{s.domains.length ? s.domains.join("、") : "未绑定域名"}
								</div>
								<div className="site-card-meta">
									<span>新闻 {st?.news ?? 0}</span>
									<span>产品 {st?.products ?? 0}</span>
									<span>留言 {st?.feedback ?? 0}</span>
									{cov ? (
										<span className={bannerMissing ? "warn" : ""}>
											头图 {cov.bannerCount}/{cov.bannerTotal}
										</span>
									) : null}
									{cov ? <span className={cov.slideCount ? "" : "warn"}>轮播 {cov.slideCount} 张</span> : null}
								</div>
								<div className="site-card-ops">
									<button className="btn small" onClick={() => setMediaCode(s.code)}>
										素材维护
									</button>
									<button className="btn small" onClick={() => toggleActive(s)}>
										{s.isActive === 1 ? "停用" : "启用"}
									</button>
									<button className="btn small" onClick={() => scaffold(s)}>
										初始化内容
									</button>
									<button className="btn small danger" disabled={s.code === defaultCode} onClick={() => remove(s)}>
										删除
									</button>
								</div>
							</div>
						);
					})}
					{!shown.length ? <div className="empty-tip">没有匹配的站点</div> : null}
				</div>
			</div>

			<OrphanPanel onMsg={flash} />

			{mediaSite ? (
				<MediaPanel
					site={mediaSite}
					onClose={() => setMediaCode("")}
					onMsg={flash}
					onChanged={load}
				/>
			) : null}

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
							</div>
							<ImageField
								label="站点 Logo"
								value={editing.logoUrl}
								onChange={(p) => setEditing({ ...editing, logoUrl: p })}
								ratio="4 / 1"
								hint="建议透明底 PNG，宽度 ≥ 400"
								siteCode={editing.id != null ? editing.code : undefined}
							/>
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

/** 单站素材维护：6 个菜单页头图 + 首页 banner 轮播 */
function MediaPanel({
	site,
	onClose,
	onMsg,
	onChanged,
}: {
	site: PlatformSite;
	onClose: () => void;
	onMsg: (ok: boolean, text: string) => void;
	onChanged: () => void;
}) {
	const [banners, setBanners] = useState<{ page: string; label: string; pic: string; url: string; updated: string }[]>([]);
	const [slides, setSlides] = useState<SlideItem[]>([]);
	const [busy, setBusy] = useState("");
	const [loading, setLoading] = useState(true);

	const load = async () => {
		try {
			const [b, s] = await Promise.all([adminApi.platformBannerDetail(site.code), adminApi.platformSlides(site.code)]);
			setBanners(b.items);
			setSlides(s.items);
		} catch (e) {
			onMsg(false, e instanceof Error ? e.message : "素材加载失败");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		setLoading(true);
		load();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [site.code]);

	const after = async () => {
		await load();
		onChanged();
	};

	const uploadBanner = async (page: string, file?: File | null) => {
		if (!file) return;
		setBusy(`banner:${page}`);
		try {
			await adminApi.uploadPlatformBanner(site.code, page, file);
			onMsg(true, `${site.code} 的头图已更新`);
			await after();
		} catch (e) {
			onMsg(false, e instanceof Error ? e.message : "上传失败");
		} finally {
			setBusy("");
		}
	};

	const clearBanner = async (page: string) => {
		if (!confirm("清除这张头图？前台该页将不再显示 banner 区域。")) return;
		setBusy(`banner:${page}`);
		try {
			await adminApi.clearPlatformBanner(site.code, page);
			onMsg(true, "头图已清除");
			await after();
		} catch (e) {
			onMsg(false, e instanceof Error ? e.message : "操作失败");
		} finally {
			setBusy("");
		}
	};

	const addSlide = async (file?: File | null) => {
		if (!file) return;
		setBusy("slide:add");
		try {
			const up = await adminApi.uploadFilesFor(site.code, file);
			await adminApi.platformAddSlide(site.code, { pic: up.path, title: "", order: 0 });
			onMsg(true, "已添加一张首页轮播");
			await after();
		} catch (e) {
			onMsg(false, e instanceof Error ? e.message : "添加失败");
		} finally {
			setBusy("");
		}
	};

	const patchSlide = async (id: number, b: { order?: number; isShow?: number; title?: string; link?: string }) => {
		setBusy(`slide:${id}`);
		try {
			await adminApi.platformUpdateSlide(site.code, id, b);
			await after();
		} catch (e) {
			onMsg(false, e instanceof Error ? e.message : "保存失败");
		} finally {
			setBusy("");
		}
	};

	const delSlide = async (id: number) => {
		if (!confirm("删除这张轮播？（前台立即不再显示，图片文件保留）")) return;
		setBusy(`slide:${id}`);
		try {
			await adminApi.platformDelSlide(site.code, id);
			onMsg(true, "轮播已删除");
			await after();
		} catch (e) {
			onMsg(false, e instanceof Error ? e.message : "删除失败");
		} finally {
			setBusy("");
		}
	};

	return (
		<div className="admin-panel media-panel">
			<div className="media-head">
				<h3 style={{ margin: 0 }}>
					素材维护：{site.name}（{site.code}）
				</h3>
				<button className="btn small" onClick={onClose}>
					收起
				</button>
			</div>

			<h4 className="media-sub">内页头图（6 个菜单页，每页一张；留空则前台不显示 banner）</h4>
			{loading ? (
				<div className="empty-tip">加载中…</div>
			) : (
				<div className="banner-grid">
					{banners.map((b) => (
						<div className="banner-slot" key={b.page}>
							{b.url ? (
								<img src={b.updated ? `${b.url}?v=${encodeURIComponent(b.updated)}` : b.url} alt={b.label} />
							) : (
								<div className="banner-slot-empty">未配置（前台不显示）</div>
							)}
							<div className="banner-slot-meta">
								<span>{b.label}</span>
								<label className="btn small">
									{busy === `banner:${b.page}` ? "处理中…" : b.url ? "替换" : "上传"}
									<input
										type="file"
										accept="image/jpeg,image/png,image/gif,image/webp"
										hidden
										disabled={busy === `banner:${b.page}`}
										onChange={(e) => {
											uploadBanner(b.page, e.target.files?.[0] ?? null);
											e.target.value = "";
										}}
									/>
								</label>
								{b.url ? (
									<button
										className="btn small"
										disabled={busy === `banner:${b.page}`}
										onClick={() => clearBanner(b.page)}
									>
										清除
									</button>
								) : null}
							</div>
						</div>
					))}
				</div>
			)}

			<h4 className="media-sub" style={{ marginTop: 22 }}>
				首页 banner 轮播（可多张，排序大的先播）
			</h4>
			<SlideEditor
				items={slides}
				busy={busy}
				onAdd={addSlide}
				onPatch={patchSlide}
				onDelete={delSlide}
			/>
		</div>
	);
}

/** 历史图片清理：桶根无站点前缀的老图（旧站遗留/已删站点目录），只列不被任何内容引用的 */
function OrphanPanel({ onMsg }: { onMsg: (ok: boolean, text: string) => void }) {
	const [busy, setBusy] = useState(false);
	const [data, setData] = useState<Awaited<ReturnType<typeof adminApi.platformOrphans>> | null>(null);

	const scan = async () => {
		setBusy(true);
		try {
			setData(await adminApi.platformOrphans());
		} catch (e) {
			onMsg(false, e instanceof Error ? e.message : "扫描失败");
		} finally {
			setBusy(false);
		}
	};

	const purge = async () => {
		const n = data?.orphans ?? 0;
		if (!n) return;
		if (!window.confirm(`确定删除这 ${n} 张已无引用的历史图片？删除后不可恢复。`)) return;
		setBusy(true);
		try {
			const r = await adminApi.platformPurgeOrphans();
			onMsg(true, `已删除 ${r.deleted} 张历史图片${r.skipped.length ? `，跳过仍在引用的 ${r.skipped.length} 张` : ""}`);
			setData(await adminApi.platformOrphans());
		} catch (e) {
			onMsg(false, e instanceof Error ? e.message : "删除失败");
		} finally {
			setBusy(false);
		}
	};

	const orphans = data?.items.filter((i) => !i.used) ?? [];
	const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

	return (
		<div className="admin-panel" style={{ marginTop: 18 }}>
			<div className="admin-page-head" style={{ marginBottom: 8 }}>
				<h3 style={{ margin: 0 }}>历史图片清理</h3>
			</div>
			<p className="muted" style={{ marginTop: 0 }}>
				桶里没有站点前缀的老图（旧 PHP 站遗留、已删站点的目录）不属于任何站点，本站图片库看不到也删不掉。这里只列<b>没有任何内容引用</b>的那些，仍在用的会自动跳过。
			</p>
			<div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
				<button className="btn" disabled={busy} onClick={scan}>
					{busy ? "处理中…" : "扫描"}
				</button>
				<button className="btn danger" disabled={busy || !orphans.length} onClick={purge}>
					删除全部无引用老图
				</button>
				{data ? (
					<span className="muted" style={{ fontSize: 12 }}>
						扫描 {data.total} 张，无站点前缀 {data.candidates} 张，其中无引用 {data.orphans} 张（{kb(data.size)}），仍被引用 {data.used} 张
					</span>
				) : null}
			</div>
			{orphans.length ? (
				<div className="orphan-list">
					{orphans.slice(0, 60).map((i) => (
						<div className="orphan-item" key={i.key}>
							<span className="orphan-key">{i.key}</span>
							<span className="muted">{kb(i.size)}</span>
							<span className="muted">{i.uploaded ? String(i.uploaded).slice(0, 10) : ""}</span>
						</div>
					))}
					{orphans.length > 60 ? <div className="empty-tip">仅显示前 60 条，删除时按扫描结果全部处理</div> : null}
				</div>
			) : data && !data.orphans ? (
				<div className="empty-tip">没有可清理的历史图片</div>
			) : null}
		</div>
	);
}
