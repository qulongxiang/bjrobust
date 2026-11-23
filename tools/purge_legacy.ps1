# 分批调用运维迁移接口（复制 + 可选 purge）。使用前须先设 secret 并落本地令牌：
#   npx wrangler secret put MAINT_TOKEN        # 输入一个随机串
#   Set-Content .maint_token '<同一个随机串>'
# 用完：npx wrangler secret delete MAINT_TOKEN 并删除 .maint_token
Set-Location 'D:\softdata\text\bjrobust'
$tok = (Get-Content .maint_token -Raw).Trim()
$curl = "$env:SystemRoot\System32\curl.exe"
$after = ''
for ($i = 0; $i -lt 40; $i++) {
	$o = [ordered]@{ dry = $false; purge = $true; limit = 40 }
	if ($after) { $o['after'] = $after }
	$body = ($o | ConvertTo-Json -Compress)
	$r = & $curl -s -m 120 -X POST 'https://bjrobust.qlxtools.asia/api/maint/storage/migrate' -H 'Content-Type: application/json' -H ("X-Maint-Token: " + $tok) --data-binary $body
	$j = $r | ConvertFrom-Json
	"round=$i processed=$($j.processed) copied=$($j.copied) skipped=$($j.skipped) purged=$($j.purged) remaining=$($j.remaining) errors=$(@($j.errors).Count)"
	if (@($j.errors).Count -gt 0) { $j.errors | Select-Object -First 3 }
	if ($j.remaining -le 0) { break }
	$after = $j.nextAfter
	if (-not $after) { break }
}
