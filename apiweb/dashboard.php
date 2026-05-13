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

require_once __DIR__ . '/db_docines/Database.php';
require_once __DIR__ . '/db_plusmovie/Database.php';
require_once __DIR__ . '/db_dooplex/Database.php';

function getCount(PDO $conn, string $sql, array $params = []): int {
    $stmt = $conn->prepare($sql);
    foreach ($params as $key => $value) {
        $stmt->bindValue($key, $value);
    }
    $stmt->execute();
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return (int)($row['total'] ?? 0);
}

try {
    $docinesDb = new DocinesDatabase();
    $docinesConn = $docinesDb->connect();

    $plusMovieDb = new PlusMovieDatabase();
    $plusMovieConn = $plusMovieDb->connect();

    $dooplexDb = new DooplexDatabase();
    $dooplexConn = $dooplexDb->connect();

    $data = [
        'docines' => [
            'series' => getCount($docinesConn, "SELECT COUNT(*) AS total FROM web_series"),
            'movies' => getCount($docinesConn, "SELECT COUNT(*) AS total FROM movies")
        ],
        'plusmovie' => [
            'movies' => getCount($plusMovieConn, "SELECT COUNT(*) AS total FROM videos WHERE is_tvseries = :is_tvseries", [':is_tvseries' => 0]),
            'series' => getCount($plusMovieConn, "SELECT COUNT(*) AS total FROM videos WHERE is_tvseries = :is_tvseries", [':is_tvseries' => 1])
        ],
        'dooplex' => [
            'movies' => getCount($dooplexConn, "SELECT COUNT(*) AS total FROM movies"),
            'series' => getCount($dooplexConn, "SELECT COUNT(*) AS total FROM series"),
            'animes' => getCount($dooplexConn, "SELECT COUNT(*) AS total FROM animes")
        ]
    ];

    echo json_encode(['success' => true, 'data' => $data]);

    $docinesDb->closeConnection();
    $plusMovieDb->closeConnection();
    $dooplexDb->closeConnection();
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Error al generar dashboard: ' . $e->getMessage()]);
}
?>
