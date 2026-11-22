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

// Cargar la conexión a la base de datos db_dooplex
require_once __DIR__ . '/db_dooplex/Database.php';
require_once __DIR__ . '/duplicate_check.php';

try {
    $db = new DooplexDatabase();
    $conn = $db->connect();
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Error al conectar a la base de datos Dooplex: ' . $e->getMessage()]);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];

switch ($method) {
    case 'GET':
        // 1: obtener `id` y `name` tabla `series` buscar por `tmdb_id`
        if (isset($_GET['tmdb_id'])) {
            $tmdb_id = $_GET['tmdb_id'];
            $stmt = $conn->prepare("SELECT id, name FROM series WHERE tmdb_id = :tmdb_id");
            $stmt->bindParam(':tmdb_id', $tmdb_id);
            $stmt->execute();
            $result = $stmt->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode(['data' => $result]);
            break;
        }
        
        // 2: obtener `id`, `season_number`, `name` tabla `seasons` buscar por `serie_id`
        if (isset($_GET['serie_id'])) {
            $serie_id = $_GET['serie_id'];
            $stmt = $conn->prepare("SELECT id, season_number, name FROM seasons WHERE serie_id = :serie_id");
            $stmt->bindParam(':serie_id', $serie_id);
            $stmt->execute();
            $result = $stmt->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode(['data' => $result]);
            break;
        }

        // 3: obtener `id`, `episode_number`, `name` tabla `episodes` buscar por `season_id`
        if (isset($_GET['season_id'])) {
            $season_id = $_GET['season_id'];
            $stmt = $conn->prepare("SELECT id, episode_number, name FROM episodes WHERE season_id = :season_id");
            $stmt->bindParam(':season_id', $season_id);
            $stmt->execute();
            $result = $stmt->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode(['data' => $result]);
            break;
        }

        // 4: obtener `id`, `server`, `header`, `link`, `lang` tabla `serie_videos` buscar por `episode_id`
        if (isset($_GET['episode_id'])) {
            $episode_id = $_GET['episode_id'];
            $stmt = $conn->prepare("SELECT id, server, header, link, lang, embed, youtubelink, hls, supported_hosts FROM serie_videos WHERE episode_id = :episode_id");
            $stmt->bindParam(':episode_id', $episode_id);
            $stmt->execute();
            $result = $stmt->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode(['data' => $result]);
            break;
        }

        http_response_code(400);
        echo json_encode(['error' => 'Faltan parámetros (tmdb_id, serie_id, season_id o episode_id)']);
        break;

    case 'DELETE':
        // 6: eliminar por `id` en la tabla `serie_videos`
        $input = json_decode(file_get_contents('php://input'), true);
        $id = $_GET['id'] ?? ($input['id'] ?? null);

        if ($id) {
            $stmt = $conn->prepare("DELETE FROM serie_videos WHERE id = :id");
            $stmt->bindParam(':id', $id);
            if ($stmt->execute()) {
                echo json_encode(['message' => 'Eliminado correctamente']);
            } else {
                http_response_code(500);
                echo json_encode(['error' => 'Error al eliminar el registro']);
            }
        } else {
            http_response_code(400);
            echo json_encode(['error' => 'Falta el parámetro id para eliminar']);
        }
        break;

    case 'POST':
    case 'PUT':
        $input = json_decode(file_get_contents('php://input'), true);
        if (!$input) {
            $input = $_POST;
        }

        $id = $input['id'] ?? null;
        $current_time = date('Y-m-d H:i:s');
        $episodes_id = $input['episodes_id'] ?? null;

        // Si es PUT o si enviaron 'id' en POST, identificamos que es actualización (Update)
        if ($episodes_id !== null) {
            if (!$episodes_id) {
                http_response_code(400);
                echo json_encode(['error' => 'Falta el parámetro episodes_id para actualizar']);
                break;
            }

            $name = $input['name'] ?? null;
            $overview = $input['overview'] ?? null;
            $still_path = $input['still_path'] ?? null;
            $still_path_tv = $input['still_path_tv'] ?? null;

            $updateFields = [];
            $params = [':episodes_id' => $episodes_id];

            if ($name !== null && trim((string)$name) !== '') {
                $updateFields[] = "name = :name";
                $params[':name'] = $name;
            }
            if ($overview !== null && trim((string)$overview) !== '') {
                $updateFields[] = "overview = :overview";
                $params[':overview'] = $overview;
            }
            if ($still_path !== null && trim((string)$still_path) !== '') {
                $updateFields[] = "still_path = :still_path";
                $params[':still_path'] = $still_path;
            }
            if ($still_path_tv !== null && trim((string)$still_path_tv) !== '') {
                $updateFields[] = "still_path_tv = :still_path_tv";
                $params[':still_path_tv'] = $still_path_tv;
            }

            if (empty($updateFields)) {
                echo json_encode(['message' => 'No hay datos válidos para actualizar']);
                break;
            }

            $sql = "UPDATE episodes SET " . implode(', ', $updateFields) . " WHERE id = :episodes_id";
            $stmt = $conn->prepare($sql);

            if ($stmt->execute($params)) {
                echo json_encode(['message' => 'Actualizado correctamente']);
            } else {
                http_response_code(500);
                echo json_encode(['error' => 'Error al actualizar el registro']);
            }

        } elseif ($method === 'PUT' || $id !== null) {
            if (!$id) {
                 http_response_code(400);
                 echo json_encode(['error' => 'Falta el parámetro id para actualizar']);
                 break;
            }

            // 5: actualizar `server`, `header`, `link`, `lang` e `updated_at` en tabla `serie_videos`
            $updateFields = [];
            $params = [':id' => $id];

            if (isset($input['server']) && trim($input['server']) !== '') {
                $updateFields[] = "server = :server";
                $params[':server'] = trim($input['server']);
            }
            if (isset($input['header']) && trim($input['header']) !== '') {
                $updateFields[] = "header = :header";
                $params[':header'] = trim($input['header']);
            }
            if (isset($input['link']) && trim($input['link']) !== '') {
                $updateFields[] = "`link` = :link";
                $params[':link'] = trim($input['link']);
            }
            if (isset($input['lang']) && trim($input['lang']) !== '') {
                $updateFields[] = "lang = :lang";
                $params[':lang'] = trim($input['lang']);
            }
            if (array_key_exists('embed', $input)) {
                $updateFields[] = "embed = :embed";
                $params[':embed'] = is_bool($input['embed']) ? (int)$input['embed'] : $input['embed'];
            }
            if (array_key_exists('youtubelink', $input)) {
                $updateFields[] = "youtubelink = :youtubelink";
                $params[':youtubelink'] = $input['youtubelink'];
            }
            if (array_key_exists('hls', $input)) {
                $updateFields[] = "hls = :hls";
                $params[':hls'] = is_bool($input['hls']) ? (int)$input['hls'] : $input['hls'];
            }
            if (array_key_exists('supported_hosts', $input)) {
                $updateFields[] = "supported_hosts = :supported_hosts";
                $params[':supported_hosts'] = is_array($input['supported_hosts']) ? json_encode($input['supported_hosts']) : $input['supported_hosts'];
            }

            if (count($updateFields) > 0) {
                // Generar updated_at automáticamente
                $updateFields[] = "updated_at = :updated_at";
                $params[':updated_at'] = $current_time;

                $sql = "UPDATE serie_videos SET " . implode(', ', $updateFields) . " WHERE id = :id";
                $stmt = $conn->prepare($sql);
                
                if ($stmt->execute($params)) {
                    echo json_encode([
                        'message' => 'Actualizado correctamente',
                        'updated_at' => $current_time
                    ]);
                } else {
                    http_response_code(500);
                    echo json_encode(['error' => 'Error al actualizar el registro']);
                }
            } else {
                echo json_encode(['message' => 'No se enviaron datos válidos para actualizar o no hubieron cambios']);
            }
            
        } else {
            // 7: registrar en tabla `serie_videos`
            $episode_id = $input['episode_id'] ?? null;
            $server = $input['server'] ?? null;
            $header = $input['header'] ?? null;
            $link = trimNullableUrl($input['link'] ?? null);
            $lang = $input['lang'] ?? null;
            $embed = $input['embed'] ?? null;
            $youtubelink = $input['youtubelink'] ?? null;
            $hls = $input['hls'] ?? null;
            $supported_hosts = $input['supported_hosts'] ?? null;

            if (!$episode_id) {
                http_response_code(400);
                echo json_encode(['error' => 'Falta el parámetro episode_id para el registro']);
                break;
            }

            if ($link !== null) {
                $checkStmt = $conn->prepare("SELECT id, `link` FROM serie_videos WHERE episode_id = :episode_id");
                $checkStmt->bindParam(':episode_id', $episode_id);
                $checkStmt->execute();
                $existingRows = $checkStmt->fetchAll(PDO::FETCH_ASSOC);
                $duplicateRow = findDuplicateUrlRow($existingRows, 'link', $link);
                if ($duplicateRow !== null) {
                    echo json_encode(buildDuplicateResponse(['id' => (string)$duplicateRow['id']]));
                    break;
                }
            }

            $stmt = $conn->prepare("INSERT INTO serie_videos 
                (episode_id, server, header, `link`, lang, embed, youtubelink, hls, supported_hosts, created_at, updated_at) 
                VALUES (:episode_id, :server, :header, :link, :lang, :embed, :youtubelink, :hls, :supported_hosts, :created_at, :updated_at)");
                
            $stmt->bindParam(':episode_id', $episode_id);
            $stmt->bindParam(':server', $server);
            $stmt->bindParam(':header', $header);
            $stmt->bindParam(':link', $link);
            $stmt->bindParam(':lang', $lang);
            $stmt->bindParam(':embed', $embed);
            $stmt->bindParam(':youtubelink', $youtubelink);
            $stmt->bindValue(':hls', is_bool($hls) ? (int)$hls : $hls);
            $stmt->bindValue(':supported_hosts', is_array($supported_hosts) ? json_encode($supported_hosts) : $supported_hosts);
            
            // created_at, updated_at
            $stmt->bindParam(':created_at', $current_time);
            $stmt->bindParam(':updated_at', $current_time);
            
            if ($stmt->execute()) {
                echo json_encode([
                    'message' => 'Registrado correctamente',
                    'data' => [
                        'id' => $conn->lastInsertId(),
                        'created_at' => $current_time,
                        'updated_at' => $current_time
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
