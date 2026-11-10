<?php
require_once 'auth.php';
$next = trim((string)($_GET['next'] ?? 'index.html'));
if ($next === '' || preg_match('/^(?:[a-z]+:|\/\/|[\\\\])|\.\./i', $next) || str_contains($next, "\r") || str_contains($next, "\n")) $next = 'index.html';

// Hapus seluruh sesi login Admin/User.
$_SESSION = [];
if (ini_get('session.use_cookies')) {
    $params = session_get_cookie_params();
    setcookie(session_name(), '', time() - 42000,
        $params['path'], $params['domain'],
        $params['secure'], $params['httponly']
    );
}
session_destroy();

// Setelah keluar, langsung kembali ke halaman publik/user.
header('Location: ' . $next);
exit;
?>
