<?php

declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

try {
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $guardId = (int) value($_GET, 'guard_id', 0);
        if ($guardId) {
            $stmt = db()->prepare("SELECT sl.*, s.first_name, s.last_name, CONCAT(s.first_name, ' ', s.last_name) AS student_name FROM scan_logs sl JOIN students s ON s.id = sl.student_id WHERE sl.guard_id = ? ORDER BY sl.scanned_at DESC LIMIT 50");
            $stmt->execute([$guardId]);
            $rows = $stmt->fetchAll();
        } else {
            $rows = db()->query("SELECT sl.*, s.first_name, s.last_name FROM scan_logs sl JOIN students s ON s.id = sl.student_id ORDER BY sl.scanned_at DESC LIMIT 50")->fetchAll();
        }
        respond(['ok' => true, 'scans' => $rows]);
    }

    require_method('POST');
    $data = input();
    $studentId = (int) value($data, 'student_id', 0);
    $tripId = value($data, 'trip_id');

    // Allow guards to submit a qr_code instead of a student id
    $qr = trim((string) value($data, 'qr_code', ''));
    if ($studentId === 0 && $qr !== '') {
        $lookup = db()->prepare('SELECT id FROM students WHERE qr_code = ? LIMIT 1');
        $lookup->execute([$qr]);
        $found = $lookup->fetchColumn();
        if (!$found) {
            respond(['ok' => false, 'error' => 'QR code not recognized'], 404);
        }
        $studentId = (int) $found;
    }

    if (!$studentId) {
        respond(['ok' => false, 'error' => 'Missing child for this scan'], 422);
    }

    $stmt = db()->prepare('
        INSERT INTO scan_logs (student_id, guard_id, trip_id, phase, result, note)
        VALUES (?, ?, ?, ?, ?, ?)
    ');
    $stmt->execute([
        $studentId,
        value($data, 'guard_id', null),
        $tripId ?: null,
        (string) value($data, 'phase', 'school_to_home'),
        (string) value($data, 'result', 'verified'),
        value($data, 'note', 'Student QR verified'),
    ]);

    if ($tripId) {
        db()->prepare("UPDATE trips SET status = 'qr_verified' WHERE id = ?")->execute([(int) $tripId]);
        $parentQuery = db()->prepare('SELECT parent_id FROM trips WHERE id = ? LIMIT 1');
        $parentQuery->execute([(int) $tripId]);
        $parentId = (int) $parentQuery->fetchColumn();
        if ($parentId) {
            $notify = db()->prepare('INSERT INTO notifications (user_id, trip_id, type, title, message) VALUES (?, ?, ?, ?, ?)');
            $notify->execute([
                $parentId,
                (int) $tripId,
                'qr_verified',
                'QR verified at school gate',
                'A guard verified your child\'s QR code for the active trip.',
            ]);
        }
    }

    respond(['ok' => true, 'scan_id' => (int) db()->lastInsertId()]);
} catch (Throwable $e) {
    respond(['ok' => false, 'error' => $e->getMessage()], 500);
}
