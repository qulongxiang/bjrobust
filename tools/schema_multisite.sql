-- 多站点（多租户）表结构 —— 与 tools/migrate_multisite.mjs 内的语句保持一致
-- 说明：这是可读的镜像文档，实际执行以 migrate_multisite.mjs 为准（它同时支持 local / remote）

-- ============ 1. 站点注册表 ============
CREATE TABLE IF NOT EXISTS "t_sites" (
	"id" INTEGER NOT NULL PRIMARY KEY,
	"Code" TEXT NOT NULL,          -- bjrobust / aaaa / bbbb：用于 R2 前缀、内部标识，小写 [a-z0-9-]
	"Name" TEXT NOT NULL,          -- 后台显示名
	"CompanyName" TEXT NOT NULL,   -- 前台上网欢迎语、Logo 文案
	"Hotline" TEXT NOT NULL,
	"Email" TEXT NOT NULL,
	"LogoUrl" TEXT NOT NULL,       -- /assets/... 或 https://
	"Theme" TEXT NOT NULL,         -- JSON: {"primary":"#14508c","primaryDark":"#0e3c6e","accent":"#ff9f00"}
	"IsActive" INTEGER NOT NULL,   -- 1 启用 / 0 停用（停用后该域名返回 503 页面）
	"Sort" INTEGER NOT NULL,
	"CreatedAt" TEXT NOT NULL,
	"UpdatedAt" TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "ux_t_sites_Code" ON "t_sites" ("Code");

-- ============ 2. 域名 → 站点映射 ============
CREATE TABLE IF NOT EXISTS "t_site_domain" (
	"id" INTEGER NOT NULL PRIMARY KEY,
	"SiteId" INTEGER NOT NULL,
	"Host" TEXT NOT NULL,          -- 小写、不含端口、不含协议，如 bjrobust.qlxtools.asia
	"IsPrimary" INTEGER NOT NULL,
	"CreatedAt" TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "ux_t_site_domain_Host" ON "t_site_domain" ("Host");
CREATE INDEX IF NOT EXISTS "idx_t_site_domain_SiteId" ON "t_site_domain" ("SiteId");

-- ============ 3. 内容表加租户维度（存量数据默认归属站点 1 = bjrobust） ============
-- t_news / t_products / t_protype / t_img / t_content / t_global / t_feedback / t_log
-- ALTER TABLE "t_news" ADD COLUMN "SiteId" INTEGER NOT NULL DEFAULT 1;
-- ALTER TABLE "t_products" ADD COLUMN "SiteId" INTEGER NOT NULL DEFAULT 1;
-- ALTER TABLE "t_protype" ADD COLUMN "SiteId" INTEGER NOT NULL DEFAULT 1;
-- ALTER TABLE "t_img" ADD COLUMN "SiteId" INTEGER NOT NULL DEFAULT 1;
-- ALTER TABLE "t_content" ADD COLUMN "SiteId" INTEGER NOT NULL DEFAULT 1;
-- ALTER TABLE "t_global" ADD COLUMN "SiteId" INTEGER NOT NULL DEFAULT 1;
-- ALTER TABLE "t_feedback" ADD COLUMN "SiteId" INTEGER NOT NULL DEFAULT 1;
-- ALTER TABLE "t_log" ADD COLUMN "SiteId" INTEGER NOT NULL DEFAULT 1;
-- CREATE INDEX IF NOT EXISTS "idx_t_news_SiteId" ON "t_news" ("SiteId");
-- ...（每张表一条索引，脚本自动补）

-- ============ 4. 管理员加租户维度 ============
-- SiteId = 0 → 平台超管，可在任意域名登录、管理所有站点
-- SiteId > 0 → 站点管理员，只能管理自己站点
-- ALTER TABLE "t_admin" ADD COLUMN "SiteId" INTEGER NOT NULL DEFAULT 0;
-- CREATE INDEX IF NOT EXISTS "idx_t_admin_SiteId" ON "t_admin" ("SiteId");

-- 说明：t_newtype（新闻分类）是结构性字典，保持全局唯一，不按站点拆分；
--       t_dict / t_config / t_plugin 等旧站残留表本次不动。
