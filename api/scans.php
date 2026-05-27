<?php

declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

try {
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $rows = db()->query("
            SELECT sl.*, s.first_name, s.last_name
            FROM scan_logs sl
            JOIN students s ON s.id = sl.student_id
            ORDER BY sl.scanned_at DESC
            LIMIT 20
        ")->fetchAll();
        respond(['ok' => true, 'scans' => $rows]);
    }

    require_method('POST');
    $data = input();
    $studentId = (int) value($data, 'student_id', 0);
    $tripId = value($data, 'trip_id');

    if (!$studentId) {
        respond(['ok' => false, 'error' => 'Missing child for this scan'], 422);
    }

    $stmt = db()->prepare('
        INSERT INTO scan_logs (student_id, guard_id, trip_id, phase, result, note)
        VALUES (?, ?, ?, ?, ?, ?)
    ');
    $stmt->execute([
        $studentId,
        value($data, 'guard_id', 4),
        $tripId,
        (string) value($data, 'phase', 'school_to_home'),
        (string) value($data, 'result', 'verified'),
        value($data, 'note', 'Student QR verified'),
    ]);

    if ($tripId) {
        db()->prepare("UPDATE trips SET status = 'qr_verified' WHERE id = ?")->execute([(int) $tripId]);
    }

    respond(['ok' => true, 'scan_id' => (int) db()->lastInsertId()]);
} catch (Throwable $e) {
    respond(['ok' => false, 'error' => $e->getMessage()], 500);
}
