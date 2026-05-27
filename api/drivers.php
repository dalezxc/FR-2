<?php

declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

try {
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $rows = db()->query("
            SELECT u.id, u.first_name, u.last_name, dp.safety_score, dp.rating, dp.total_trips,
                   dp.years_experience, dp.is_online, v.make, v.model, v.plate_number, v.color
            FROM users u
            JOIN driver_profiles dp ON dp.driver_id = u.id
            LEFT JOIN vehicles v ON v.driver_id = u.id
            WHERE u.role = 'driver'
            ORDER BY dp.safety_score DESC
        ")->fetchAll();
        respond(['ok' => true, 'drivers' => $rows]);
    }

    require_method('PATCH');
    $data = input();
    $stmt = db()->prepare('UPDATE driver_profiles SET is_online = ? WHERE driver_id = ?');
    $stmt->execute([(int) value($data, 'is_online', 1), (int) value($data, 'driver_id', 2)]);
    respond(['ok' => true]);
} catch (Throwable $e) {
    respond(['ok' => false, 'error' => $e->getMessage()], 500);
}
