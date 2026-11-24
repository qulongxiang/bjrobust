-- t_global 之前没有唯一约束：同一个 (SiteId, Language) 可能落多条（历史遗留 id=2 的 ZZSITE/t/k 就是这种）。
-- 前台读的是 ORDER BY id LIMIT 1，所以保留 MIN(id) 那一行、删掉其余重复行，语义不变；
-- 之后加唯一索引，模板初始化/后台保存就不会再产生重复行。
DELETE FROM "t_global"
WHERE "id" NOT IN (SELECT MIN("id") FROM "t_global" GROUP BY "SiteId", "Language");

CREATE UNIQUE INDEX IF NOT EXISTS "idx_t_global_site_lang" ON "t_global" ("SiteId", "Language");
