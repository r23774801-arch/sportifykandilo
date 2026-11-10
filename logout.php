<?php
require_once 'auth.php';

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
header('Location: index.html');
exit;
?>
