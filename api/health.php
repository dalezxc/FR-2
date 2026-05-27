<?php

declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

try {
    $version = db()->query('SELECT VERSION() AS version')->fetch();
    respond(['ok' => true, 'database' => DB_NAME, 'mysql' => $version['version'] ?? null]);
} catch (Throwable $e) {
    respond(['ok' => false, 'error' => $e->getMessage()], 500);
}
