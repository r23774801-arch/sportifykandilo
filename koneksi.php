<?php
$host = "localhost";
$user = "root";
$password = "";
$dbname = "sportify_kandilo";
$port = 3307;

$conn = new mysqli($host, $user, $password, $dbname, $port);

if ($conn->connect_error) {
    die(json_encode(["status" => "error", "message" => "Koneksi database gagal: " . $conn->connect_error]));
}
?>