// 应用级 Env：在 wrangler 生成的全局 Env（DB/IMAGES）基础上补充 secret
export type AppEnv = Env & {
	JWT_SECRET: string;
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
