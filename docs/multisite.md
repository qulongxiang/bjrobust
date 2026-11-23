# 多站点（一套代码，多公司站点）

一套 Worker + 一份前端产物，按访问域名（Host）自动切换到对应公司的站点：内容、品牌、主题色全部来自数据库，不需要为每家复制一份代码或再建一个 Worker。

当前已登记的站点：

| Code | 公司 | 域名 | 主题主色 |
| --- | --- | --- | --- |
| `bjrobust` | 北京罗巴斯特科技有限公司 | `bjrobust.qlxtools.asia` | #14508c |
| `aaaa` | 站点 A（空白模板） | `aaaa.qlxtools.asia` | #1f7a5c |
| `bbbb` | 站点 B（空白模板） | `bbbb.qlxtools.asia` | #7a2f4f |

## 1. 数据模型

单库多租户：所有内容表加一列 `SiteId`，不搞每站一个库。理由是一套 D1 更好备份、更好做统一后台；`SiteId` 上有索引，量级（几十万行）完全够用。

| 表 | 作用 | 说明 |
| --- | --- | --- |
| `t_sites` | 站点（租户）主表 | `Code` 唯一，`Theme` 存 JSON 主题色，`IsActive=0` 即整站 503 |
| `t_site_domain` | 域名 → 站点 | `Host` 唯一（小写、去 `www.`、去端口），一个站点可绑多个域名 |
| `t_throttle` | 登录限流计数 | 跨节点生效，替代原先的 isolate 内存计数 |
| `t_banner` | 内页头图 | 每站每个页面一行（`SiteId` + `Page` 唯一），`Pic` 为 R2 键；`Pic` 为空表示该页不配图，前台用主题渐变底 |
| `t_news` / `t_products` / `t_protype` / `t_img` / `t_content` / `t_global` / `t_feedback` / `t_log` | 业务表 | 每行带 `SiteId`；存量数据全部归 `SiteId=1`（bjrobust） |
| `t_newtype` | 新闻/案例类型字典 | 保持全局，不按站点分（前台过滤仍带 SiteId） |
| `t_admin` | 管理员 | `SiteId=0` 为平台超管（可跨站）；`>0` 为站点管理员（只能管本站） |

其它约定：

- 图片按站点分前缀：`upload/<code>/...`、`cn-banner/<code>/`。老图仍在 `upload/`、`cn-banner/` 根下，只有 `bjrobust` 会回退到这些旧路径，新站点不会串图。
- 内页头图（公司概况/产品中心/新闻资讯/成功案例/技术支持/联系我们）是**按站点逐页配置**的：`t_banner` 里 `SiteId + Page` 唯一，图片键写在 `Pic`。
  - 后台「站点设置 → 内页头图」可以逐页上传替换，也可以「清除」让该页退回主题色渐变；
  - 上传的新图落到 `cn-banner/<code>/<page>.<ext>`，不会覆盖别站、也不会覆盖 bjrobust 的历史文件名；
  - 新建站点默认没有头图记录，前台显示主题渐变，等你在后台逐页上传即可；
  - bjrobust 迁移时已经把老的 `cn-banner/banner1..6.jpg` 写进表里，视觉与改造前一致。
- 站点标识 `Code` 只允许小写字母/数字/短横线，创建后不可改（它是 R2 的路径前缀）。

## 2. 请求怎么落到站点

```
请求 → securityHeaders → tenantMiddleware（Host 查 t_site_domain）
     → 站点不存在 404 / 站点停用 503
     → /api/site/*  前台数据（查询全部带 SiteId）
     → /api/admin/* CSRF 校验 → adminGuard（定站点）→ 业务路由
```

后台的站点归属规则：

- 平台超管：默认跟随当前域名；带 `X-Site-Code` 头时按该站点操作（后台顶部「站点切换」就是这么实现的），与 `ALLOW_SITE_OVERRIDE` 无关。
- 站点管理员：忽略域名与切换头，强制锁在自己站点。
- 未登录公开接口**不接受** `X-Site-Code` / `?__site=`，除非显式设置 `ALLOW_SITE_OVERRIDE=1`（仅本地开发用）。

域名没登记时回落到 `SITE_DEFAULT`（默认 `bjrobust`）。若希望未知域名直接 404 而不是显示罗巴斯特，把 `SITE_DEFAULT` 改成不存在的值即可（回落失败即 404）。

