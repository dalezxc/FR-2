<?php

declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

require_method('POST');

$data = input();

try {
    $tripId = (int) value($data, 'trip_id', 0);
    $parentId = (int) value($data, 'parent_id', 0);
    $driverId = (int) value($data, 'driver_id', 0);
    $score = (int) value($data, 'score', 0);

    if (!$tripId || !$parentId || !$driverId) {
        respond(['ok' => false, 'error' => 'Missing trip, parent, or driver for this rating'], 422);
    }

    if ($score < 1 || $score > 5) {
        respond(['ok' => false, 'error' => 'Select a rating from 1 to 5'], 422);
    }

    $stmt = db()->prepare('
        INSERT INTO ratings (trip_id, parent_id, driver_id, score, comment)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE score = VALUES(score), comment = VALUES(comment)
    ');
    $stmt->execute([
        $tripId,
        $parentId,
        $driverId,
        $score,
        value($data, 'comment', ''),
    ]);

    db()->prepare("UPDATE trips SET status = 'completed' WHERE id = ?")->execute([$tripId]);
    respond(['ok' => true]);
} catch (Throwable $e) {
    respond(['ok' => false, 'error' => $e->getMessage()], 500);
}
