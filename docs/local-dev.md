# 本地开发指南

原 PHP 站（php-scripts）迁移到 Cloudflare Workers 后的本地运行说明。

## 环境要求

- Node.js 24+（本机：`D:\software\nodejs`）
- PHP 8.5（仅重新导出数据时需要：`D:\software\php-8.5.12\php.exe`）
- 能访问原数据库 `172.16.20.243:24306`（仅重新导出时需要）

## 日常运行

```bash
npm install        # 首次
npm run dev        # 启动：前台 http://localhost:5173/  后台 http://localhost:5173/admin
```

| 项目 | 值 |
|---|---|
| 后台地址 | http://localhost:5173/admin |
| 本地测试账号 | `admin` / `Bjrobust@2026` |
| 生产账号密码 | 与原数据库 `t_admin` 中的 bcrypt 哈希一致（即原 PHP 站的后台密码） |

> 本地 D1 是原库数据的完整副本，测试产生的改动都在本地文件
> `.wrangler/state/v3/` 里，随时可一键还原（见下）。

## 一键还原本地数据（改动搞乱了就执行）

```bash
# 1) 先停掉 dev（Ctrl+C）
node tools/reset_local_db.mjs            # 默认重置 admin / Bjrobust@2026
node tools/reset_local_db.mjs 自定义密码  # 或指定测试密码
# 2) npm run dev
```

## 重新从原库导出数据（原站数据有更新时）

```bash
# 1) 导出（需要 PHP + 数据库可达），生成 tools/data.json
D:/software/php-8.5.12/php.exe tools/export_data.php

# 2) 本地重建
node tools/reset_local_db.mjs

# 3) 部署到生产 D1（需要 Cloudflare 凭据，见下）
set CLOUDFLARE_API_TOKEN=你的token
set CLOUDFLARE_ACCOUNT_ID=你的账号ID
set D1_DATABASE_ID=生产数据库ID
node tools/migrate.mjs remote
```

## 重新导入历史图片到本地 R2（本地 R2 被清空时）

```bash
# 先停 dev
node tools/r2_import.mjs
# 再 npm run dev
```

图片读取逻辑：库里 `SmallPic` 字段是裸文件名（`2019040911344838.jpg`），
`/assets/<文件名>` 会自动回退尝试 `upload/<文件名>`；富文本里的
`/upload/xxx.jpg` 会由前端统一转成 `/assets/upload/xxx.jpg`。

## 常见问题：页面有壳但 API 全部 500（no such table）

本地 dev 的 D1 库文件按配置哈希命名。一旦改动 `wrangler.json` 的 D1 配置
（典型场景：把占位 `database_id` 改成生产 ID），miniflare 重启后会**新建一个空的本地库文件**，
旧数据文件被晾在一边，表现就是页面能打开但所有接口 500。

处理（工具脚本已能自动选对文件）：

```bash
# 停 dev 后执行
node tools/reset_local_db.mjs   # 会自动使用最近更新的 D1 文件
npm run dev
# 多余的旧库文件可在 .wrangler/state/v3/d1/miniflare-D1DatabaseObject/ 里删除
```

## 本地开发密钥

`.dev.vars`（已在 .gitignore）：

```
JWT_SECRET=...   # 本地会话签名密钥，生产必须换成随机值（wrangler secret put JWT_SECRET）
```

## 生产部署（Cloudflare 账号操作）

当前生产状态（2026-11-11 起）：**已上线，未接 R2**。D1 数据已灌完，Worker 正常；
`wrangler.json` 里的 R2 绑定已临时移除，图片接口 404，前端显示灰色占位图（main.tsx 顶部）。

### 初始部署步骤（已完成，留档）

```bash
npx wrangler login                      # 浏览器 OAuth 登录
npx wrangler d1 create bjrobust-db      # 记下输出的 database_id，填回 wrangler.json
node tools/migrate.mjs remote           # 灌数据（用上面导出的最新 data.json）
npx wrangler secret put JWT_SECRET      # 输入随机长字符串
npm run build                           # 产出 dist/client + dist/worker
npx wrangler deploy
```

### 恢复 R2（账号开通 R2 后执行）

```bash
# 1) dashboard 开通 R2（免费计划即可）
# 2) 建桶
npx wrangler r2 bucket create bjrobust-images
# 3) 在 wrangler.json 的 d1_databases 之后加回绑定：
#    "r2_buckets": [ { "binding": "IMAGES", "bucket_name": "bjrobust-images" } ]
# 4) 重新生成类型（env.ts 里可用生成的 R2Bucket 替换 R2BucketLike）
npx wrangler types && npx tsc -b
# 5) 推送 547 张历史图片（token 从 wrangler 凭据读取，勿打印）
TOKEN=$(grep -oP 'oauth_token\s*=\s*"\K[^"]+' "$HOME/AppData/Roaming/xdg.config/.wrangler/config/default.toml" | head -1)
CLOUDFLARE_API_TOKEN="$TOKEN" CLOUDFLARE_ACCOUNT_ID=ea1fab4be92f6b0809efef4bd03c5341 \
  node tools/r2_push_remote.mjs
# 6) 重新构建部署（可选：同时删掉 main.tsx 里的占位图逻辑）
npm run build && npx wrangler deploy
```

### 本机网络备注

- GitHub SSH 22 端口被封，已配 `~/.ssh/config` 走 `ssh.github.com:443`
- `*.workers.dev` 的出口 IP 本机 TCP 直连超时（CF 官方端点正常）；
  验证线上运行时可用 `npx wrangler dev --remote`（本地 worker + 生产 D1），
  或从其他网络（如手机流量）访问 workers.dev 地址；长期方案建议绑定自己的域名

## 代码结构

```
src/worker/           Hono API（workerd 运行时）
  index.ts            路由挂载 + 静态资源/SPA fallback
  lib/auth.ts         JWT 会话 + bcrypt 校验 + 登录限流
  lib/d1.ts           D1 查询封装
  routes/site.ts      前台 API（/api/site/*）+ R2 图片（/assets/*）
  routes/admin-*.ts   后台 API（/api/admin/*，JWT 守卫）
src/react-app/        React 19 SPA
  App.tsx / pages/    前台页面
  AdminApp.tsx / admin/  后台页面
tools/
  export_data.php     MariaDB → tools/data.json
  migrate.mjs         data.json → D1（local / remote 两种模式）
  r2_import.mjs       原站 upload/ → 本地 R2
  reset_local_db.mjs  一键重建本地 D1
```
