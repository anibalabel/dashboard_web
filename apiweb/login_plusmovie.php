<?php
header('Content-Type: application/json');

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once __DIR__ . '/db_plusmovie/Database.php';

try {
    $db = new PlusMovieDatabase();
    $conn = $db->connect();
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Error al conectar a la base de datos: ' . $e->getMessage()]);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];
if ($method !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Método no permitido']);
    $db->closeConnection();
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);
if (!$input) {
    $input = $_POST;
}

$email = isset($input['email']) ? trim((string)$input['email']) : '';
$password = isset($input['password']) ? (string)$input['password'] : '';

if ($email === '' || $password === '') {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Faltan parámetros (email, password)']);
    $db->closeConnection();
    exit;
}

$password_md5 = md5($password);
$required_role = 'admin';

try {
    $stmt = $conn->prepare("SELECT username, role FROM `user` WHERE email = :email AND password = :password AND role = :role LIMIT 1");
    $stmt->bindParam(':email', $email);
    $stmt->bindParam(':password', $password_md5);
    $stmt->bindParam(':role', $required_role);
    $stmt->execute();
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$user) {
        http_response_code(401);
        echo json_encode(['success' => false, 'error' => 'Credenciales inválidas o sin permisos']);
        $db->closeConnection();
        exit;
    }

    echo json_encode([
        'success' => true,
        'message' => 'Login correcto',
        'data' => [
            'username' => $user['username'],
            'role' => $user['role'],
        ]
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Error al procesar el login: ' . $e->getMessage()]);
}

$db->closeConnection();
?>
