// 分页组件
type Props = {
	page: number;
	pageSize: number;
	total: number;
	onChange: (p: number) => void;
};

export default function Pager({ page, pageSize, total, onChange }: Props) {
	const pages = Math.max(Math.ceil(total / pageSize), 1);
	if (pages <= 1) return null;
	const end = Math.min(pages, Math.max(page, 3) + 2);
	const start = Math.max(1, end - 4);
	const nums: number[] = [];
	for (let i = start; i <= end; i++) nums.push(i);
	return (
		<div className="pager">
			<button disabled={page <= 1} onClick={() => onChange(page - 1)}>
				上一页
			</button>
			{nums.map((n) => (
				<button key={n} className={n === page ? "on" : ""} onClick={() => onChange(n)}>
					{n}
				</button>
			))}
			<button disabled={page >= pages} onClick={() => onChange(page + 1)}>
				下一页
			</button>
		</div>
	);
}
