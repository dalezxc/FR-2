<?php

declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

try {
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $role = (string) value($_GET, 'role', 'parent');
        $userId = (int) value($_GET, 'user_id', 0);
        if (!$userId) {
            respond(['ok' => false, 'error' => 'Missing user_id'], 422);
        }
        $where = $role === 'driver' ? 't.driver_id = ?' : 't.parent_id = ?';

        $stmt = db()->prepare("
            SELECT t.*, s.first_name AS student_first_name, s.last_name AS student_last_name,
                   d.first_name AS driver_first_name, d.last_name AS driver_last_name,
                   v.make, v.model, v.plate_number
            FROM trips t
            JOIN students s ON s.id = t.student_id
            LEFT JOIN users d ON d.id = t.driver_id
            LEFT JOIN vehicles v ON v.driver_id = d.id
            WHERE {$where}
              AND NOT (t.id = 1 AND s.qr_code = 'RG-STUDENT-EMMA-001')
            ORDER BY t.scheduled_date DESC, t.pickup_time DESC
        ");
        $stmt->execute([$userId]);
        respond(['ok' => true, 'trips' => $stmt->fetchAll()]);
    }

    if ($_SERVER['REQUEST_METHOD'] === 'PATCH') {
        $data = input();
        $status = (string) value($data, 'status', 'pending');
        $allowed = ['pending', 'accepted', 'qr_verified', 'in_progress', 'completed', 'cancelled'];
        if (!in_array($status, $allowed, true)) {
            respond(['ok' => false, 'error' => 'Invalid trip status'], 422);
        }

        $tripId = (int) value($data, 'trip_id', 0);
        if (!$tripId) {
            respond(['ok' => false, 'error' => 'Missing trip'], 422);
        }

        $stmt = db()->prepare('UPDATE trips SET status = ? WHERE id = ?');
        $stmt->execute([$status, $tripId]);

        $trip = db()->prepare('
            SELECT t.*, s.first_name AS student_first_name, s.last_name AS student_last_name,
                   d.first_name AS driver_first_name, d.last_name AS driver_last_name
            FROM trips t
            JOIN students s ON s.id = t.student_id
            LEFT JOIN users d ON d.id = t.driver_id
            WHERE t.id = ?
        ');
        $trip->execute([$tripId]);
        $row = $trip->fetch();

        if ($row) {
            $studentName = trim($row['student_first_name'] . ' ' . $row['student_last_name']);
            $driverName = trim((string) $row['driver_first_name'] . ' ' . (string) $row['driver_last_name']);
            $messages = [
                'accepted' => ['Driver accepted your trip', "{$driverName} accepted {$studentName}'s trip request."],
                'qr_verified' => ['QR verification complete', "{$studentName}'s QR code was verified."],
                'in_progress' => ['Trip started', "{$studentName}'s trip is now active."],
                'completed' => ['Child arrived safely', "{$studentName}'s trip has been completed."],
                'cancelled' => ['Trip cancelled', "{$studentName}'s trip was cancelled."],
            ];
            if (isset($messages[$status])) {
                $notify = db()->prepare('
                    INSERT INTO notifications (user_id, trip_id, type, title, message)
                    VALUES (?, ?, ?, ?, ?)
                ');
                $notify->execute([(int) $row['parent_id'], $tripId, 'trip_' . $status, $messages[$status][0], $messages[$status][1]]);
            }
        }

        respond(['ok' => true]);
    }

    require_method('POST');
    $data = input();
    $parentId = (int) value($data, 'parent_id', 0);
    $studentId = (int) value($data, 'student_id', 0);
    $driverId = (int) value($data, 'driver_id', 0);
    $tripType = (string) value($data, 'trip_type', '');
    $pickupAddress = trim((string) value($data, 'pickup_address', ''));
    $dropoffAddress = trim((string) value($data, 'dropoff_address', ''));
    $pickupTime = (string) value($data, 'pickup_time', '');
    $scheduledDate = (string) value($data, 'scheduled_date', '');

    if (!$parentId || !$studentId || !$driverId) {
        respond(['ok' => false, 'error' => 'Missing parent, child, or driver for this trip'], 422);
    }

    if (!in_array($tripType, ['home_to_school', 'school_to_home'], true)) {
        respond(['ok' => false, 'error' => 'Select a valid trip type'], 422);
    }

    if ($pickupAddress === '' || $dropoffAddress === '' || $pickupTime === '' || $scheduledDate === '') {
        respond(['ok' => false, 'error' => 'Complete the trip details'], 422);
    }

    $owner = db()->prepare('SELECT id FROM students WHERE id = ? AND parent_id = ?');
    $owner->execute([$studentId, $parentId]);
    if (!$owner->fetch()) {
        respond(['ok' => false, 'error' => 'Selected child does not belong to this parent'], 403);
    }

    $stmt = db()->prepare('
        INSERT INTO trips (parent_id, student_id, driver_id, trip_type, pickup_address, dropoff_address, pickup_time, scheduled_date, is_recurring)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ');
    $stmt->execute([
        $parentId,
        $studentId,
        $driverId,
        $tripType,
        $pickupAddress,
        $dropoffAddress,
        $pickupTime,
        $scheduledDate,
        (int) value($data, 'is_recurring', 0),
    ]);
    $tripId = (int) db()->lastInsertId();

    $notify = db()->prepare('
        INSERT INTO notifications (user_id, trip_id, type, title, message)
        VALUES (?, ?, ?, ?, ?)
    ');
    $notify->execute([$driverId, $tripId, 'new_trip_request', 'New trip request', 'A parent scheduled a trip request for your review.']);

    respond(['ok' => true, 'trip_id' => $tripId]);
} catch (Throwable $e) {
    respond(['ok' => false, 'error' => $e->getMessage()], 500);
}
