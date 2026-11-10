<?php
// 从 MariaDB 导出全部表结构与数据为 JSON（供 tools/migrate.mjs 写入 D1）
$pdo = new PDO("mysql:host=172.16.20.243;port=24306;dbname=bjrobust;charset=utf8", "root", "7531591q", [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
]);

function mapType(string $mysqlType): string {
    // 取基础类型（去掉长度/精度括号）：int(11)/tinyint(1)/decimal(10,2) → int/tinyint/decimal
    $base = preg_split('/[\s(]/', strtolower(trim($mysqlType)), 2)[0];
    $intTypes = ['int', 'integer', 'tinyint', 'smallint', 'mediumint', 'bigint'];
    $realTypes = ['float', 'double', 'decimal', 'real', 'numeric'];
    if (in_array($base, $intTypes, true)) return 'INTEGER';
    if (in_array($base, $realTypes, true)) return 'REAL';
    return 'TEXT';
}

function qid(string $name): string {
    return '"' . str_replace('"', '""', $name) . '"';
}

$tables = $pdo->query("SHOW TABLES")->fetchAll(PDO::FETCH_COLUMN);
$result = ["tables" => []];

foreach ($tables as $t) {
    $cols = $pdo->query("SHOW FULL COLUMNS FROM `$t`")->fetchAll(PDO::FETCH_ASSOC);
    $defs = [];
    $indexes = [];
    $colMeta = [];
    foreach ($cols as $c) {
        $type = mapType($c['Type']);
        $colMeta[] = ["name" => $c['Field'], "sqlite" => $type];
        $def = qid($c['Field']) . ' ' . $type . ($c['Null'] === 'NO' ? ' NOT NULL' : '');
        if ($c['Key'] === 'PRI') $def .= ' PRIMARY KEY';
        elseif ($c['Key'] === 'MUL') $indexes[] = "CREATE INDEX IF NOT EXISTS idx_" . $t . "_" . $c['Field'] . " ON $t (" . qid($c['Field']) . ");";
        $defs[] = $def;
    }
    $rows = $pdo->query("SELECT * FROM `$t`")->fetchAll(PDO::FETCH_ASSOC);
    $rowArr = [];
    foreach ($rows as $r) {
        $line = [];
        foreach ($colMeta as $cm) {
            $v = $r[$cm['name']];
            if ($v !== null && is_numeric($v)) {
                // 按目标类型规整：整型列去掉浮点尾巴（tinyint 值可能以 float 返回），文本列保留原值
                if ($cm['sqlite'] === 'INTEGER') $v = (int)$v;
                elseif ($cm['sqlite'] === 'REAL') $v = (float)$v;
            }
            $line[] = $v;
        }
        $rowArr[] = $line;
    }
    $result["tables"][] = [
        "name" => $t,
        "ddl" => "CREATE TABLE IF NOT EXISTS $t (" . implode(', ', $defs) . ");",
        "indexes" => $indexes,
        "columns" => $colMeta,
        "rows" => $rowArr,
    ];
    echo sprintf("%-24s rows=%d\n", $t, count($rowArr));
}

file_put_contents(__DIR__ . '/data.json', json_encode($result, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
echo "data.json: " . round(filesize(__DIR__ . '/data.json') / 1048576, 2) . " MB\n";
