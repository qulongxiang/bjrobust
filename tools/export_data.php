<?php
// 从 MariaDB 导出全部表结构与数据为 JSON（供 tools/migrate.mjs 写入 D1）
$pdo = new PDO("mysql:host=172.16.20.243;port=24306;dbname=bjrobust;charset=utf8", "root", "7531591q", [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
]);

function mapType(string $mysqlType): string {
    $t = strtolower($mysqlType);
    if (strpos($t, 'int') === 0) return 'INTEGER';
    if (strpos($t, 'float') === 0 || strpos($t, 'double') === 0 || strpos($t, 'decimal') === 0) return 'REAL';
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
            if ($v !== null && $cm['sqlite'] !== 'TEXT' && is_numeric($v)) $v = (int)$v;
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
