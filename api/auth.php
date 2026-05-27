<?php

declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

require_method('POST');

$data = input();
$action = (string) value($data, 'action', 'login');

try {
    if ($action === 'register') {
        $role = strtolower((string) value($data, 'role', 'parent'));
        if (!in_array($role, ['parent', 'driver', 'guard'], true)) {
            respond(['ok' => false, 'error' => 'Select parent, driver, or guard sign up'], 422);
        }

        $firstName = trim((string) value($data, 'first_name', ''));
        $lastName = trim((string) value($data, 'last_name', ''));
        $email = strtolower(trim((string) value($data, 'email', '')));
        $phone = trim((string) value($data, 'phone', ''));
        $vehicleMake = trim((string) value($data, 'vehicle_make', ''));
        $vehicleModel = trim((string) value($data, 'vehicle_model', ''));
        $plateNumber = strtoupper(trim((string) value($data, 'plate_number', '')));
        $vehicleColor = trim((string) value($data, 'vehicle_color', ''));
        $yearsExperience = (int) value($data, 'years_experience', 1);
        $childFirstName = trim((string) value($data, 'child_first_name', ''));
        $childLastName = trim((string) value($data, 'child_last_name', ''));
        $childDateOfBirth = trim((string) value($data, 'child_date_of_birth', ''));
        $childGradeLevel = trim((string) value($data, 'child_grade_level', ''));
        $schoolName = trim((string) value($data, 'school_name', 'Lincoln Elementary School'));
        $childAge = value($data, 'child_age');
        $password = (string) value($data, 'password', '');

        if ($firstName === '' || $lastName === '' || $email === '' || $phone === '') {
            respond(['ok' => false, 'error' => 'Complete your personal details'], 422);
        }

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            respond(['ok' => false, 'error' => 'Enter a valid email address'], 422);
        }

        if ($role === 'driver' && ($vehicleMake === '' || $vehicleModel === '' || $plateNumber === '')) {
            respond(['ok' => false, 'error' => 'Complete your vehicle details'], 422);
        }

        if ($role === 'driver' && ($yearsExperience < 0 || $yearsExperience > 60)) {
            respond(['ok' => false, 'error' => 'Enter valid years of experience'], 422);
        }

        if ($role === 'parent') {
        if ($childFirstName === '' || $childLastName === '' || ($childDateOfBirth === '' && $childAge === null) || $childGradeLevel === '' || $schoolName === '') {
            respond(['ok' => false, 'error' => "Complete your child's information"], 422);
        }

        if ($childDateOfBirth !== '') {
            $dob = DateTimeImmutable::createFromFormat('Y-m-d', $childDateOfBirth);
            if (!$dob) {
                respond(['ok' => false, 'error' => "Enter a valid child's date of birth"], 422);
            }
            $childAge = $dob->diff(new DateTimeImmutable('today'))->y;
        } else {
            $childAge = filter_var($childAge, FILTER_VALIDATE_INT, [
                'options' => ['min_range' => 1, 'max_range' => 18],
            ]);
            if ($childAge === false) {
                respond(['ok' => false, 'error' => "Enter a valid child's age"], 422);
            }
        }
        }

        if (!preg_match('/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/', $password)) {
            respond(['ok' => false, 'error' => 'Password must be 8+ characters with uppercase, lowercase, and a number'], 422);
        }

        $pdo = db();
        $existing = $pdo->prepare('SELECT id FROM users WHERE email = ? LIMIT 1');
        $existing->execute([$email]);
        if ($existing->fetch()) {
            respond(['ok' => false, 'error' => 'Email is already registered'], 409);
        }

        $pdo->beginTransaction();

        $stmt = $pdo->prepare('
            INSERT INTO users (role, first_name, last_name, email, phone, password_hash)
            VALUES (?, ?, ?, ?, ?, ?)
        ');
        $stmt->execute([
            $role,
            $firstName,
            $lastName,
            $email,
            $phone,
            password_hash($password, PASSWORD_DEFAULT),
        ]);
        $userId = (int) $pdo->lastInsertId();

        if ($role === 'driver') {
            $profile = $pdo->prepare('
                INSERT INTO driver_profiles (driver_id, safety_score, rating, total_trips, years_experience, is_online)
                VALUES (?, 98, 5.0, 0, ?, 1)
            ');
            $profile->execute([$userId, $yearsExperience]);

            $vehicle = $pdo->prepare('
                INSERT INTO vehicles (driver_id, make, model, plate_number, color)
                VALUES (?, ?, ?, ?, ?)
            ');
            $vehicle->execute([$userId, $vehicleMake, $vehicleModel, $plateNumber, $vehicleColor ?: null]);

            $pdo->commit();
            respond([
                'ok' => true,
                'user_id' => $userId,
                'user' => [
                    'id' => $userId,
                    'role' => $role,
                    'first_name' => $firstName,
                    'last_name' => $lastName,
                    'email' => $email,
                    'phone' => $phone,
                    'driver_profile' => [
                        'safety_score' => 98,
                        'rating' => 5.0,
                        'total_trips' => 0,
                        'years_experience' => $yearsExperience,
                        'is_online' => 1,
                        'make' => $vehicleMake,
                        'model' => $vehicleModel,
                        'plate_number' => $plateNumber,
                        'color' => $vehicleColor ?: null,
                    ],
                ],
            ]);
        }

        if ($role === 'guard') {
            $guardProfile = $pdo->prepare('
                INSERT INTO guard_profiles (guard_id, school_id, assigned_gate)
                VALUES (?, NULL, NULL)
            ');
            $guardProfile->execute([$userId]);

            $pdo->commit();
            respond([
                'ok' => true,
                'user_id' => $userId,
                'user' => [
                    'id' => $userId,
                    'role' => $role,
                    'first_name' => $firstName,
                    'last_name' => $lastName,
                    'email' => $email,
                    'phone' => $phone,
                    'guard_profile' => [
                        'assigned_gate' => null,
                        'school_id' => null,
                    ],
                ],
            ]);
        }

        $parentProfile = $pdo->prepare('
            INSERT INTO parent_profiles (parent_id, emergency_contact, address)
            VALUES (?, NULL, NULL)
        ');
        $parentProfile->execute([$userId]);

        $school = $pdo->prepare('INSERT INTO schools (name) VALUES (?) ON DUPLICATE KEY UPDATE name = VALUES(name)');
        $school->execute([$schoolName]);
        $schoolId = (int) $pdo->lastInsertId();
        if (!$schoolId) {
            $schoolLookup = $pdo->prepare('SELECT id FROM schools WHERE name = ?');
            $schoolLookup->execute([$schoolName]);
            $schoolId = (int) $schoolLookup->fetchColumn();
        }

        $qrCode = 'RG-STUDENT-' . strtoupper(bin2hex(random_bytes(4)));
        $child = $pdo->prepare('
            INSERT INTO students (parent_id, school_id, first_name, last_name, age, date_of_birth, grade_level, school_name, qr_code)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ');
        $child->execute([
            $userId,
            $schoolId ?: null,
            $childFirstName,
            $childLastName,
            $childAge,
            $childDateOfBirth ?: null,
            $childGradeLevel,
            $schoolName,
            $qrCode,
        ]);
        $studentId = (int) $pdo->lastInsertId();

        $pdo->commit();
        respond([
            'ok' => true,
            'user_id' => $userId,
            'student_id' => $studentId,
            'user' => [
                'id' => $userId,
                'role' => $role,
                'first_name' => $firstName,
                'last_name' => $lastName,
                'email' => $email,
                'parent_profile' => [
                    'emergency_contact' => null,
                    'address' => null,
                ],
                'child' => [
                    'id' => $studentId,
                    'first_name' => $childFirstName,
                    'last_name' => $childLastName,
                    'age' => $childAge,
                    'date_of_birth' => $childDateOfBirth ?: null,
                    'grade_level' => $childGradeLevel,
                    'school_name' => $schoolName,
                    'qr_code' => $qrCode,
                ],
                'children' => [[
                    'id' => $studentId,
                    'first_name' => $childFirstName,
                    'last_name' => $childLastName,
                    'age' => $childAge,
                    'date_of_birth' => $childDateOfBirth ?: null,
                    'grade_level' => $childGradeLevel,
                    'school_name' => $schoolName,
                    'qr_code' => $qrCode,
                ]],
            ],
        ]);
    }

    $email = strtolower(trim((string) value($data, 'email', '')));
    $password = (string) value($data, 'password', '');

    if ($email === '' || $password === '') {
        respond(['ok' => false, 'error' => 'Enter your email and password'], 422);
    }

    $stmt = db()->prepare('SELECT id, role, first_name, last_name, email, password_hash FROM users WHERE email = ?');
    $stmt->execute([$email]);
    $user = $stmt->fetch();

    if (!$user || !password_verify((string) value($data, 'password', ''), $user['password_hash'])) {
        respond(['ok' => false, 'error' => 'Invalid email or password'], 401);
    }

    unset($user['password_hash']);
    if ($user['role'] === 'parent') {
        $child = db()->prepare('
            SELECT id, first_name, last_name, age, date_of_birth, grade_level, school_name, qr_code
            FROM students
            WHERE parent_id = ?
            ORDER BY id ASC
        ');
        $child->execute([(int) $user['id']]);
        $children = $child->fetchAll();
        $user['children'] = $children;
        $user['child'] = $children[0] ?? null;
    } elseif ($user['role'] === 'guard') {
        $guard = db()->prepare('
            SELECT gp.assigned_gate, s.name AS school_name
            FROM guard_profiles gp
            LEFT JOIN schools s ON s.id = gp.school_id
            WHERE gp.guard_id = ?
        ');
        $guard->execute([(int) $user['id']]);
        $user['guard_profile'] = $guard->fetch() ?: null;
    }

    respond(['ok' => true, 'user' => $user]);
} catch (Throwable $e) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    respond(['ok' => false, 'error' => $e->getMessage()], 500);
}
