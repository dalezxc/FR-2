<?php

declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

try {
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $userId = (int) value($_GET, 'user_id', 0);
        if (!$userId) {
            respond(['ok' => false, 'error' => 'Missing user'], 422);
        }

        $stmt = db()->prepare('
            SELECT id, trip_id, type, title, message, is_read, created_at
            FROM notifications
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT 20
        ');
        $stmt->execute([$userId]);
        respond(['ok' => true, 'notifications' => $stmt->fetchAll()]);
    }

    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $data = input();
        $userId = (int) value($data, 'user_id', 0);
        $title = trim((string) value($data, 'title', ''));
        $message = trim((string) value($data, 'message', ''));
        $type = trim((string) value($data, 'type', 'manual_alert'));
        $tripId = (int) value($data, 'trip_id', 0);

        if (!$userId || $title === '' || $message === '') {
            respond(['ok' => false, 'error' => 'Missing alert user, title, or message'], 422);
        }

        $stmt = db()->prepare('
            INSERT INTO notifications (user_id, trip_id, type, title, message)
            VALUES (?, ?, ?, ?, ?)
        ');
        $stmt->execute([$userId, $tripId ?: null, $type, $title, $message]);
        respond(['ok' => true, 'notification_id' => (int) db()->lastInsertId()]);
    }

    require_method('PATCH');
    $data = input();
    $notificationId = (int) value($data, 'notification_id', 0);
    if (!$notificationId) {
        respond(['ok' => false, 'error' => 'Missing notification'], 422);
    }

    $stmt = db()->prepare('UPDATE notifications SET is_read = 1 WHERE id = ?');
    $stmt->execute([$notificationId]);
    respond(['ok' => true]);
} catch (Throwable $e) {
    respond(['ok' => false, 'error' => $e->getMessage()], 500);
}
