<?php
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Método no permitido']);
    exit;
}

if (!isset($_FILES['file'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'No se recibió ningún archivo']);
    exit;
}

$file = $_FILES['file'];

if (!isset($file['error']) || $file['error'] !== UPLOAD_ERR_OK) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Error al subir el archivo']);
    exit;
}

$ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
if ($ext !== 'apk') {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'El archivo debe ser .apk']);
    exit;
}

$destination = __DIR__ . DIRECTORY_SEPARATOR . 'app-streamnexus.apk';

if (!move_uploaded_file($file['tmp_name'], $destination)) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'No se pudo guardar el archivo en el servidor']);
    exit;
}

$scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
$host = $_SERVER['HTTP_HOST'] ?? '';
$basePath = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/')), '/');
$basePath = ($basePath === '' || $basePath === '.') ? '' : $basePath;
$url = $scheme . '://' . $host . $basePath . '/app-streamnexus.apk';

echo json_encode([
    'success' => true,
    'filename' => 'app-streamnexus.apk',
    'url' => $url
]);
?>
