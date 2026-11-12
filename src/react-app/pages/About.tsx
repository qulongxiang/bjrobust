// 关于我们（静态页：t_content 公司概况）
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import PageHero from "../components/PageHero";

export default function About() {
	const [content, setContent] = useState("");
	const [failed, setFailed] = useState(false);

	useEffect(() => {
		api
			.staticPage("公司概况")
			.then((d) => setContent(d.content))
			.catch(() => setFailed(true));
	}, []);

	return (
		<>
			<PageHero
				title="关于我们"
				crumb={
					<>
						<Link to="/">首页</Link> / 关于我们
					</>
				}
			/>

			<section className="section">
				<div className="container">
					{failed ? (
						<div className="empty">页面不存在</div>
					) : content ? (
						<div className="rich static-page" dangerouslySetInnerHTML={{ __html: content }} />
					) : (
						<div className="empty">加载中…</div>
					)}
				</div>
			</section>
		</>
	);
}
