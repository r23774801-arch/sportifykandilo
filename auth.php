<?php
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

function current_user() {
    return $_SESSION['user'] ?? null;
}

function is_logged_in() {
    return current_user() !== null;
}

function is_admin() {
    $user = current_user();
    $role = strtolower(trim((string)($user['role'] ?? '')));
    return $user && in_array($role, ['admin','administrator','super admin','superadmin'], true);
}

function require_login_json() {
    if (!is_logged_in()) {
        http_response_code(401);
        echo json_encode(["status" => "error", "message" => "Silakan login terlebih dahulu."]);
        exit;
    }
}

function require_admin_json() {
    require_login_json();
    if (!is_admin()) {
        http_response_code(403);
        echo json_encode(["status" => "error", "message" => "Akses hanya untuk admin."]);
        exit;
    }
}
?>
