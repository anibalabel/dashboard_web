<?php
header('Content-Type: application/json');

// Permitir peticiones CORS
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Cargar la conexión a la base de datos db_plusmovie
require_once __DIR__ . '/db_plusmovie/Database.php';
require_once __DIR__ . '/duplicate_check.php';

try {
    $db = new PlusMovieDatabase();
    $conn = $db->connect();
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Error al conectar a la base de datos: ' . $e->getMessage()]);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];

switch ($method) {
    case 'GET':
        // 1: Obtener 'title', 'videos_id' de tabla 'videos' buscado por 'tmdbid'
        if (isset($_GET['tmdbid'])) {
            $tmdbid = $_GET['tmdbid'];
            $stmt = $conn->prepare("SELECT title, videos_id FROM videos WHERE tmdbid = :tmdbid");
            $stmt->bindParam(':tmdbid', $tmdbid);
            $stmt->execute();
            $result = $stmt->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode(['data' => $result]);
            break;
        }
        
        // 2: Obtener 'video_file_id', 'file_url', 'label', 'order' de tabla 'video_file' buscar por 'videos_id'
        if (isset($_GET['videos_id'])) {
            $videos_id = $_GET['videos_id'];
            $stmt = $conn->prepare("SELECT video_file_id, file_url, label, `order` FROM video_file WHERE videos_id = :videos_id");
            $stmt->bindParam(':videos_id', $videos_id);
            $stmt->execute();
            $result = $stmt->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode(['data' => $result]);
            break;
        }

        echo json_encode(['error' => 'Faltan parámetros (tmdbid o videos_id)']);
        break;

    case 'DELETE':
        // 4: Eliminar por 'video_file_id' en la tabla 'video_file'
        $input = json_decode(file_get_contents('php://input'), true);
        $video_file_id = $_GET['video_file_id'] ?? ($input['video_file_id'] ?? null);

        if ($video_file_id) {
            $stmt = $conn->prepare("DELETE FROM video_file WHERE video_file_id = :video_file_id");
            $stmt->bindParam(':video_file_id', $video_file_id);
            if ($stmt->execute()) {
                echo json_encode(['message' => 'Eliminado correctamente']);
            } else {
                http_response_code(500);
                echo json_encode(['error' => 'Error al eliminar el registro']);
            }
        } else {
            http_response_code(400);
            echo json_encode(['error' => 'Falta el parámetro video_file_id']);
        }
        break;

    case 'POST':
    case 'PUT':
        // Leer el JSON o el Form Data del cuerpo (body) de la request
        $input = json_decode(file_get_contents('php://input'), true);
        if (!$input) {
            $input = $_POST;
        }

        $videos_id = $input['videos_id'] ?? null;
        $file_url = $input['file_url'] ?? null;
        $label = $input['label'] ?? null;
        $order = $input['order'] ?? null;
        $video_file_id = $input['video_file_id'] ?? null;

        // Si es PUT o si enviaron 'video_file_id' en POST, identificamos que es una actualización (Update)
        if ($method === 'PUT' || $video_file_id !== null) {
            if (!$video_file_id) {
                 http_response_code(400);
                 echo json_encode(['error' => 'Falta el parámetro video_file_id para actualizar']);
                 break;
            }

            if ($file_url === null || trim((string)$file_url) === '' || $label === null || trim((string)$label) === '' || $order === null || trim((string)$order) === '') {
                http_response_code(400);
                echo json_encode(['error' => 'Faltan parámetros (file_url, label, order)']);
                break;
            }
            
            $stmt = $conn->prepare("UPDATE video_file SET 
                file_url = :file_url,
                label = :label,
                `order` = :order
                WHERE video_file_id = :video_file_id");

            $stmt->bindParam(':file_url', $file_url);
            $stmt->bindParam(':label', $label);
            $stmt->bindParam(':order', $order);
            $stmt->bindParam(':video_file_id', $video_file_id);
            
            if ($stmt->execute()) {
                echo json_encode(['message' => 'Actualizado correctamente']);
            } else {
                http_response_code(500);
                echo json_encode(['error' => 'Error al actualizar']);
            }
            
        } else {
            // 5: Registro / Insert
            $file_url = trimNullableUrl($file_url);
            if (!$videos_id || $file_url === null || $label === null || trim((string)$label) === '') {
                http_response_code(400);
                echo json_encode(['error' => 'Faltan parámetros (videos_id, file_url, label)']);
                break;
            }

            $stmt = $conn->prepare("SELECT video_file_id, file_url, `order` FROM video_file WHERE videos_id = :videos_id ORDER BY `order` ASC");
            $stmt->bindParam(':videos_id', $videos_id);
            $stmt->execute();
            $orders = $stmt->fetchAll(PDO::FETCH_ASSOC);

            $duplicateRow = findDuplicateUrlRow($orders, 'file_url', $file_url);
            if ($duplicateRow !== null) {
                echo json_encode(buildDuplicateResponse([
                    'video_file_id' => (string)$duplicateRow['video_file_id'],
                    'order' => (int)($duplicateRow['order'] ?? 0)
                ]));
                break;
            }

            $next_order = 1;
            foreach ($orders as $row) {
                $current = isset($row['order']) ? (int)$row['order'] : 0;
                if ($current < $next_order) {
                    continue;
                }
                if ($current === $next_order) {
                    $next_order++;
                    continue;
                }
                if ($current > $next_order) {
                    break;
                }
            }

            // Generar stream_key automáticamente de longitud 12
            $stream_key = $db->generateStreamKey(12);
            $file_source = 'embed';
            $source_type = 'link';

            $stmt = $conn->prepare("INSERT INTO video_file 
                (stream_key, videos_id, file_source, source_type, file_url, label, `order`) 
                VALUES (:stream_key, :videos_id, :file_source, :source_type, :file_url, :label, :order)");
                
            $stmt->bindParam(':stream_key', $stream_key);
            $stmt->bindParam(':videos_id', $videos_id);
            $stmt->bindParam(':file_source', $file_source);
            $stmt->bindParam(':source_type', $source_type);
            $stmt->bindParam(':file_url', $file_url);
            $stmt->bindParam(':label', $label);
            $stmt->bindParam(':order', $next_order);
            
            if ($stmt->execute()) {
                echo json_encode([
                    'message' => 'Registrado correctamente',
                    'data' => [
                        'video_file_id' => $conn->lastInsertId(),
                        'stream_key' => $stream_key,
                        'order' => $next_order
                    ]
                ]);
            } else {
                http_response_code(500);
                echo json_encode(['error' => 'Error al registrar']);
            }
        }
        break;

    default:
        http_response_code(405);
        echo json_encode(['error' => 'Método no permitido']);
        break;
}

$db->closeConnection();
?>