## 3. 上线步骤（顺序不能反）

新代码依赖 `t_sites` / `t_site_domain` / `SiteId` 列，**必须先迁移远端库，再部署 Worker**，否则线上会全部 503（找不到站点）。

```powershell
# 1) 远端 D1 迁移（幂等，可重复跑；只加表/加列/写站点种子，不动老数据）
$env:CLOUDFLARE_ACCOUNT_ID = 'ea1fab4be92f6b0809efef4bd03c5341'
$env:D1_DATABASE_ID = 'd2e1886b-2684-4774-b97d-6925446b5b3b'
node tools/migrate_multisite.mjs remote

# 2) 构建 + 部署（wrangler.json 里的 routes 会把三个域名挂成 Custom Domain）
npm run build
npx wrangler deploy
```

三个域名已经在 `wrangler.json` 的 `routes` 里声明为 `custom_domain: true`，部署时 Worker 会向 Cloudflare 申请/绑定这三个域名（要求 `qlxtools.asia` 这个 zone 在本账号下）。如果 deploy 报 zone 权限错误，说明域名不在当前账号：改用 Dashboard 手动加。

### 手动方式（Dashboard）

1. 打开 Workers → `bjrobust` → Settings → Domains & Routes；
2. Add custom domain：`bjrobust.qlxtools.asia`、`aaaa.qlxtools.asia`、`bbbb.qlxtools.asia`；
3. DNS 记录由平台自动生成（不需要手动加 A/CNAME）。

### 新增第四家（aaaa2）时

1. 后台 `/admin/platform` 点「新建站点」，填 code、公司名、电话邮箱、主题色、域名；
2. 勾「初始化内容」会生成空白模板（新闻 1 条 + 3 个产品分类 + 6 个静态页占位）；
3. 部署侧加域名：Dashboard 加 Custom Domain，或往 `wrangler.json` 的 `routes` 里加一条再 deploy；
4. 在「站点设置 → 品牌与主题」里替换公司信息，在新闻/产品里录真实内容。

不要试图仅靠 DNS 加记录而不加 Custom Domain：Worker 只服务它被绑定的域名。

## 4. 安全相关的改造

| 问题 | 处理 |
| --- | --- |
| 后台写接口无 CSRF 防护（三站同属 `*.qlxtools.asia`，SameSite=Lax 挡不住子域伪造） | 所有非 GET 后台请求必须带 `X-CSRF: 1`；若带 `Origin` 则必须与请求 Host 同源 |
| 会话 Cookie 跨站共享 | Cookie 不带 `Domain`（host-only），https 下自动加 `Secure`，JWT 里带站点字段，旧会话强制重登 |
| 登录暴破 | D1 持久化计数（`t_throttle`），同 IP 15 分钟 10 次上限，D1 异常时回落内存计数 |
| 富文本 XSS（原先只粗过滤 `<script>`） | 前台统一用 DOMPurify（`src/react-app/lib/html.ts` 的 `safeHtml`），禁 script/iframe/form 等 |
| 响应头缺失 | 统一加 `X-Content-Type-Options` / `X-Frame-Options` / `Referrer-Policy` / `Permissions-Policy`；https 下加 CSP + HSTS |
| 上传文件伪造类型 | 服务端嗅探文件头（JPEG/PNG/GIF/WEBP），按站点前缀落 R2，删除路径校验防跨站 |
| 迁移脚本里写死 root 明文密码 | `tools/export_data.php` 改为读环境变量（`PHP_DB_PASS` 等），并建议：轮换旧密码、改用只读账号、清理 git 历史里的旧值 |

CSP 说明：`script-src` 放行了 `https://webapi.amap.com`（联系页地图），其余只允许自身。若以后接第三方统计，需要同步改 `src/worker/lib/security.ts`。

## 5. 本地开发与验证

```powershell
npm run dev            # http://127.0.0.1:5173，按 Host 解析不到站点时回落 bjrobust
```

本地想按域名切换整站，wrangler dev 会按 `routes` 把 Host 规范化，所以要用 `--local-upstream`：

```powershell
npx wrangler dev --port 8792 --local --local-upstream aaaa.qlxtools.asia
Invoke-RestMethod http://127.0.0.1:8792/api/site/site-info   # 应返回 站点 A
```

