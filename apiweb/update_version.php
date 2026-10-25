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

$raw = file_get_contents('php://input');
$payload = json_decode($raw, true);

$version = null;

if (is_array($payload)) {
    if (isset($payload['version']) && is_string($payload['version'])) {
        $version = $payload['version'];
    } else if (isset($payload['v']) && is_numeric($payload['v'])) {
        $d = intval($payload['v']);
        if ($d < 0) $d = 0;
        if ($d > 9) $d = 9;
        $version = strval($d) . '.0';
    }
}

if (!is_string($version) || !preg_match('/^[0-9]\.[0-9]$/', $version)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Payload inválido. Se espera {"version":"X.X"} con X en [0-9]']);
    exit;
}

$filePath = __DIR__ . DIRECTORY_SEPARATOR . 'v-streamnexus.json';
$current = [];

if (file_exists($filePath)) {
    $existingRaw = file_get_contents($filePath);
    $decoded = json_decode($existingRaw, true);
    if (is_array($decoded)) $current = $decoded;
}

$current['version'] = $version;

$json = json_encode($current, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
if ($json === false) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'No se pudo codificar el JSON']);
    exit;
}

$written = file_put_contents($filePath, $json . "\n");
if ($written === false) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'No se pudo guardar v-streamnexus.json']);
    exit;
}

echo json_encode(['success' => true, 'version' => $version]);
?>
