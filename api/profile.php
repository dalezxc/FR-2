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
            SELECT id, role, first_name, last_name, email, phone, created_at
            FROM users
            WHERE id = ?
        ');
        $stmt->execute([$userId]);
        $user = $stmt->fetch();
        if (!$user) {
            respond(['ok' => false, 'error' => 'Profile not found'], 404);
        }

        if ($user['role'] === 'parent') {
            $parent = db()->prepare('SELECT emergency_contact, address FROM parent_profiles WHERE parent_id = ?');
            $parent->execute([$userId]);
            $user['parent_profile'] = $parent->fetch() ?: ['emergency_contact' => null, 'address' => null];

            $children = db()->prepare('
                SELECT id, first_name, last_name, age, date_of_birth, grade_level, school_name, qr_code
                FROM students
                WHERE parent_id = ?
                ORDER BY id ASC
            ');
            $children->execute([$userId]);
            $user['children'] = $children->fetchAll();
        } elseif ($user['role'] === 'driver') {
            $driver = db()->prepare('
                SELECT dp.safety_score, dp.rating, dp.total_trips, dp.years_experience, dp.is_online,
                       v.make, v.model, v.plate_number, v.color
                FROM driver_profiles dp
                LEFT JOIN vehicles v ON v.driver_id = dp.driver_id
                WHERE dp.driver_id = ?
            ');
            $driver->execute([$userId]);
            $user['driver_profile'] = $driver->fetch() ?: null;
        } elseif ($user['role'] === 'guard') {
            $guard = db()->prepare('
                SELECT gp.assigned_gate, s.name AS school_name
                FROM guard_profiles gp
                LEFT JOIN schools s ON s.id = gp.school_id
                WHERE gp.guard_id = ?
            ');
            $guard->execute([$userId]);
            $user['guard_profile'] = $guard->fetch() ?: null;
        }

        respond(['ok' => true, 'profile' => $user]);
    }

    require_method('PATCH');
    $data = input();
    $userId = (int) value($data, 'user_id', 0);
    $firstName = trim((string) value($data, 'first_name', ''));
    $lastName = trim((string) value($data, 'last_name', ''));
    $phone = trim((string) value($data, 'phone', ''));
    $address = trim((string) value($data, 'address', ''));
    $emergencyContact = trim((string) value($data, 'emergency_contact', ''));
    $vehicleMake = trim((string) value($data, 'vehicle_make', ''));
    $vehicleModel = trim((string) value($data, 'vehicle_model', ''));
    $plateNumber = strtoupper(trim((string) value($data, 'plate_number', '')));
    $vehicleColor = trim((string) value($data, 'vehicle_color', ''));
    $yearsExperience = value($data, 'years_experience', null);

    if (!$userId || $firstName === '' || $lastName === '') {
        respond(['ok' => false, 'error' => 'Missing profile details'], 422);
    }

    $pdo = db();
    $pdo->beginTransaction();

    $stmt = $pdo->prepare('UPDATE users SET first_name = ?, last_name = ?, phone = ? WHERE id = ?');
    $stmt->execute([$firstName, $lastName, $phone ?: null, $userId]);

    $role = $pdo->prepare('SELECT role FROM users WHERE id = ?');
    $role->execute([$userId]);
    $userRole = (string) $role->fetchColumn();
    if ($userRole === 'parent') {
        $parent = $pdo->prepare('
            INSERT INTO parent_profiles (parent_id, emergency_contact, address)
            VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE emergency_contact = VALUES(emergency_contact), address = VALUES(address)
        ');
        $parent->execute([$userId, $emergencyContact ?: null, $address ?: null]);
    } elseif ($userRole === 'driver') {
        if ($yearsExperience !== null) {
            $yearsExperience = filter_var($yearsExperience, FILTER_VALIDATE_INT, [
                'options' => ['min_range' => 0, 'max_range' => 60],
            ]);
            if ($yearsExperience === false) {
                respond(['ok' => false, 'error' => 'Enter valid years of experience'], 422);
            }

            $driver = $pdo->prepare('
                INSERT INTO driver_profiles (driver_id, years_experience)
                VALUES (?, ?)
                ON DUPLICATE KEY UPDATE years_experience = VALUES(years_experience)
            ');
            $driver->execute([$userId, $yearsExperience]);
        }

        if ($vehicleMake !== '' || $vehicleModel !== '' || $plateNumber !== '' || $vehicleColor !== '') {
            if ($vehicleMake === '' || $vehicleModel === '' || $plateNumber === '') {
                respond(['ok' => false, 'error' => 'Complete your vehicle details'], 422);
            }

            $vehicle = $pdo->prepare('
                INSERT INTO vehicles (driver_id, make, model, plate_number, color)
                VALUES (?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE make = VALUES(make), model = VALUES(model), color = VALUES(color)
            ');
            $vehicle->execute([$userId, $vehicleMake, $vehicleModel, $plateNumber, $vehicleColor ?: null]);
        }
    }

    $pdo->commit();
    respond(['ok' => true]);
} catch (Throwable $e) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    respond(['ok' => false, 'error' => $e->getMessage()], 500);
}
