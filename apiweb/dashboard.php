<?php
header('Content-Type: application/json');

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Método no permitido']);
    exit;
}

require_once __DIR__ . '/db_dooplex/Database.php';

function getCount(PDO $conn, string $sql): int {
    try {
        $stmt = $conn->prepare($sql);
        $stmt->execute();
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return (int)($row['total'] ?? 0);
    } catch (Exception $e) {
        return 0;
    }
}

try {
    $dooplexDb = new DooplexDatabase();
    $dooplexConn = $dooplexDb->connect();

    $moviesCount = getCount($dooplexConn, "SELECT COUNT(*) AS total FROM movies");
    $seriesCount = getCount($dooplexConn, "SELECT COUNT(*) AS total FROM series");
    $animesCount = getCount($dooplexConn, "SELECT COUNT(*) AS total FROM animes");

    $data = [
        'dooplex' => [
            'movies' => $moviesCount,
            'series' => $seriesCount,
            'animes' => $animesCount
        ]
    ];

    echo json_encode([
        'success' => true,
        'data' => $data
    ]);

    $dooplexDb->closeConnection();
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Error al conectar a la base de datos Dooplex: ' . $e->getMessage()
    ]);
}
?>