后台接口验证要点（用同一会话）：

- `POST /api/admin/login` 后 `GET /api/admin/me` 应返回 `sites` 列表（超管 3 个）；
- 带 `X-Site-Code: bjrobust` 调 `GET /api/admin/news` 得 43 条，不带得当前域名站点的条数；
- 写请求不带 `X-CSRF: 1` 必须 403；
- `PUT /api/admin/site-meta` 只改当前生效站点那一行。

## 6. 内页头图（banner）与跨站统一维护

- 数据：`t_banner` 每站每页一行（`SiteId + Page` 唯一），字段 `Pic` 存 R2 键；`Pic` 为空即"该页不配图"。
- 页面键固定 6 个（顺序即菜单顺序）：`about` 公司概况、`products` 产品中心、`news` 新闻资讯、`cases` 成功案例、`support` 技术支持、`contact` 联系我们。
- 上传落 `cn-banner/<站点Code>/<page>.<扩展名>`；替换同一页会覆盖同名对象；只校验文件头（jpg/png/gif/webp），单文件上限 5MB。
- 前台：`GET /api/site/banners` 一次返回本站所有页面图，`PageHero` 按 `page` 取图；**取不到图时整块 banner 区域不渲染**（不会留渐变占位），页面直接从标题栏开始。
- 后台本站维护：`/admin/site` 的"内页头图"面板（`GET/PUT/DELETE /api/admin/banners[/:page]`），操作的是"当前生效站点"。
- 后台跨站维护（超管）：`/admin/platform` 的"内页头图（跨站点统一维护）"矩阵，行=6 个菜单页、列=所有站点，每格可上传/替换/清除，一眼看出哪站哪页还没配图。接口 `GET /api/admin/platform/banners`（返回 `pages / sites / matrix`）、`PUT|DELETE /api/admin/platform/banners/:code/:page`，非超管一律 403。
- 清除只把 `Pic` 置空，不删 R2 对象，误删可凭文件名重传。
- 站点管理员在自己的 `站点设置` 里改本站；超管在平台矩阵里一次改三家，二者读写同一张表，不会出现两套数据。

## 7. 已知限制（后续可做）

- 前端产物是全站共用的一份（主题色/品牌走数据库，文案走 `t_content`）。如果以后某家要完全不同的版式，需要按站点追加独立页面组件。
- `public/` 里打进产物的静态图（如 `cn-images/logo-di.jpg`）是三站共享的同一份文件；站点专属图片请走后台上传到 R2（会自动落到 `upload/<code>/`）。
- `wrangler.json` 的 `assets.run_worker_first` 只把 `/` 和 `/index.html` 交给 Worker（为的是补 CSP/HSTS 与 no-cache），其余 js/css/图片由边缘直出、不经过 Worker；因此这些静态文件响应上没有自定义安全头，属预期行为。
- 站点级管理员目前不限制菜单，只限制数据范围；要更细的权限，可在 `AdminLayout` 里按 `isSuper` 隐藏菜单并在后端逐个校验。
- 没有站点级独立域名证书管理逻辑，证书由 Cloudflare Custom Domain 自动签发。

## 8. 变更后的上线验证清单

```powershell
Invoke-RestMethod https://bjrobust.qlxtools.asia/api/site/site-info   # code=bjrobust
Invoke-RestMethod https://aaaa.qlxtools.asia/api/site/site-info       # code=aaaa
Invoke-RestMethod https://bbbb.qlxtools.asia/api/site/site-info       # code=bbbb
Invoke-RestMethod https://bjrobust.qlxtools.asia/api/site/news?page=1&size=1   # total=7（已发布新闻）
Invoke-RestMethod https://aaaa.qlxtools.asia/api/site/news?page=1&size=1       # total=1（空白模板）
Invoke-RestMethod https://bjrobust.qlxtools.asia/api/site/banners             # 6 个页面都有 pic
Invoke-RestMethod https://bbbb.qlxtools.asia/api/site/banners                 # pages={}，该站内页无 banner 区域
```

线上后台用你自己的管理员密码登录后：`/admin` 顶部能看到站点下拉（超管），`/admin/platform` 能建站/绑域名/启停，以及一次维护所有站点的每个菜单头图。

