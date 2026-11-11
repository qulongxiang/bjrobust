// R2 最小结构类型（R2 未开通期间 wrangler.json 无 IMAGES 绑定；
// 开通后恢复绑定 + npx wrangler types，即可用生成的 R2Bucket 类型替换）
export type R2BucketLike = {
	get(key: string): Promise<{ body: ReadableStream; httpMetadata?: { contentType?: string } } | null>;
	put(
		key: string,
		value: ReadableStream | ArrayBuffer | ArrayBufferView | string,
		options?: { httpMetadata?: { contentType?: string } },
	): Promise<unknown>;
	list(options?: { prefix?: string; limit?: number }): Promise<{
		objects: { key: string; size: number; uploaded: string }[];
	}>;
	delete(key: string | string[]): Promise<void>;
};

// 应用级 Env：在 wrangler 生成的全局 Env（DB）基础上补充 secret 与可选 R2
export type AppEnv = Env & {
	JWT_SECRET: string;
	/** R2 未开通时为 undefined：图片接口 404、上传接口 503 */
	IMAGES?: R2BucketLike;
};

export type AdminInfo = {
	id: number;
	UserName: string;
	UserRole: string;
	UserRoleCalled: string;
};

export type AdminVariables = {
	admin: AdminInfo;
};
