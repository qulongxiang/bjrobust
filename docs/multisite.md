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
| `t_banner` | 内页头图 | 每站每个页面一行（`SiteId` + `Page` 唯一），`Pic` 为 R2 键；`Pic` 为空表示该页不配图，前台**整块不渲染** banner |
| `t_slide` | 首页 banner 轮播 | 每站多行（`SiteId` + `OrderBy` 排序），`Pic` 为 R2 键，`IsShow` 控制显隐；没有记录时前台不显示轮播 |
| `t_news` / `t_products` / `t_protype` / `t_img` / `t_content` / `t_global` / `t_feedback` / `t_log` | 业务表 | 每行带 `SiteId`；存量数据全部归 `SiteId=1`（bjrobust） |
| `t_newtype` | 新闻/案例类型字典 | 保持全局，不按站点分（前台过滤仍带 SiteId） |
| `t_admin` | 管理员 | `SiteId=0` 为平台超管（可跨站）；`>0` 为站点管理员（只能管本站） |

其它约定：

- 图片按站点分目录，桶根第一层就是站点 Code，站点目录下再分类型与日期：`<code>/upload/<YYYY>/<MM>/<DD>/<文件名>`（普通图片）、`<code>/cn-banner/<YYYY>/<MM>/<DD>/<文件名>`（内页头图）。bjrobust 的历史图片已全部迁到这个结构下（详见 6.5），新站点不会串图。
- 内页头图（公司概况/产品中心/新闻资讯/成功案例/技术支持/联系我们）是**按站点逐页配置**的：`t_banner` 里 `SiteId + Page` 唯一，图片键写在 `Pic`。
  - 后台「站点设置 → 内页头图」可以逐页上传替换，也可以「清除」让该页退回主题色渐变；
  - 上传的新图落到 `<code>/cn-banner/<年>/<月>/<日>/<page>.<ext>`，不会覆盖别站、也不会覆盖 bjrobust 的历史文件名；
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
- 上传落 `<站点Code>/cn-banner/<年>/<月>/<日>/<page>.<扩展名>`；同一天内替换同一页会覆盖同名对象；只校验文件头（jpg/png/gif/webp），单文件上限 5MB。
- 前台：`GET /api/site/banners` 一次返回本站所有页面图，`PageHero` 按 `page` 取图；**取不到图时整块 banner 区域不渲染**（不会留渐变占位），页面直接从标题栏开始。
- 后台本站维护：`/admin/site` 的"内页头图"面板（`GET/PUT/DELETE /api/admin/banners[/:page]`），操作的是"当前生效站点"。
- 后台跨站维护（超管）：在 `/admin/platform` 的站点列表里点某站的**"素材维护"**，展开该站的头图 + 首页轮播面板（行=6 个菜单页，可上传/替换/清除）。
  - `GET /api/admin/platform/banners` 只返回**每站概览**（`bannerCount/bannerTotal/slideCount`），站点多时也是一个请求；
  - `GET /api/admin/platform/banners/:code` 取单站明细，`PUT|DELETE /api/admin/platform/banners/:code/:page` 改单站单页；
  - 非超管访问这些接口一律 403。
- 清除只把 `Pic` 置空，不删 R2 对象，误删可凭文件名重传。
- 站点管理员在自己的 `站点设置` 里改本站；超管在平台卡片里点"素材维护"改任意站，二者读写同一张表，不会出现两套数据。

## 6.1 首页 banner 轮播（`t_slide`）

- 首页那组滚动图原来挂在 `t_news NewType=1` 上，后台无处可改；现在独立成表 `t_slide`：`SiteId / Pic / Title / Link / OrderBy / IsShow / NoteTime`，`Pic` 同样存 R2 键（如 `aaaa/upload/2026/11/23/x.jpg`）。
- 前台 `GET /api/site/home` 的 `banners` 先读 `t_slide`（只取 `IsShow=1`，按 `OrderBy` 升序），表里没有数据才回退老的 `t_news` 逻辑；`aaaa`/`bbbb` 两站没配就没有轮播区。
- 迁移脚本 `tools/migrate_multisite.mjs` 建表后会把每站 `t_news NewType=1 且 SmallPic<>''` 的记录搬进 `t_slide`，只搬一次（`NoteTime` 作标记）。线上 bjrobust 已搬入 4 张。
- 维护入口两处，读写同一张表：
  - 站点管理员：`/admin/site` 的"首页 banner 轮播（可多张，各站点独立）"，接口 `GET/POST/PUT/DELETE /api/admin/slides[/:id]`；
  - 超管：`/admin/platform` → 某站"素材维护" → 首页轮播，接口 `GET/POST /api/admin/platform/slides/:code`、`PUT/DELETE /api/admin/platform/slides/:code/:id`。
