<?php
header('Content-Type: application/json; charset=UTF-8');
require_once 'auth.php';

if (!is_logged_in()) {
    http_response_code(401);
    echo json_encode(["status" => "error", "message" => "Belum login."]);
    exit;
}

echo json_encode([
    "status" => "success",
    "user" => current_user(),
    "role" => current_user()['role'] ?? 'User',
    "is_admin" => is_admin()
]);
?>
