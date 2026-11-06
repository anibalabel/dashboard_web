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
        // 0: buscar por title en tabla videos
        if (isset($_GET['title'])) {
            $title = $_GET['title'];
            $title_like = '%' . $title . '%';
            $stmt = $conn->prepare("SELECT videos_id, title, tmdbid FROM videos WHERE title LIKE :title");
            $stmt->bindParam(':title', $title_like);
            $stmt->execute();
            $result = $stmt->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode(['data' => $result]);
            break;
        }

        if (isset($_GET['videos_info_id'])) {
            $videos_info_id = $_GET['videos_info_id'];
            $stmt = $conn->prepare("SELECT videos_id, title, tmdbid FROM videos WHERE videos_id = :videos_id");
            $stmt->bindParam(':videos_id', $videos_info_id);
            $stmt->execute();
            $result = $stmt->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode(['data' => $result]);
            break;
        }

        // 1: buscar por tmdbid en tabla videos
        if (isset($_GET['tmdbid'])) {
            $tmdbid = $_GET['tmdbid'];
            $stmt = $conn->prepare("SELECT videos_id, title FROM videos WHERE tmdbid = :tmdbid");
            $stmt->bindParam(':tmdbid', $tmdbid);
            $stmt->execute();
            $result = $stmt->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode(['data' => $result]);
            break;
        }
        
        // 2: buscar por videos_id en tabla seasons
        if (isset($_GET['videos_id'])) {
            $videos_id = $_GET['videos_id'];
            $stmt = $conn->prepare("SELECT seasons_id, seasons_name, `order` FROM seasons WHERE videos_id = :videos_id");
            $stmt->bindParam(':videos_id', $videos_id);
            $stmt->execute();
            $result = $stmt->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode(['data' => $result]);
            break;
        }

        // 3: buscar por seasons_id en tabla episodes
        if (isset($_GET['seasons_id'])) {
            $seasons_id = $_GET['seasons_id'];
            $stmt = $conn->prepare("SELECT episodes_id, episodes_name, file_url, `order` FROM episodes WHERE seasons_id = :seasons_id");
            $stmt->bindParam(':seasons_id', $seasons_id);
            $stmt->execute();
            $result = $stmt->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode(['data' => $result]);
            break;
        }

        http_response_code(400);
        echo json_encode(['error' => 'Faltan parámetros (tmdbid, videos_id o seasons_id)']);
        break;

    case 'DELETE':
        // 5: Eliminar por episodes_id de tabla episodes
        $input = json_decode(file_get_contents('php://input'), true);
        $episodes_id = $_GET['episodes_id'] ?? ($input['episodes_id'] ?? null);

        if ($episodes_id) {
            $stmt = $conn->prepare("DELETE FROM episodes WHERE episodes_id = :episodes_id");
            $stmt->bindParam(':episodes_id', $episodes_id);
            if ($stmt->execute()) {
                echo json_encode(['message' => 'Eliminado correctamente']);
            } else {
                http_response_code(500);
                echo json_encode(['error' => 'Error al eliminar el registro']);
            }
        } else {
            http_response_code(400);
            echo json_encode(['error' => 'Falta el parámetro episodes_id']);
        }
        break;

    case 'POST':
    case 'PUT':
        $input = json_decode(file_get_contents('php://input'), true);
        if (!$input) {
            $input = $_POST;
        }

        $episodes_id = $input['episodes_id'] ?? null;
        $videos_id = $input['videos_id'] ?? null;
        $seasons_id = $input['seasons_id'] ?? null;
        $title = $input['title'] ?? null;
        $tmdbid = $input['tmdbid'] ?? null;
        $episodes_name = $input['episodes_name'] ?? null;
        $file_source = $input['file_source'] ?? null;
        $source_type = $input['source_type'] ?? null;
        $file_url = $input['file_url'] ?? null;
        $order = $input['order'] ?? null;

        // Auto generer date en la API, ejemplo : 2026-02-03 14:16:25
        $current_date = date('Y-m-d H:i:s');

        if ($episodes_id === null && $seasons_id === null && $videos_id !== null && ($title !== null || $tmdbid !== null)) {
            if ($title === null || trim((string)$title) === '' || $tmdbid === null || trim((string)$tmdbid) === '') {
                http_response_code(400);
                echo json_encode(['error' => 'Faltan parámetros (videos_id, title, tmdbid)']);
                break;
            }

            $stmt = $conn->prepare("UPDATE videos SET 
                title = :title,
                tmdbid = :tmdbid
                WHERE videos_id = :videos_id");
            $stmt->bindParam(':title', $title);
            $stmt->bindParam(':tmdbid', $tmdbid);
            $stmt->bindParam(':videos_id', $videos_id);

            if ($stmt->execute()) {
                echo json_encode(['message' => 'Actualizado correctamente']);
            } else {
                http_response_code(500);
                echo json_encode(['error' => 'Error al actualizar']);
            }
            break;
        }

        // Actualización si envían episodes_id (o es método PUT)
        if ($method === 'PUT' || $episodes_id !== null) {
            if (!$episodes_id) {
                 http_response_code(400);
                 echo json_encode(['error' => 'Falta el parámetro episodes_id para actualizar']);
                 break;
            }
            
            // 4: actualizar episodes_name, file_url, order, last_ep_added
            $stmt = $conn->prepare("UPDATE episodes SET 
                episodes_name = :episodes_name,
                file_url = :file_url,
                `order` = :order,
                last_ep_added = :last_ep_added
                WHERE episodes_id = :episodes_id");
                
            $stmt->bindParam(':episodes_name', $episodes_name);
            $stmt->bindParam(':file_url', $file_url);
            $stmt->bindParam(':order', $order);
            $stmt->bindParam(':last_ep_added', $current_date);
            $stmt->bindParam(':episodes_id', $episodes_id);
            
            if ($stmt->execute()) {
                echo json_encode(['message' => 'Actualizado correctamente', 'last_ep_added' => $current_date]);
            } else {
                http_response_code(500);
                echo json_encode(['error' => 'Error al actualizar']);
            }
            
        } else {
            // 6: Registro / Insert de episodio
            if (!$seasons_id || !$videos_id) {
                http_response_code(400);
                echo json_encode(['error' => 'Faltan parámetros requeridos (seasons_id o videos_id) para el registro']);
                break;
            }

            // Generar stream_key de longitud 12 usando el método nativo
            $stream_key = $db->generateStreamKey(12);

            $stmt = $conn->prepare("INSERT INTO episodes 
                (stream_key, videos_id, seasons_id, episodes_name, file_source, source_type, file_url, `order`, date_added, last_ep_added) 
                VALUES (:stream_key, :videos_id, :seasons_id, :episodes_name, :file_source, :source_type, :file_url, :order, :date_added, :last_ep_added)");
                
            $stmt->bindParam(':stream_key', $stream_key);
            $stmt->bindParam(':videos_id', $videos_id);
            $stmt->bindParam(':seasons_id', $seasons_id);
            $stmt->bindParam(':episodes_name', $episodes_name);
            $stmt->bindParam(':file_source', $file_source);
            $stmt->bindParam(':source_type', $source_type);
            $stmt->bindParam(':file_url', $file_url);
            $stmt->bindParam(':order', $order);
            // date_added, last_ep_added
            $stmt->bindParam(':date_added', $current_date);
            $stmt->bindParam(':last_ep_added', $current_date);
            
            if ($stmt->execute()) {
                echo json_encode([
                    'message' => 'Registrado correctamente',
                    'data' => [
                        'episodes_id' => $conn->lastInsertId(),
                        'stream_key' => $stream_key,
                        'date_added' => $current_date
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
