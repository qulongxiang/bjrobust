# 校验库内全部图片引用在线上能否取到
# 用法：pwsh -NoProfile -File tools/verify_refs.ps1
Set-Location (Split-Path $PSScriptRoot -Parent)
$env:CLOUDFLARE_ACCOUNT_ID = 'ea1fab4be92f6b0809efef4bd03c5341'

$sql = @'
SELECT 'news' AS src, SmallPic AS v FROM t_news WHERE SmallPic <> ''
UNION ALL SELECT 'prod', SmallPic FROM t_products WHERE SmallPic <> ''
UNION ALL SELECT 'img', PicUrl FROM t_img WHERE PicUrl <> ''
UNION ALL SELECT 'slide', Pic FROM t_slide WHERE Pic <> ''
UNION ALL SELECT 'banner', Pic FROM t_banner WHERE Pic <> ''
'@

$out = (npx wrangler d1 execute bjrobust --remote --json --command $sql.Replace("`r", ' ').Replace("`n", ' ') 2>$null | Out-String)
$rows = ($out | ConvertFrom-Json)[0].results
$uniq = @($rows.v | Sort-Object -Unique)

$res = $uniq | ForEach-Object -ThrottleLimit 12 -Parallel {
	$n = $_ -replace '^/', ''
	$c = & "$env:SystemRoot\System32\curl.exe" -s -o NUL -m 25 -w "%{http_code}" ("https://bjrobust.qlxtools.asia/assets/" + $n)
	"$c $n"
}
$bad = @($res | Where-Object { -not $_.StartsWith('200 ') })
"rows=$($rows.Count) unique=$($uniq.Count) ok=$($uniq.Count - $bad.Count) bad=$($bad.Count)"
$bad
