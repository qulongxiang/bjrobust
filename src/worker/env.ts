// R2 最小结构类型（R2 未开通期间 wrangler.json 无 IMAGES 绑定；
// 开通后恢复绑定 + npx wrangler types，即可用生成的 R2Bucket 类型替换）
export type R2ObjectLike = {
	key: string;
	size: number;
	uploaded?: Date | string;
	httpMetadata?: { contentType?: string };
	customMetadata?: Record<string, string>;
	body: ReadableStream;
};

export type R2BucketLike = {
	get(key: string): Promise<R2ObjectLike | null>;
	put(
		key: string,
		value: ReadableStream | ArrayBuffer | ArrayBufferView | string,
		options?: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> },
	): Promise<unknown>;
	list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{
		objects: { key: string; size: number; uploaded?: Date | string }[];
		truncated?: boolean;
		cursor?: string;
	}>;
	head(key: string): Promise<{ size: number; uploaded?: Date | string } | null>;
	delete(key: string | string[]): Promise<void>;
};

// 应用级 Env：在 wrangler 生成的全局 Env（DB）基础上补充 secret 与可选 R2
export type AppEnv = Env & {
	JWT_SECRET: string;
	/** R2 未开通时为 undefined：图片接口 404、上传接口 503 */
	IMAGES?: R2BucketLike;
	/** 一次性维护令牌：只有设置了才允许用 X-Maint-Token 走维护接口（用完删掉） */
	MAINT_TOKEN?: string;
	/** 未知域名回落到哪个站点 Code（默认 bjrobust） */
	SITE_DEFAULT?: string;
	/** 本地开发用：JSON {"localhost:5173":"bjrobust"}，把 Host 硬映射到站点 */
	SITE_HOST_MAP?: string;
	/** 本地开发用：允许 X-Site-Code 头 / __site 查询参数覆盖 Host 解析（"1" 开启） */
	ALLOW_SITE_OVERRIDE?: string;
	/** 旧布局兼容：upload/<code>/…、upload/<文件名> 等回退是否打开（"1" = 开，默认关） */
	LEGACY_LOOKUP?: string;
	/** 租户查询护栏：缺 SiteId 的租户表查询是否直接抛错（"strict" = 抛错，默认只告警） */
	DB_GUARD?: string;
};

export type SiteTheme = {
	primary?: string;
	primaryDark?: string;
	accent?: string;
};

/** 一个站点（租户）的对外信息 */
export type SiteInfo = {
	id: number;
	code: string;
	name: string;
	companyName: string;
	hotline: string;
	email: string;
	logoUrl: string;
	theme: SiteTheme;
	isActive: number;
};

export type AdminInfo = {
	id: number;
	UserName: string;
	UserRole: string;
	UserRoleCalled: string;
	/** 0 = 平台超管（可管理所有站点）；>0 = 站点管理员 */
	siteId: number;
};

export type AdminVariables = {
	admin: AdminInfo;
	/** 当前请求生效的站点（前台 = Host 对应站点；后台 = 管理员归属站点或超管切换的站点） */
	site: SiteInfo;
	/** 当前生效站点的 id（= site.id） */
	siteId: number;
};