- 轮播只需要图片路径，先走通用上传 `POST /api/admin/upload` 拿到 `path` 再提交，不用 multipart。

## 6.2 平台管理布局（撑得住几十个域名）

- `/admin/platform` 从"宽表格"改成**卡片网格**：`repeat(auto-fill, minmax(300px, 1fr))`，40 个站点自动折行，不再横向撑爆。
- 顶部工具条：搜索（code / 名称 / 公司名 / 域名）、状态筛选（全部 / 启用 / 停用）、站点计数。卡片显示 code、默认站/停用标签、域名列表、新闻/产品/留言数、`头图 n/6`（缺页时橙色告警）、`轮播 n 张`。
- 卡片操作：编辑（含 Logo 上传）/ 素材维护 / 启停 / 初始化内容 / 删除。点"素材维护"在卡片下方展开该站面板，一次只展开一个站，避免几十站同时渲染一堆上传控件。
- 站点再多也不改这套交互；概览接口 `GET /api/admin/platform/banners` 用两条 `GROUP BY` 聚合，一个请求拿到所有站的计数。

## 6.3 图片一律走上传控件

- 新增 `admin/components/ImageField.tsx`：缩略图预览 + "上传/替换" + "清除" + 折叠的"手填路径"（兼容历史数据/外链）。`siteCode` 可指定上传到哪个站点目录，未指定时用当前生效站点。
- 已替换：产品添加/产品编辑的缩略图、新闻编辑的缩略图、站点设置里的 Logo。轮播用 `SlideEditor.tsx`（缩略图 + 标题 + 链接 + 排序 + 显隐 + 删除 + "+ 上传一张轮播图"），被 `SiteAdmin` 与 `PlatformAdmin` 复用。
- 上传统一校验文件头（jpg/png/gif/webp，5MB 上限）并落 R2；数据库只存键。

## 6.4 分站管理员：各管一摊

- 判权只看 `t_admin.SiteId`：`0` = 平台超管（可跨站、可建平台级账号），`>0` = 站点管理员。
- 站点管理员只能看到本站数据（新闻/产品/留言/头图/轮播/用户列表都按 `SiteId` 过滤），访问 `/api/admin/platform/*` 一律 403。
- 用户管理：超管建号可指定所属站点（"平台级（超管）"或任一站点）；站点管理员建号强制落本站，显式传 `siteId:0` 返回 403。
- 重置密码/锁定：本人可改自己，本站账号可改，平台级账号只有超管能改，跨站必须切站。
- 角色串不再从建号人复制，按站点写死（`0/平台超管` 或 `1/站点管理员`）。早期版本复制角色串会把 `admin` 串带到新账号，导致站点管理员被误判成超管（已修）。

## 6.5 桶内目录规范：站点 / 类型 / 年 / 月 / 日

- 桶根第一层就是站点 Code，一眼能分清是哪家：`bjrobust/`、`aaaa/`、`bbbb/`。站点目录下再按类型分 `upload/`（普通图片）与 `cn-banner/`（内页头图），再按 `年/月/日` 分层。
- 完整 key：
  - 普通图：`<站点Code>/upload/<YYYY>/<MM>/<DD>/<文件名>`
  - 内页头图：`<站点Code>/cn-banner/<YYYY>/<MM>/<DD>/<page>-<版本号>.<ext>`
- 文件名：新上传是 `<毫秒时间戳>-<随机6位><扩展名>`；内页头图是 `<page>-<base36 毫秒时间戳>`（换图必换名，见 6.5.1）；历史图沿用原名（老 PHP 的 `YYYYMMDD...` 命名天然带日期）。
- 日期口径：文件名以 `YYYYMMDD` 开头就用文件名里的日期；否则用 R2 对象的 `uploaded` 时间转 +08:00。时间统一按北京时间。
- 读取：库里只存 key，前台一律 `/assets/<key>` **精确命中**；旧布局（上一版 `upload/<code>/…`、`cn-banner/<code>/…`、老站 `upload/<文件名>`）只有在环境变量 `LEGACY_LOOKUP=1` 时才会作为候选去试。默认关闭 —— 坏链会如实 404，不再被兼容层掩盖。
- 拼 key / 判归属 / 算缓存只有一个权威：`src/worker/lib/storage.ts`（`bjDate` / `imageKey` / `bannerKey` / `isOwnedKey` / `assetCandidates` / `cacheControlFor`）。上传路由与头图路由都调它，不再各自写一份规则。
- 删除权限（`isDeletable`）：只允许删本 `<code>/` 目录下的对象；`LEGACY_LOOKUP=1` 时才额外认上一版 `upload/bjrobust/`、`cn-banner/bjrobust/` 与老站单层 `upload/<文件名>`。

