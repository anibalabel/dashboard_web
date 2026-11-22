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
        // 1: obtener `name`, `id` tabla `web_series` buscar por `TMDB_ID`
        if (isset($_GET['tmdbid'])) {
            $tmdbid = $_GET['tmdbid'];
            $stmt = $conn->prepare("SELECT id, name FROM web_series WHERE TMDB_ID = :tmdbid");
            $stmt->bindParam(':tmdbid', $tmdbid);
            $stmt->execute();
            $result = $stmt->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode(['data' => $result]);
            break;
        }

        // 2: obtener `id`, `Session_Name`, `season_order` tabla `web_series_seasons` buscar por `web_series_id`
        if (isset($_GET['web_series_id'])) {
            $web_series_id = $_GET['web_series_id'];
            $stmt = $conn->prepare("SELECT id, Session_Name, season_order FROM web_series_seasons WHERE web_series_id = :web_series_id");
            $stmt->bindParam(':web_series_id', $web_series_id);
            $stmt->execute();
            $result = $stmt->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode(['data' => $result]);
            break;
        }

        // 3: obtener `id`, `Episoade_Name`, `episoade_order` tabla `web_series_episoade` buscar por `season_id`
        if (isset($_GET['season_id'])) {
            $season_id = $_GET['season_id'];
            $stmt = $conn->prepare("SELECT id, Episoade_Name, episoade_order FROM web_series_episoade WHERE season_id = :season_id ORDER BY episoade_order ASC, id ASC");
            $stmt->bindParam(':season_id', $season_id);
            $stmt->execute();
            $result = $stmt->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode(['data' => $result]);
            break;
        }

        // 4: obtener `id`, `name`, `url`, `quality` tabla `episode_play_links` buscar por `episode_id`
        if (isset($_GET['episode_id'])) {
            $episode_id = $_GET['episode_id'];
            $stmt = $conn->prepare("SELECT id, name, url, quality FROM episode_play_links WHERE episode_id = :episode_id");
            $stmt->bindParam(':episode_id', $episode_id);
            $stmt->execute();
            $result = $stmt->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode(['data' => $result]);
            break;
        }

        echo json_encode(['error' => 'Faltan parámetros (tmdbid, web_series_id, season_id o episode_id)']);
        break;

    case 'DELETE':
        // 6: eliminar por `id` tabla `episode_play_links`
        $input = json_decode(file_get_contents('php://input'), true);
        $id = $_GET['id'] ?? ($input['id'] ?? null);

        if ($id) {
            $stmt = $conn->prepare("DELETE FROM episode_play_links WHERE id = :id");
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
        $input = json_decode(file_get_contents('php://input'), true);
        if (!$input) {
            $input = $_POST;
        }

        $id = $input['id'] ?? null;
        $name = $input['name'] ?? null;
        $url = $input['url'] ?? null;
        $episode_id = $input['episode_id'] ?? null;
        $quality = $input['quality'] ?? null;
        $web_series_episoade_id = $input['web_series_episoade_id'] ?? null;
        $Episoade_Name = $input['Episoade_Name'] ?? null;
        $episoade_image = $input['episoade_image'] ?? null;
        $episoade_description = $input['episoade_description'] ?? null;

        // Si es PUT o si enviaron 'id' en POST, es una actualización
        if ($web_series_episoade_id !== null) {
            if (!$web_series_episoade_id) {
                http_response_code(400);
                echo json_encode(['error' => 'Falta el parámetro web_series_episoade_id para actualizar']);
                break;
            }

            $updates = [];
            $params = [':id' => $web_series_episoade_id];

            if ($Episoade_Name !== null && trim((string)$Episoade_Name) !== '') {
                $updates[] = "Episoade_Name = :Episoade_Name";
                $params[':Episoade_Name'] = $Episoade_Name;
            }
            if ($episoade_image !== null && trim((string)$episoade_image) !== '') {
                $updates[] = "episoade_image = :episoade_image";
                $params[':episoade_image'] = $episoade_image;
            }
            if ($episoade_description !== null && trim((string)$episoade_description) !== '') {
                $updates[] = "episoade_description = :episoade_description";
                $params[':episoade_description'] = $episoade_description;
            }

            if (empty($updates)) {
                echo json_encode(['message' => 'No hay datos válidos para actualizar']);
                break;
            }

            $sql = "UPDATE web_series_episoade SET " . implode(", ", $updates) . " WHERE id = :id";
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

        } elseif ($id !== null) {
            // 5: actualizar `name`, `url` tabla `episode_play_links` por `id`
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
            if ($quality !== null && $quality !== '') {
                $updates[] = "quality = :quality";
                $params[':quality'] = $quality;
            }
            
            if (empty($updates)) {
                echo json_encode(['message' => 'No hay datos válidos para actualizar']);
                break;
            }
            
            $sql = "UPDATE episode_play_links SET " . implode(", ", $updates) . " WHERE id = :id";
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
            
        } elseif ($method === 'PUT') {
            http_response_code(400);
            echo json_encode(['error' => 'Faltan parámetros (id o web_series_episoade_id)']);
            break;

        } else {
            // 7: registrar `episode_play_links`
            if (!$episode_id) {
                http_response_code(400);
                echo json_encode(['error' => 'Falta el parámetro episode_id para el registro']);
                break;
            }

            $clean_url = trimNullableUrl($url);
            $stmt = $conn->prepare("SELECT id, url FROM episode_play_links WHERE episode_id = :episode_id");
            $stmt->bindParam(':episode_id', $episode_id);
            $stmt->execute();
            $existingRows = $stmt->fetchAll(PDO::FETCH_ASSOC);

            if ($clean_url !== null) {
                $duplicateRow = findDuplicateUrlRow($existingRows, 'url', $clean_url);
                if ($duplicateRow !== null) {
                    echo json_encode(buildDuplicateResponse(['id' => (string)$duplicateRow['id']]));
                    break;
                }
            }
            $url = $clean_url;
            $link_order = count($existingRows) + 1;

            // Valores predeterminados
            $status = 1;
            $type = 'Embed';
            $skip_available = 0;
            $link_type = 0;

            $stmt = $conn->prepare("INSERT INTO episode_play_links 
                (name, episode_id, url, quality, status, type, skip_available, link_type, link_order) 
                VALUES (:name, :episode_id, :url, :quality, :status, :type, :skip_available, :link_type, :link_order)");
                
            $stmt->bindParam(':name', $name);
            $stmt->bindParam(':episode_id', $episode_id);
            $stmt->bindParam(':url', $url);
            $stmt->bindParam(':quality', $quality);
            $stmt->bindParam(':status', $status);
            $stmt->bindParam(':type', $type);
            $stmt->bindParam(':skip_available', $skip_available);
            $stmt->bindParam(':link_type', $link_type);
            $stmt->bindParam(':link_order', $link_order);
            
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
