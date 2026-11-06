<?php
header('Content-Type: application/json');

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once __DIR__ . '/db_dooplex/Database.php';

try {
    $db = new DooplexDatabase();
    $conn = $db->connect();
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Error al conectar a la base de datos Dooplex: ' . $e->getMessage()]);
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

try {
    // Buscar usuario por email en la tabla `users`
    $stmt = $conn->prepare("SELECT * FROM `users` WHERE email = :email LIMIT 1");
    $stmt->bindParam(':email', $email);
    $stmt->execute();
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$user) {
        http_response_code(401);
        echo json_encode(['success' => false, 'error' => 'Credenciales inválidas o usuario no encontrado']);
        $db->closeConnection();
        exit;
    }

    $dbPassword = $user['password'] ?? '';
    $isValidPassword = false;

    // 1. Verificación estándar con bcrypt ($2y$...)
    if (password_verify($password, $dbPassword)) {
        $isValidPassword = true;
    } elseif ($dbPassword === md5($password) || $dbPassword === $password) {
        // 2. Soporte fallback (MD5 o texto plano)
        $isValidPassword = true;
    }

    if (!$isValidPassword) {
        http_response_code(401);
        echo json_encode(['success' => false, 'error' => 'Credenciales inválidas']);
        $db->closeConnection();
        exit;
    }

    $username = $user['name'] ?? $user['username'] ?? $user['email'];
    $role = $user['role'] ?? 'admin';

    echo json_encode([
        'success' => true,
        'message' => 'Login correcto',
        'data' => [
            'username' => $username,
            'role' => (string)$role,
        ]
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Error al procesar el login: ' . $e->getMessage()]);
}

$db->closeConnection();
?>
