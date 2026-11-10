<?php
$host = "localhost";
$user = "root";
$password = "";
$dbname = "sportify_kandilo";

$conn = new mysqli($host, $user, $password, $dbname);

if ($conn->connect_error) {
    die(json_encode(["status" => "error", "message" => "Koneksi database gagal: " . $conn->connect_error]));
}
?>