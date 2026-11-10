// 图片库（R2）：上传 / 预览 / 复制路径 / 删除
import { useCallback, useEffect, useRef, useState } from "react";
import { adminApi, type UploadFile } from "../api";

export default function UploadAdmin() {
	const [items, setItems] = useState<UploadFile[]>([]);
	const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
	const [uploading, setUploading] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	const flash = (ok: boolean, text: string) => {
		setMsg({ ok, text });
		setTimeout(() => setMsg(null), 4000);
	};

	const load = useCallback(async () => {
		try {
			const d = await adminApi.uploadList();
			setItems(d.items);
		} catch (e) {
			flash(false, e instanceof Error ? e.message : "加载失败");
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	useEffect(() => {
		load();
	}, [load]);

	const upload = async (file: File) => {
		setUploading(true);
		try {
			const d = await adminApi.uploadFiles(file);
			flash(true, `已上传：${d.path}`);
			await load();
		} catch (e) {
			flash(false, e instanceof Error ? e.message : "上传失败");
		} finally {
			setUploading(false);
		}
	};

	const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
		const files = e.target.files;
		if (!files) return;
		for (const f of Array.from(files)) void upload(f);
		e.target.value = "";
	};

	const remove = async (key: string) => {
		if (!confirm(`确定删除 ${key}？`)) return;
		try {
			await adminApi.delUpload(key);
			flash(true, "已删除");
			await load();
		} catch (e) {
			flash(false, e instanceof Error ? e.message : "删除失败");
		}
	};

	const copyPath = async (key: string) => {
		try {
			await navigator.clipboard.writeText(key.replace(/^upload\//, "/upload/"));
			flash(true, "路径已复制");
		} catch {
			flash(false, "复制失败，请手动复制");
		}
	};

	return (
		<div>
			<div className="admin-page-head">
				<h2>图片库（R2）</h2>
			</div>

			{msg ? <div className={`admin-msg ${msg.ok ? "ok" : "err"}`}>{msg.text}</div> : null}

			<div
				className="upload-drop"
				onClick={() => inputRef.current?.click()}
				onDragOver={(e) => e.preventDefault()}
				onDrop={(e) => {
					e.preventDefault();
					for (const f of Array.from(e.dataTransfer.files)) void upload(f);
				}}
			>
				{uploading ? "上传中…" : "点击选择或拖拽图片到此处上传（存入 R2，路径前缀 upload/）"}
			</div>
			<input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={onPick} />

			{items.length ? (
				<div className="upload-grid">
					{items.map((f) => (
						<div className="upload-item" key={f.key}>
							<img src={`/assets/${f.key}`} alt={f.key} loading="lazy" />
							<div className="info" title={f.key}>
								{f.key}（{(f.size / 1024).toFixed(0)}KB）
							</div>
							<div style={{ padding: "0 8px 8px", display: "flex", gap: 6 }}>
								<button className="btn small" style={{ flex: 1 }} onClick={() => copyPath(f.key)}>
									复制路径
								</button>
								<button className="btn small danger" onClick={() => remove(f.key)}>
									删
								</button>
							</div>
						</div>
					))}
				</div>
			) : (
				<div className="empty-tip">暂无图片</div>
			)}
		</div>
	);
}
