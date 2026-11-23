// 首页轮播编辑器：两处复用（站点设置里改本站、平台管理里改指定站点）
import type { SlideItem } from "../api";

export default function SlideEditor({
	items,
	busy,
	onAdd,
	onPatch,
	onDelete,
}: {
	items: SlideItem[];
	/** 正在处理的键：slide:add 或 slide:<id> */
	busy: string;
	onAdd: (file: File) => void;
	onPatch: (id: number, b: { order?: number; isShow?: number; title?: string; link?: string }) => void;
	onDelete: (id: number) => void;
}) {
	return (
		<div className="slide-list">
			{items.map((s) => (
				<div className="slide-row" key={s.id}>
					<div className="slide-thumb">{s.url ? <img src={s.url} alt="" /> : <span className="muted">无图</span>}</div>
					<div className="slide-fields">
						<input
							placeholder="标题（可留空，前台不显示文字）"
							defaultValue={s.title}
							onBlur={(e) => {
								if (e.target.value !== s.title) onPatch(s.id, { title: e.target.value });
							}}
						/>
						<input
							placeholder="点击跳转链接（可留空）"
							defaultValue={s.link}
							onBlur={(e) => {
								if (e.target.value !== s.link) onPatch(s.id, { link: e.target.value });
							}}
						/>
					</div>
					<div className="slide-ops">
						<input
							type="number"
							title="排序（大的先播）"
							defaultValue={s.order}
							style={{ width: 70 }}
							onBlur={(e) => {
								const v = Number(e.target.value) || 0;
								if (v !== s.order) onPatch(s.id, { order: v });
							}}
						/>
						<button className="btn small" disabled={busy === `slide:${s.id}`} onClick={() => onPatch(s.id, { isShow: s.isShow ? 0 : 1 })}>
							{s.isShow ? "隐藏" : "显示"}
						</button>
						<button className="btn small danger" disabled={busy === `slide:${s.id}`} onClick={() => onDelete(s.id)}>
							删除
						</button>
					</div>
				</div>
			))}
			{!items.length ? <div className="empty-tip">还没有轮播图，前台首页不显示轮播区域</div> : null}
			<label className="btn small slide-add">
				{busy === "slide:add" ? "上传中…" : "+ 上传一张轮播图"}
				<input
					type="file"
					accept="image/jpeg,image/png,image/gif,image/webp"
					hidden
					disabled={busy === "slide:add"}
					onChange={(e) => {
						const f = e.target.files?.[0];
						if (f) onAdd(f);
						e.currentTarget.value = "";
					}}
				/>
			</label>
		</div>
	);
}
