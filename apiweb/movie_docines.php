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

// Cargar la conexión a la base de datos db_docines
require_once __DIR__ . '/db_docines/Database.php';
require_once __DIR__ . '/duplicate_check.php';

try {
    $db = new DocinesDatabase();
    $conn = $db->connect();
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Error al conectar a la base de datos: ' . $e->getMessage()]);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];

switch ($method) {
    case 'GET':
        // 1: Obtener 'id', 'name' de tabla 'movies' buscar por 'TMDB_ID'
        if (isset($_GET['tmdbid'])) {
            $tmdbid = $_GET['tmdbid'];
            $stmt = $conn->prepare("SELECT id, name FROM movies WHERE TMDB_ID = :tmdbid");
            $stmt->bindParam(':tmdbid', $tmdbid);
            $stmt->execute();
            $result = $stmt->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode(['data' => $result]);
            break;
        }
        
        // 2: Obtener 'id', 'name', 'url', 'quality', 'link_order' de tabla 'movie_play_links' buscar por 'movie_id'
        if (isset($_GET['movie_id'])) {
            $movie_id = $_GET['movie_id'];
            $stmt = $conn->prepare("SELECT id, name, url, quality, link_order FROM movie_play_links WHERE movie_id = :movie_id");
            $stmt->bindParam(':movie_id', $movie_id);
            $stmt->execute();
            $result = $stmt->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode(['data' => $result]);
            break;
        }

        echo json_encode(['error' => 'Faltan parámetros (tmdbid o movie_id)']);
        break;

    case 'DELETE':
        // 3: Eliminar por 'id' en la tabla 'movie_play_links'
        $input = json_decode(file_get_contents('php://input'), true);
        $id = $_GET['id'] ?? ($input['id'] ?? null);

        if ($id) {
            $stmt = $conn->prepare("DELETE FROM movie_play_links WHERE id = :id");
            $stmt->bindParam(':id', $id);
            if ($stmt->execute()) {
                echo json_encode(['message' => 'Eliminado correctamente']);
            } else {
                http_response_code(500);
                echo json_encode(['error' => 'Error al eliminar el registro']);
            }
        } else {
            http_response_code(400);
            echo json_encode(['error' => 'Falta el parámetro id']);
        }
        break;

    case 'POST':
    case 'PUT':
        // Leer el JSON o el Form Data del cuerpo (body) de la request
        $input = json_decode(file_get_contents('php://input'), true);
        if (!$input) {
            $input = $_POST;
        }

        $id = $input['id'] ?? null;
        $name = $input['name'] ?? null;
        $url = $input['url'] ?? null;
        $link_order = $input['link_order'] ?? null;
        $quality = $input['quality'] ?? null;
        $movie_id = $input['movie_id'] ?? null;
        $movies_id = $input['movies_id'] ?? null;
        $movie_name = $input['movie_name'] ?? null;

        if ($id !== null) {
            // 4: Actualizar `name`, `url`, `link_order` dinamicamente por `id` en `movie_play_links`
            if (!$id) {
                http_response_code(400);
                echo json_encode(['error' => 'Falta el parámetro id para actualizar']);
                break;
            }

            $updates = [];
            $params = [':id' => $id];

            if ($name !== null && $name !== '') {
                $updates[] = "name = :name";
                $params[':name'] = $name;
            }
            if ($url !== null && $url !== '') {
                $updates[] = "url = :url";
                $params[':url'] = $url;
            }
            if ($link_order !== null && $link_order !== '') {
                $updates[] = "link_order = :link_order";
                $params[':link_order'] = $link_order;
            }
            if ($quality !== null && $quality !== '') {
                $updates[] = "quality = :quality";
                $params[':quality'] = $quality;
            }

            if (empty($updates)) {
                echo json_encode(['message' => 'No hay datos válidos para actualizar']);
                break;
            }

            $sql = "UPDATE movie_play_links SET " . implode(", ", $updates) . " WHERE id = :id";
            $stmt = $conn->prepare($sql);

            foreach ($params as $key => &$val) {
                $stmt->bindParam($key, $val);
            }

            if ($stmt->execute()) {
                echo json_encode(['message' => 'Actualizado correctamente']);
            } else {
                http_response_code(500);
                echo json_encode(['error' => 'Error al actualizar']);
            }

        } elseif ($movies_id !== null) {
            if (!$movies_id) {
                http_response_code(400);
                echo json_encode(['error' => 'Falta el parámetro movies_id para actualizar']);
                break;
            }
            if ($movie_name === null || trim((string)$movie_name) === '') {
                http_response_code(400);
                echo json_encode(['error' => 'Falta el parámetro movie_name para actualizar']);
                break;
            }

            $stmt = $conn->prepare("UPDATE movies SET name = :movie_name WHERE id = :movies_id");
            $stmt->bindParam(':movie_name', $movie_name);
            $stmt->bindParam(':movies_id', $movies_id);

            if ($stmt->execute()) {
                echo json_encode(['message' => 'Actualizado correctamente']);
            } else {
                http_response_code(500);
                echo json_encode(['error' => 'Error al actualizar']);
            }

        } elseif ($method === 'PUT') {
            http_response_code(400);
            echo json_encode(['error' => 'Faltan parámetros (id o movies_id)']);
            break;

        } else {
            // 6: Registro en la tabla `movie_play_links`
            if (!$movie_id) {
                http_response_code(400);
                echo json_encode(['error' => 'Falta el parámetro movie_id para el registro']);
                break;
            }

            $clean_url = trimNullableUrl($url);
            $stmt = $conn->prepare("SELECT id, url, link_order FROM movie_play_links WHERE movie_id = :movie_id ORDER BY link_order ASC");
            $stmt->bindParam(':movie_id', $movie_id);
            $stmt->execute();
            $orders = $stmt->fetchAll(PDO::FETCH_ASSOC);

            if ($clean_url !== null) {
                $duplicateRow = findDuplicateUrlRow($orders, 'url', $clean_url);
                if ($duplicateRow !== null) {
                    echo json_encode(buildDuplicateResponse([
                        'id' => (string)$duplicateRow['id'],
                        'link_order' => (int)($duplicateRow['link_order'] ?? 0)
                    ]));
                    break;
                }
            }
            $url = $clean_url;

            $next_link_order = 1;
            foreach ($orders as $row) {
                $current = isset($row['link_order']) ? (int)$row['link_order'] : 0;
                if ($current < $next_link_order) {
                    continue;
                }
                if ($current === $next_link_order) {
                    $next_link_order++;
                    continue;
                }
                if ($current > $next_link_order) {
                    break;
                }
            }

            $link_order = $next_link_order;

            // Valores por defecto: `type` = 'Embed', `status` = 1, `skip_available` = 0, `link_type` = 0
            $type = 'Embed';
            $status = 1;
            $skip_available = 0;
            $link_type = 0;

            $stmt = $conn->prepare("INSERT INTO movie_play_links 
                (movie_id, name, url, quality, link_order, type, status, skip_available, link_type) 
                VALUES (:movie_id, :name, :url, :quality, :link_order, :type, :status, :skip_available, :link_type)");
                
            $stmt->bindParam(':movie_id', $movie_id);
            $stmt->bindParam(':name', $name);
            $stmt->bindParam(':url', $url);
            $stmt->bindParam(':quality', $quality);
            $stmt->bindParam(':link_order', $link_order);
            $stmt->bindParam(':type', $type);
            $stmt->bindParam(':status', $status);
            $stmt->bindParam(':skip_available', $skip_available);
            $stmt->bindParam(':link_type', $link_type);
            
            if ($stmt->execute()) {
                echo json_encode([
                    'message' => 'Registrado correctamente',
                    'data' => [
                        'id' => $conn->lastInsertId(),
                        'link_order' => $link_order
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
