# 已下线（2026-11-23）：原脚本调用线上 /api/maint/storage/migrate，该接口已从 Worker 移除。
#
# 旧对象（上一版布局 upload/<code>/…、桶根裸文件名）已经全部清理完毕，历史迁移任务结束。
# 之后要做存储运维（列对象 / 对账 / 删对象），在本地跑：
#
#   node tools/storage_admin.mjs list [--prefix bjrobust/upload/]
#   node tools/storage_admin.mjs orphans            # R2 孤儿 + 库内坏引用
#   node tools/storage_admin.mjs prune --file keys.txt --yes
#
# 需要鉴权：wrangler 已登录（oauth_token 在 %APPDATA%\xdg.config\.wrangler\config\default.toml），
# 或设 CLOUDFLARE_API_TOKEN。本文件保留仅为提示，不再执行任何远程写操作。

Write-Host 'purge_legacy.ps1 已废弃，请改用 tools\storage_admin.mjs（见脚本头部注释）。'
exit 1
