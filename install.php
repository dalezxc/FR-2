<?php

declare(strict_types=1);

$schema = __DIR__ . '/database/schema.sql';

if (!is_file($schema)) {
    http_response_code(500);
    exit('Missing database/schema.sql');
}

require_once __DIR__ . '/config/database.php';

$pdo = new PDO('mysql:host=' . DB_HOST . ';charset=' . DB_CHARSET, DB_USER, DB_PASS, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
]);
$pdo->exec(file_get_contents($schema));

$pdo->exec('USE ' . DB_NAME);

$columns = [
    "ALTER TABLE students ADD COLUMN school_id INT UNSIGNED NULL AFTER parent_id",
    "ALTER TABLE students ADD COLUMN date_of_birth DATE NULL AFTER age",
    "ALTER TABLE students ADD COLUMN grade_level VARCHAR(50) NULL AFTER date_of_birth",
];

foreach ($columns as $sql) {
    try {
        $pdo->exec($sql);
    } catch (Throwable $e) {
        if (!str_contains($e->getMessage(), 'Duplicate column')) {
            throw $e;
        }
    }
}

echo 'RideGuard database installed successfully. Demo logins use Password123.';
