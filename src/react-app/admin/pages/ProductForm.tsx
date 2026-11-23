// 产品新增 / 编辑共用整页表单：/admin/products/add 与 /admin/products/edit/:id 都是它
// 之前新增在整页组件里、编辑在列表页的 modal 里各写一遍字段，容易漂移，这里合成一套。
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ImageField from "../components/ImageField";
import { adminApi, type AdminProduct, type ProType } from "../api";

const EMPTY: AdminProduct = {
	id: 0,
	name: "",
	content: "",
	memo: "",
	noteTime: "",
	smallPic: "",
	isShow: 1,
	isCommend: 0,
	order: 0,
	typeId: 0,
	hits: 0,
	webTitle: "",
	webKey: "",
	webDesc: "",
	bh: "",
	bz: "",
};

export default function ProductForm() {
	const nav = useNavigate();
	const params = useParams();
	const editId = Number(params.id ?? 0);
	const isEdit = editId > 0;
	const [form, setForm] = useState<AdminProduct>(EMPTY);
	const [types, setTypes] = useState<ProType[]>([]);
	const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
	const [busy, setBusy] = useState(false);
	const [loading, setLoading] = useState(isEdit);

	useEffect(() => {
		adminApi
			.productTypes()
			.then((d) => setTypes(d.items))
			.catch(() => {});
	}, []);

	useEffect(() => {
		if (!isEdit) return;
		setLoading(true);
		adminApi
			.getProduct(editId)
			.then((d) => setForm({ ...EMPTY, ...d.product }))
			.catch((e) => setMsg({ ok: false, text: e instanceof Error ? e.message : "加载产品失败" }))
			.finally(() => setLoading(false));
	}, [editId, isEdit]);

	const set = (k: keyof AdminProduct, v: string | number) => setForm((f) => ({ ...f, [k]: v }));

	const save = async () => {
		if (!form.name.trim()) {
			setMsg({ ok: false, text: "产品名不能为空" });
			return;
		}
		setBusy(true);
		try {
			if (isEdit) {
				await adminApi.updateProduct(editId, form);
				setMsg({ ok: true, text: "已保存" });
			} else {
				const d = await adminApi.addProduct(form);
				setMsg({ ok: true, text: `产品已保存（ID ${d.id}）` });
			}
			setTimeout(() => nav("/admin/products/list"), 800);
		} catch (e) {
			setMsg({ ok: false, text: e instanceof Error ? e.message : "保存失败" });
		} finally {
			setBusy(false);
		}
	};

	return (
		<div>
			<div className="admin-page-head">
				<h2>{isEdit ? `编辑产品 #${editId}` : "产品添加"}</h2>
			</div>

			{msg ? <div className={`admin-msg ${msg.ok ? "ok" : "err"}`}>{msg.text}</div> : null}

			<div
				className="admin-panel"
				style={{ maxWidth: 860, display: "flex", flexDirection: "column", gap: 12, padding: 18 }}
			>
				{loading ? <div className="empty-tip">加载中…</div> : null}
				<div className="admin-field">
					<label>产品名 *</label>
					<input value={form.name} onChange={(e) => set("name", e.target.value)} maxLength={200} />
				</div>
				<div className="admin-row">
					<div className="admin-field">
						<label>分类</label>
						<select value={form.typeId} onChange={(e) => set("typeId", Number(e.target.value))}>
							<option value={0}>未分类</option>
							{types.map((t) => (
								<option key={t.id} value={t.id}>
									{t.level ? "　" : ""}
									{t.name}
								</option>
							))}
						</select>
					</div>
					<div className="admin-field">
						<label>编号（BH）</label>
						<input value={form.bh} onChange={(e) => set("bh", e.target.value)} placeholder="产品编号" />
					</div>
					<div className="admin-field">
						<label>标准（BZ）</label>
						<input value={form.bz} onChange={(e) => set("bz", e.target.value)} placeholder="执行标准" />
					</div>
				</div>
				<div className="admin-row">
					<div className="admin-field">
						<label>排序（大靠前）</label>
						<input type="number" value={form.order} onChange={(e) => set("order", Number(e.target.value) || 0)} />
					</div>
					<div className="admin-field">
						<label>状态</label>
						<select value={form.isShow} onChange={(e) => set("isShow", Number(e.target.value))}>
							<option value={1}>显示</option>
							<option value={0}>隐藏</option>
						</select>
					</div>
					<div className="admin-field">
						<label>首页推荐</label>
						<select value={form.isCommend} onChange={(e) => set("isCommend", Number(e.target.value))}>
							<option value={0}>否</option>
							<option value={1}>是</option>
						</select>
					</div>
				</div>
				<ImageField
					label="产品缩略图"
					value={form.smallPic}
					onChange={(p) => set("smallPic", p)}
					hint="建议 800×600 以内，jpg/png/webp，≤5MB"
				/>
				<div className="admin-row">
					<div className="admin-field">
						<label>SEO 标题</label>
						<input value={form.webTitle} onChange={(e) => set("webTitle", e.target.value)} />
					</div>
					<div className="admin-field">
						<label>SEO 关键词</label>
						<input value={form.webKey} onChange={(e) => set("webKey", e.target.value)} />
					</div>
				</div>
				<div className="admin-field">
					<label>SEO 描述</label>
					<input value={form.webDesc} onChange={(e) => set("webDesc", e.target.value)} />
				</div>
				<div className="admin-field">
					<label>正文（HTML）</label>
					<textarea value={form.content} onChange={(e) => set("content", e.target.value)} style={{ minHeight: 200 }} />
					<div className="muted" style={{ fontSize: 12 }}>
						图片请用完整上传后的 /assets 路径；保存时后端会自动把外链图片搬到本站目录。
					</div>
				</div>
				<div className="admin-field">
					<label>备注</label>
					<input value={form.memo} onChange={(e) => set("memo", e.target.value)} />
				</div>
				<div className="modal-foot">
					<button className="btn" onClick={() => nav("/admin/products/list")}>
						取消
					</button>
					<button className="btn primary" disabled={busy || loading} onClick={save}>
						{busy ? "保存中…" : isEdit ? "保存修改" : "保存产品"}
					</button>
				</div>
			</div>
		</div>
	);
}
