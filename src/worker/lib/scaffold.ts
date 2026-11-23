// 新建站点时生成空白模板内容（与 tools/migrate_multisite.mjs 的占位文案保持一致）
import type { AppEnv } from "../env";
import { nowSql } from "./auth";
import { exec, rows } from "./d1";

export type ScaffoldInput = { name: string; companyName: string };

const PLACEHOLDER_PAGES = (company: string): [string, string][] => [
	["首页公司简介", `<p>${company}欢迎您。此处为首页简介占位文案，请在后台「站点设置 → 静态页」中修改。</p>`],
	["公司概况", `<p>这里放公司概况。请在后台「站点设置 → 静态页」中替换为真实介绍。</p>`],
	["联系我们", `<p>地址：待填写<br>电话：待填写<br>邮箱：待填写</p>`],
	["底部版权", `<p>© ${company} 版权所有</p>`],
	["首页联系方式", `<p>地址：待填写<br>电话：待填写</p>`],
	["二维码", ""],
];

const PLACEHOLDER_TYPES = ["产品分类一", "产品分类二", "产品分类三"];

/** 是否已经有内容（有 t_global 即认为已初始化） */
export async function hasContent(env: AppEnv, siteId: number): Promise<boolean> {
	const g = await rows(env.DB.prepare('SELECT id FROM t_global WHERE "SiteId" = ? LIMIT 1').bind(siteId));
	return g.length > 0;
}

/** 生成空白模板；已初始化则跳过并返回 false */
export async function scaffoldSite(env: AppEnv, siteId: number, input: ScaffoldInput): Promise<boolean> {
	if (await hasContent(env, siteId)) return false;
	const db = env.DB;
	const ts = nowSql();
	const company = input.companyName || input.name;

	await exec(
		db.prepare(
			`INSERT INTO t_global ("Webname","Title","Keywords","Description","Beian","Upload","Web","Language","SiteId")
			 VALUES (?,?,?,?,?,?,?,?,?)`,
		),
		input.name,
		company,
		`${company}、产品中心、联系我们`,
		`${company}官网，欢迎访问。`,
		"",
		"upload",
		"",
		"cn",
		siteId,
	);

	for (const [called, html] of PLACEHOLDER_PAGES(company)) {
		await exec(
			db.prepare(
				`INSERT INTO t_content ("Called","NoteTime","Content","Language","SiteId") VALUES (?,?,?,?,?)`,
			),
			called,
			ts,
			html,
			"cn",
			siteId,
		);
	}

	for (let i = 0; i < PLACEHOLDER_TYPES.length; i++) {
		await exec(
			db.prepare(
				`INSERT INTO t_protype ("Called","PicUrl","OrderBy","IsShow","Memo","PID","TypeLevel","Language","ParentPath","NoteTime","SiteId")
				 VALUES (?,?,?,1,?,0,0,?,?,?,?)`,
			),
			PLACEHOLDER_TYPES[i],
			"",
			PLACEHOLDER_TYPES.length - i,
			"",
			"cn",
			"",
			ts,
			siteId,
		);
	}

	await exec(
		db.prepare(
			`INSERT INTO t_news ("Title","NoteTime","Content","UserName","IsShow","IsCommend","OrderBy","NewType","Hits","Language","Parent","SmallPic","WebTitle","WebKey","WebDesc","ShowTime","SJ","LINK","DOWN","MEMO","SiteId")
			 VALUES (?,?,?,?,1,0,0,3,0,?,0,?,?,?,?,?,?,?,?,?,?)`,
		),
		"欢迎访问本站",
		ts,
		"<p>这是站点创建时自动生成的欢迎内容，请在后台「新闻/案例」中修改或删除。</p>",
		"admin",
		"cn",
		"",
		"欢迎访问本站",
		"",
		"",
		ts,
		"",
		"",
		"",
		"",
		siteId,
	);
	return true;
}
