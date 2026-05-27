<?php

declare(strict_types=1);

require_once __DIR__ . '/../config/database.php';

header('Content-Type: application/json; charset=utf-8');

function input(): array
{
    $raw = file_get_contents('php://input') ?: '';
    $data = json_decode($raw, true);
    return is_array($data) ? $data : $_POST;
}

function respond(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_SLASHES);
    exit;
}

function require_method(string $method): void
{
    if ($_SERVER['REQUEST_METHOD'] !== $method) {
        respond(['ok' => false, 'error' => 'Method not allowed'], 405);
    }
}

function value(array $data, string $key, mixed $default = null): mixed
{
    return array_key_exists($key, $data) && $data[$key] !== '' ? $data[$key] : $default;
}