### 6.5.1 换头图不生效的问题：文件名带版本

- 旧头图 key 只按 `<page>.<ext>` 命名，换图后 key 不变，浏览器/CDN 里那张 `immutable` 的旧图会继续命中 —— 现象就是"后台换完了，前台还是老图"。
- 现在 `bannerKey()` 生成 `<page>-<base36 时间戳>.<ext>`：每次换图 key 都变，旧缓存自然失效，数据库里 `t_banner.Pic` 同步改成新 key。
- 缓存策略统一由 `cacheControlFor()` 给：头图（含 `/cn-banner/`）`public, max-age=604800, immutable`；普通上传图 1 天；其余 1 小时。

### 6.5.2 富文本里的图片引用：保存时收口

- 历史文章里的图片可能写成 `/upload/x.jpg`、`upload/x.jpg`、`/assets/upload/x.jpg` 各种形态，迁移时靠 `REPLACE` 拼 SQL 属于一次性赌运气。
- 现在新增/编辑新闻、产品、静态页时，`src/worker/lib/content.ts` 的 `normalizeContentImages()` 会扫 `src`/`href`，把本地引用逐个按 `assetCandidates()` head 一次：命中的改写成 `/assets/<真实 key>`，没命中的原样保留（外链、`data:` 一律不动）。
- 也就是说：**新写入的内容不会再产生旧布局引用**，历史数据的修理由一次性迁移负责，不再靠运行时兜底。
### 6.5.3 运维：本地脚本，生产不挂接口

- **原来的 `POST /api/maint/storage/migrate` 已整段删除**（路由文件 `admin-storage.ts` 一并删掉）。理由：一次性的搬迁工具没有任何理由长期挂在生产 Worker 上，多一个可写 R2 的入口就多一份风险。
- 替代方案是本地脚本 `tools/storage_admin.mjs`（走 CF REST API + `wrangler d1`，用 wrangler 的 `oauth_token` 鉴权，不经过 Worker）：
  - `node tools/storage_admin.mjs list` —— 桶内对象按第一层目录计数
  - `node tools/storage_admin.mjs orphans` —— **对账**：R2 有但库里没人引用的孤儿对象，以及库里有但 R2 没有的坏引用（默认只报告，不删）
  - `node tools/storage_admin.mjs prune --file keys.txt --yes` —— 按清单删对象，默认 dry-run
- 对账扫描的是整库快照（`wrangler d1 export`），不是只扫几个"看起来像存图片"的表，所以不会因为漏表而误判孤儿；带日期后缀的备份表（如 `t_content_20260528`）按非线上数据处理。
- 首次对账结果（2026-11-23）：对象 554、库内引用 229 个唯一 key、孤儿 325、坏引用 0（修掉 1 处双重前缀的新闻图片后）。
  - 孤儿来源是老 PHP `upload/` 目录的整体搬迁留下的历史未引用图，**只报告不自动删**；确认无价值后再 `prune`。
- `tools/purge_legacy.ps1` 已废弃（它依赖那个被删的接口），文件保留仅作提示。
- 迁移完成后 `LEGACY_LOOKUP` 不要再打开：默认关闭意味着读取只认精确 key，问题会立刻暴露，而不是被兼容层悄悄接住。
- 线上现状（2026-11-23）：桶内只剩 `bjrobust/` 一个站点目录（554 个对象），桶根无散落文件；库内引用线上 HEAD 校验全 200。

## 6.6 租户隔离：不再靠"每条 SQL 记得写 SiteId"

- 靠人记约定迟早会漏一条 SQL，一旦漏了就是跨租户读数据。现在有一层运行时护栏：`src/worker/lib/db-guard.ts`。
- 中间件里 `c.env.DB = guardedDB(c.env.DB, { path, onViolation })`，用 Proxy 包住 `prepare`：命中 `TENANT_TABLES`（t_news/t_products/t_img/t_slide/t_banner/t_content/t_global/t_feedback/t_protype/t_log）的 SQL，如果没有出现 `SiteId`，也没有显式写 `/* site:global */` 注释声明"这是全局表查询"，就判为违规。
- 处理方式由 `DB_GUARD` 决定：`strict` → 直接抛错（5xx，问题挡在上线前）；未设置 → `console.warn` 打 `[db-guard] ...` 日志（只观察，不打断线上）。
- **当前取值：`wrangler.json` 的 `vars.DB_GUARD = "strict"`，本地与线上都是 strict**（2026-11-23 起）。上线前已在本地用 strict 跑过前台 10 个接口、后台 19 个读接口、20 余个写/删接口（含建站与 scaffold）、公共留言，日志零 `[db-guard]`；上线后 smoke 32 项全绿，线上后台读接口全 200。
- 临时降级：把 `DB_GUARD` 改成 `warn` 重新部署即可；但降级期间等于护栏失效，改完应尽快恢复。
- 已知设计边界：护栏是**词法级**的（正则认 `from/into/update/join t_xxx`），挡得住"忘了写条件"，挡不住"写了 `SiteId` 但值是别的站"——后者靠路由层的 `site` 上下文取值，仍属约定，只是把最容易犯的错变成了硬错误。

