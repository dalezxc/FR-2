<?php

declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

try {
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        if ((int) value($_GET, 'latest', 0) === 1) {
            $stmt = db()->query('
                SELECT id, first_name, last_name, age, date_of_birth, grade_level, school_name, qr_code
                FROM students
                ORDER BY id DESC
                LIMIT 1
            ');
            respond(['ok' => true, 'child' => $stmt->fetch() ?: null]);
        }

        $parentId = (int) value($_GET, 'parent_id', 0);
        if (!$parentId) {
            respond(['ok' => false, 'error' => 'Missing parent'], 422);
        }

        $stmt = db()->prepare('
            SELECT id, first_name, last_name, age, date_of_birth, grade_level, school_name, qr_code
            FROM students
            WHERE parent_id = ?
            ORDER BY id ASC
        ');
        $stmt->execute([$parentId]);
        respond(['ok' => true, 'children' => $stmt->fetchAll()]);
    }

    require_method('POST');
    $data = input();
    $parentId = (int) value($data, 'parent_id', 0);
    $firstName = trim((string) value($data, 'first_name', ''));
    $lastName = trim((string) value($data, 'last_name', ''));
    $dateOfBirth = trim((string) value($data, 'date_of_birth', ''));
    $gradeLevel = trim((string) value($data, 'grade_level', ''));
    $age = value($data, 'age');
    $schoolName = trim((string) value($data, 'school_name', 'Lincoln Elementary School'));

    if (!$parentId || $firstName === '' || $lastName === '' || ($dateOfBirth === '' && $age === null) || $gradeLevel === '' || $schoolName === '') {
        respond(['ok' => false, 'error' => 'Complete the child details'], 422);
    }

    if ($dateOfBirth !== '') {
        $dob = DateTimeImmutable::createFromFormat('Y-m-d', $dateOfBirth);
        if (!$dob) {
            respond(['ok' => false, 'error' => "Enter a valid child's date of birth"], 422);
        }
        $age = $dob->diff(new DateTimeImmutable('today'))->y;
    } else {
        $age = filter_var($age, FILTER_VALIDATE_INT, [
            'options' => ['min_range' => 1, 'max_range' => 18],
        ]);
        if ($age === false) {
            respond(['ok' => false, 'error' => "Enter a valid child's age"], 422);
        }
    }

    $count = db()->prepare('SELECT COUNT(*) FROM students WHERE parent_id = ?');
    $count->execute([$parentId]);
    if ((int) $count->fetchColumn() >= 2) {
        respond(['ok' => false, 'error' => 'You can add up to 2 children only'], 422);
    }

    $school = db()->prepare('INSERT INTO schools (name) VALUES (?) ON DUPLICATE KEY UPDATE name = VALUES(name)');
    $school->execute([$schoolName]);
    $schoolId = (int) db()->lastInsertId();
    if (!$schoolId) {
        $schoolLookup = db()->prepare('SELECT id FROM schools WHERE name = ?');
        $schoolLookup->execute([$schoolName]);
        $schoolId = (int) $schoolLookup->fetchColumn();
    }

    $qrCode = 'RG-STUDENT-' . strtoupper(bin2hex(random_bytes(4)));
    $stmt = db()->prepare('
        INSERT INTO students (parent_id, school_id, first_name, last_name, age, date_of_birth, grade_level, school_name, qr_code)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ');
    $stmt->execute([$parentId, $schoolId ?: null, $firstName, $lastName, $age, $dateOfBirth ?: null, $gradeLevel, $schoolName, $qrCode]);

    respond([
        'ok' => true,
        'child' => [
            'id' => (int) db()->lastInsertId(),
            'first_name' => $firstName,
            'last_name' => $lastName,
            'age' => $age,
            'date_of_birth' => $dateOfBirth ?: null,
            'grade_level' => $gradeLevel,
            'school_name' => $schoolName,
            'qr_code' => $qrCode,
        ],
    ]);
} catch (Throwable $e) {
    respond(['ok' => false, 'error' => $e->getMessage()], 500);
}
