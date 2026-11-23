# 线上回归冒烟：站点身份、首页、图片、CSRF、运维接口下线、跨站越权、SPA 回退
# 用法：pwsh -File tools\smoke.ps1            # 全量
#       pwsh -File tools\smoke.ps1 -SkipDb    # 不查库（跨站 id 用内置样本）
param(
	[string[]]$Sites = @('https://bjrobust.qlxtools.asia', 'https://aaaa.qlxtools.asia', 'https://bbbb.qlxtools.asia'),
	[string[]]$Codes = @('bjrobust', 'aaaa', 'bbbb'),
	[switch]$SkipDb
)

$ErrorActionPreference = 'Continue'
$curl = "$env:SystemRoot\System32\curl.exe"
$fail = 0
$pass = 0

function Check([string]$name, [string]$url, [int]$expect, [string[]]$extra = @()) {
	$curlArgs = @('-s', '-o', 'NUL', '-m', '20', '-w', '%{http_code}') + $extra + @($url)
	$code = 0
	for ($try = 1; $try -le 3; $try++) {
		$code = [int](& $curl @curlArgs)
		if ($code -ne 0) { break }
		Start-Sleep -Milliseconds 400
	}
	if ($code -eq $expect) { $script:pass++; "  OK   $name ($code)" }
	else { $script:fail++; "  FAIL $name 期望 $expect 实际 $code  $url" }
}

function CheckCode([string]$name, [string]$url, [string]$expectCode) {
	$body = & $curl -s -m 20 $url
	$ok = $body -match ('"code":"' + [regex]::Escape($expectCode) + '"')
	if ($ok) { $script:pass++; "  OK   $name (code=$expectCode)" }
	else { $script:fail++; "  FAIL $name 期望 code=$expectCode，实际：$($body.Substring(0, [Math]::Min(120, $body.Length)))" }
}

Set-Location 'D:\softdata\text\bjrobust'

"== 1. 站点身份 =="
for ($i = 0; $i -lt $Sites.Count; $i++) {
	CheckCode "site-info" ($Sites[$i] + '/api/site/site-info') $Codes[$i]
}

"== 2. 首页与前台接口 =="
foreach ($s in $Sites) {
	Check 'home' ($s + '/api/site/home') 200
	Check 'banners' ($s + '/api/site/banners') 200
	Check 'products' ($s + '/api/site/products?page=1&size=5') 200
	Check 'news' ($s + '/api/site/news?page=1&size=5') 200
}

"== 3. 图片（新布局样本） =="
$samples = @(
	'/assets/bjrobust/upload/2018/09/13/2018091310422596.jpg',
	'/assets/bjrobust/upload/2019/04/09/2019040911344838.jpg',
	'/assets/bjrobust/cn-banner/2026/11/13/banner1.jpg',
	'/assets/bjrobust/cn-images/logo-di.jpg'
)
foreach ($p in $samples) { Check 'asset' ($Sites[0] + $p) 200 }

"== 4. 缓存头（头图长缓存） =="
$h = & $curl -s -I -m 20 ($Sites[0] + '/assets/bjrobust/cn-banner/2026/11/13/banner1.jpg') | Out-String
if ($h -match 'cache-control:.*max-age=604800') { $script:pass++; '  OK   banner cache-control immutable' }
else { $script:fail++; "  FAIL banner 缓存头：$($h -split "`n" | Where-Object { $_ -match 'cache-control' })" }

"== 5. 无 CSRF 写请求必须 403 =="
foreach ($s in $Sites) {
	Check 'login-no-csrf' ($s + '/api/admin/login') 403 @('-X', 'POST', '-H', 'Content-Type: application/json', '-H', ('Origin: ' + $s), '--data-binary', '{"username":"x","password":"x"}')
}

"== 6. 运维迁移接口已下线 =="
foreach ($s in $Sites) {
	Check 'maint-gone' ($s + '/api/maint/storage/migrate') 404 @('-X', 'POST', '-H', 'Content-Type: application/json', '--data-binary', '{}')
}

"== 7. 跨站越权：bjrobust 的新闻在 aaaa/bbbb 必须 404 =="
$newsId = $null
if (-not $SkipDb) {
	$env:CLOUDFLARE_ACCOUNT_ID = 'ea1fab4be92f6b0809efef4bd03c5341'
	$raw = npx wrangler d1 execute bjrobust --remote --json --command 'SELECT max(id) AS id FROM t_news WHERE SiteId = 1' 2>$null | Out-String
	if ($raw -match '"id":\s*(\d+)') { $newsId = [int]$Matches[1] }
} else {
	$newsId = 1
}
if (-not $newsId) {
	$script:fail++; '  FAIL 拿不到 bjrobust 的新闻 id（加 -SkipDb 或检查 wrangler 登录）'
} else {
	"  用新闻 id=$newsId 做跨站测试"
	Check 'own-site-news' ($Sites[0] + "/api/site/news/$newsId") 200
	Check 'cross-site-news-aaaa' ($Sites[1] + "/api/site/news/$newsId") 404
	Check 'cross-site-news-bbbb' ($Sites[2] + "/api/site/news/$newsId") 404
}

"== 8. 后台 SPA 回退（必须带浏览器 Accept） =="
foreach ($s in $Sites) {
	Check 'admin-spa' ($s + '/admin') 200 @('-H', 'Accept: text/html,application/xhtml+xml')
}

""
"结果：pass=$pass fail=$fail"
if ($fail -gt 0) { exit 1 }
