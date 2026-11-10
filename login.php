<?php
require_once 'koneksi.php';
require_once 'auth.php';

$error = '';

$adminMode = isset($_GET['admin']) && $_GET['admin'] === '1';
$next = trim((string)($_REQUEST['next'] ?? 'index.html'));
if ($next === '' || preg_match('/^(?:[a-z]+:|\/\/|[\\\\])|\.\./i', $next) || str_contains($next, "\r") || str_contains($next, "\n")) $next = 'index.html';

if (is_logged_in()) {
    if ($adminMode && !is_admin()) {
        $_SESSION = [];
        session_regenerate_id(true);
    } else {
        header('Location: ' . $next);
        exit;
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $email = trim($_POST['email'] ?? '');
    $password = $_POST['password'] ?? '';

    $stmt = $conn->prepare("SELECT users.id, users.nama_lengkap, users.email, users.password, roles.role_name AS role
                            FROM users
                            LEFT JOIN roles ON users.role_id = roles.id
                            WHERE users.email = ?
                            LIMIT 1");
    $stmt->bind_param("s", $email);
    $stmt->execute();
    $result = $stmt->get_result();
    $user = $result->fetch_assoc();

    if ($user && password_verify($password, $user['password'])) {
        $role = trim((string)($user['role'] ?? 'User'));
        if ($adminMode && !in_array(strtolower($role), ['admin','administrator','super admin','superadmin'], true)) {
            $error = 'Akun ini bukan akun Admin. Silakan gunakan akun Admin.';
        } else {
        $_SESSION['user'] = [
            'id' => $user['id'],
            'nama_lengkap' => $user['nama_lengkap'],
            'email' => $user['email'],
            'role' => $role,
            'is_admin' => in_array(strtolower($role), ['admin','administrator','super admin','superadmin'], true)
        ];
        session_regenerate_id(true);
        header('Location: ' . $next);
        exit;
        }
    }

    $error = 'Email atau password salah.';
}
?>
<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?= $adminMode ? "Admin Login" : "Login" ?> - Sportify Kandilo</title>
    <style>
        * { box-sizing: border-box; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
        body {
            margin: 0;
            min-height: 100vh;
            display: grid;
            place-items: center;
            background: linear-gradient(135deg, #111827, #243746);
            color: #111827;
        }
        .login-card {
            width: min(420px, calc(100% - 32px));
            background: #ffffff;
            border-radius: 12px;
            padding: 30px;
            box-shadow: 0 24px 60px rgba(0,0,0,0.24);
        }
        .brand { display: flex; align-items: center; gap: 14px; margin-bottom: 24px; }
        .brand img { width: 58px; height: 58px; border-radius: 12px; object-fit: cover; }
        .brand h1 { font-size: 22px; line-height: 1.15; margin: 0; }
        .brand span { color: #f37021; display: block; }
        label { display: block; font-size: 13px; font-weight: 700; margin-bottom: 7px; }
        input {
            width: 100%;
            border: 1px solid #d8dee8;
            border-radius: 8px;
            padding: 12px 14px;
            margin-bottom: 16px;
            font-size: 14px;
        }
        button {
            width: 100%;
            border: 0;
            border-radius: 8px;
            padding: 12px 16px;
            background: linear-gradient(90deg, #ffcf00, #f37021);
            color: #111827;
            font-weight: 800;
            cursor: pointer;
        }
        .error {
            background: #fee2e2;
            color: #991b1b;
            border-radius: 8px;
            padding: 10px 12px;
            font-size: 13px;
            margin-bottom: 16px;
        }
    </style>

<style id="sportify-loading-style">
#sportify-page-loader{position:fixed;inset:0;background:rgba(17,24,39,.97);display:flex;align-items:center;justify-content:center;z-index:99999;opacity:1;visibility:visible;transition:opacity .35s ease,visibility .35s ease}#sportify-page-loader.hide{opacity:0;visibility:hidden;pointer-events:none}.sportify-loader-box{text-align:center}.sportify-loader-logo{width:92px;height:92px;object-fit:contain;border-radius:18px;animation:sportifyLogoPulse 1.15s ease-in-out infinite;filter:drop-shadow(0 8px 18px rgba(0,0,0,.35))}.sportify-loader-ring{width:116px;height:116px;border:4px solid rgba(255,207,0,.22);border-top-color:#ffcf00;border-right-color:#f37021;border-radius:50%;position:absolute;margin:-104px 0 0 -12px;animation:sportifySpin 1s linear infinite}.sportify-loader-text{margin-top:22px;color:#fff;font-weight:800;letter-spacing:1.5px;font-size:15px}.sportify-loader-dots{margin-top:8px;color:#ffcf00;letter-spacing:4px;animation:sportifyDots 1s infinite}.sportify-loader-wrap{position:relative;width:116px;height:116px;margin:auto;display:flex;align-items:center;justify-content:center}@keyframes sportifySpin{to{transform:rotate(360deg)}}@keyframes sportifyLogoPulse{0%,100%{transform:scale(.94)}50%{transform:scale(1.04)}}@keyframes sportifyDots{0%,100%{opacity:.35}50%{opacity:1}}
</style>
</head>
<body>
<div id="sportify-page-loader" aria-hidden="true"><div class="sportify-loader-box"><div class="sportify-loader-wrap"><span class="sportify-loader-ring"></span><img class="sportify-loader-logo" src="img/logo_sportify.jpeg" alt="Sportify Kandilo"></div><div class="sportify-loader-text">SPORTIFY KANDILO</div><div class="sportify-loader-dots">•••</div></div></div>

    <form class="login-card" method="POST">
        <input type="hidden" name="next" value="<?= htmlspecialchars($next, ENT_QUOTES, 'UTF-8') ?>">
        <div class="brand">
            <img src="img/logo_sportify.jpeg" alt="Logo Sportify Kandilo">
            <h1>SPORTIFY<span>KANDILO</span></h1>
        </div>
        <?php if ($error): ?>
            <div class="error"><?= htmlspecialchars($error) ?></div>
        <?php endif; ?>
        <label>Email</label>
        <input type="email" name="email" placeholder="admin@gmail.com" required>
        <label>Password</label>
        <input type="password" name="password" placeholder="Password" required>
        <button type="submit"><?= $adminMode ? "Masuk sebagai Admin" : "Masuk" ?></button>
    </form>

<script id="sportify-loading-script">(function(){
const loader=document.getElementById('sportify-page-loader');
function hide(){if(loader) loader.classList.add('hide')}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(hide,180)); else setTimeout(hide,180);
document.addEventListener('click',function(e){
 const a=e.target.closest('a'); if(!a||!loader) return;
 const href=a.getAttribute('href')||'';
 if(!href||href.startsWith('#')||href.startsWith('javascript:')||a.target==='_blank'||a.hasAttribute('download')) return;
 if(e.ctrlKey||e.metaKey||e.shiftKey||e.altKey||e.button!==0) return;
 try{const u=new URL(a.href,location.href); if(u.origin!==location.origin) return; if(u.href===location.href) return;}catch(_){return}
 loader.classList.remove('hide');
},true);
window.addEventListener('pageshow',function(){setTimeout(hide,120)});
})();</script>
</body>
</html>