## 6.7 schema 版本与回归

- `migrations/0001_baseline.sql` 是全库基线（从线上 `sqlite_master` 导出，40 张表 + 39 个索引，全部 `IF NOT EXISTS`，可重复执行），新环境直接跑这一份就能起库。
- `tools/db_migrate.mjs`：`status` 看哪些已应用，`apply` 按文件名顺序执行未应用的迁移，成功后在 `t_migrations` 记账（失败不记账，改完重跑）。支持 `--local`（本地 D1）与 `--upto`。
- `tools/smoke.ps1`：上线后的回归脚本，覆盖 8 组断言：
  1. 三站 `site-info` 的 `code` 各自正确
  2. 首页 / 轮播 / 产品 / 新闻接口 200
  3. 新布局图片样本 200
  4. 头图响应带 `max-age=604800, immutable`
  5. 无 `X-CSRF` 的写请求一律 403
  6. `/api/maint/*` 已下线（404）
  7. **跨站越权**：bjrobust 的新闻 id 在 aaaa/bbbb 必须 404
  8. `/admin` 带浏览器 `Accept` 必须 200（SPA 回退）
- 每次改完 `npm run build` → `npx wrangler deploy` → `pwsh -File tools\smoke.ps1`，三步固定。

## 7. 已知限制（后续可做）

- 前端产物是全站共用的一份（主题色/品牌走数据库，文案走 `t_content`）。如果以后某家要完全不同的版式，需要按站点追加独立页面组件。
- `public/` 里打进产物的静态图（如 `cn-images/logo-di.jpg`）是三站共享的同一份文件；站点专属图片请走后台上传到 R2（会自动落到 `<code>/upload/<年>/<月>/<日>/`）。
- `wrangler.json` 的 `assets.run_worker_first` 只把 `/` 和 `/index.html` 交给 Worker（为的是补 CSP/HSTS 与 no-cache），其余 js/css/图片由边缘直出、不经过 Worker；因此这些静态文件响应上没有自定义安全头，属预期行为。
- 站点级管理员目前不限制菜单，只限制数据范围；要更细的权限，可在 `AdminLayout` 里按 `isSuper` 隐藏菜单并在后端逐个校验。
- 没有站点级独立域名证书管理逻辑，证书由 Cloudflare Custom Domain 自动签发。

## 8. 变更后的上线验证清单

```powershell
pwsh -File tools\smoke.ps1        # 一条命令跑完：站点身份 / 首页 / 图片 / CSRF / 运维接口下线 / 跨站越权 / SPA 回退
node tools\db_migrate.mjs status  # schema 版本：确认 0001_baseline 已应用
```

手工抽查（需要看具体数字时）：

```powershell
Invoke-RestMethod https://aaaa.qlxtools.asia/api/site/site-info       # code=aaaa
Invoke-RestMethod https://bbbb.qlxtools.asia/api/site/site-info       # code=bbbb
Invoke-RestMethod https://bjrobust.qlxtools.asia/api/site/news?page=1&size=1   # total=7（已发布新闻）
Invoke-RestMethod https://aaaa.qlxtools.asia/api/site/news?page=1&size=1       # total=1（空白模板）
Invoke-RestMethod https://bjrobust.qlxtools.asia/api/site/banners             # 6 个页面都有 pic
Invoke-RestMethod https://bbbb.qlxtools.asia/api/site/banners                 # pages={}，该站内页无 banner 区域
Invoke-RestMethod https://bjrobust.qlxtools.asia/api/site/home                # banners 4 条（来自 t_slide）
Invoke-RestMethod https://aaaa.qlxtools.asia/api/site/home                    # banners 为空数组，首页无轮播区
```

线上后台用你自己的管理员密码登录后：`/admin` 顶部能看到站点下拉（超管），`/admin/platform` 是站点卡片网格（搜索/筛选/素材维护），站点管理员登录后只看到本站菜单与本站数据。

