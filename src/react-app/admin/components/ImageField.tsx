// 图片字段：上传到 R2 后把返回的键写进表单，不再手填路径
// value 存的是裸键（如 bjrobust/upload/2026/11/23/xxx.jpg），渲染时由 imgUrl 拼成 /assets/
import { useState } from "react";
import { assetUrl } from "../../api";
import { adminApi } from "../api";

export default function ImageField({
	label,
	value,
	onChange,
	hint,
	ratio = "16 / 9",
	siteCode,
}: {
	label: string;
	value: string;
	onChange: (path: string) => void;
	hint?: string;
	ratio?: string;
	/** 指定上传到哪个站点目录（平台编辑其他站点时传；不传 = 当前生效站点） */
	siteCode?: string;
}) {
	const [busy, setBusy] = useState(false);
	const [err, setErr] = useState("");
	const [manual, setManual] = useState(false);

	const upload = async (file?: File | null) => {
		if (!file) return;
		setBusy(true);
		setErr("");
		try {
			const d = siteCode ? await adminApi.uploadFilesFor(siteCode, file) : await adminApi.uploadFiles(file);
			onChange(d.path);
		} catch (e) {
			setErr(e instanceof Error ? e.message : "上传失败");
		} finally {
			setBusy(false);
		}
	};

	return (
		<div className="admin-field">
			<label>{label}</label>
			<div className="imgfield">
				<div className="imgfield-thumb" style={{ aspectRatio: ratio }}>
					{value ? <img src={assetUrl(value)} alt="" /> : <span className="muted">未选择图片</span>}
				</div>
				<div className="imgfield-ops">
					<label className={`btn small${busy ? " disabled" : ""}`}>
						{busy ? "上传中…" : value ? "替换图片" : "上传图片"}
						<input
							type="file"
							accept="image/jpeg,image/png,image/gif,image/webp"
							hidden
							disabled={busy}
							onChange={(e) => {
								upload(e.target.files?.[0] ?? null);
								e.currentTarget.value = "";
							}}
						/>
					</label>
					{value ? (
						<button className="btn small" type="button" onClick={() => onChange("")}>
							清除
						</button>
					) : null}
					<button className="btn small" type="button" onClick={() => setManual((v) => !v)}>
						{manual ? "收起路径" : "手填路径"}
					</button>
				</div>
				{manual ? (
					<input
						value={value}
						onChange={(e) => onChange(e.target.value)}
						placeholder="bjrobust/upload/2026/11/23/xxx.jpg 或 https://..."
						style={{ marginTop: 8 }}
					/>
				) : (
					<div className="muted" style={{ fontSize: 12 }}>
						{value ? `已选：${value}` : hint || "支持 jpg/png/gif/webp，≤5MB，自动存入本站目录"}
					</div>
				)}
				{err ? <div className="admin-msg err" style={{ marginTop: 6 }}>{err}</div> : null}
			</div>
		</div>
	);
}
