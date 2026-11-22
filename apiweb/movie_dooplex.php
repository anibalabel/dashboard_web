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
        // 1: Obtener 'id', 'title' de la tabla 'movies' buscado por 'tmdb_id'
        if (isset($_GET['tmdb_id'])) {
            $tmdb_id = $_GET['tmdb_id'];
            $stmt = $conn->prepare("SELECT id, title FROM movies WHERE tmdb_id = :tmdb_id");
            $stmt->bindParam(':tmdb_id', $tmdb_id);
            $stmt->execute();
            $result = $stmt->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode(['data' => $result]);
            break;
        }
        
        // 2: Obtener 'id', 'server', 'link', 'lang' de tabla 'movie_videos' buscar por 'movie_id'
        if (isset($_GET['movie_id'])) {
            $movie_id = $_GET['movie_id'];
            $stmt = $conn->prepare("SELECT id, server, header, link, lang, embed, youtubelink, hls, supported_hosts FROM movie_videos WHERE movie_id = :movie_id");
            $stmt->bindParam(':movie_id', $movie_id);
            $stmt->execute();
            $result = $stmt->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode(['data' => $result]);
            break;
        }

        echo json_encode(['error' => 'Faltan parámetros (tmdb_id o movie_id)']);
        break;

    case 'DELETE':
        // 3: Eliminar por 'id' en la tabla 'movie_videos'
        $input = json_decode(file_get_contents('php://input'), true);
        $id = $_GET['id'] ?? ($input['id'] ?? null);

        if ($id) {
            $stmt = $conn->prepare("DELETE FROM movie_videos WHERE id = :id");
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

        // Si es PUT o si enviaron 'id' en POST, identificamos que es actualización (Update)
        if ($method === 'PUT' || $id !== null) {
            if (!$id) {
                 http_response_code(400);
                 echo json_encode(['error' => 'Falta el parámetro id para actualizar']);
                 break;
            }

            $updated_at = date('Y-m-d H:i:s');
            $updateFields = [];
            $params = [':id' => $id];

            if (array_key_exists('server', $input) && trim((string)$input['server']) !== '') {
                $updateFields[] = "server = :server";
                $params[':server'] = trim((string)$input['server']);
            }
            if (array_key_exists('header', $input) && trim((string)$input['header']) !== '') {
                $updateFields[] = "header = :header";
                $params[':header'] = trim((string)$input['header']);
            }
            if (array_key_exists('link', $input) && trim((string)$input['link']) !== '') {
                $updateFields[] = "`link` = :link";
                $params[':link'] = trim((string)$input['link']);
            }
            if (array_key_exists('lang', $input) && trim((string)$input['lang']) !== '') {
                $updateFields[] = "lang = :lang";
                $params[':lang'] = trim((string)$input['lang']);
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

            if (empty($updateFields)) {
                echo json_encode(['message' => 'No se enviaron datos válidos para actualizar o no hubieron cambios']);
                break;
            }

            $updateFields[] = "updated_at = :updated_at";
            $params[':updated_at'] = $updated_at;

            $sql = "UPDATE movie_videos SET " . implode(', ', $updateFields) . " WHERE id = :id";
            $stmt = $conn->prepare($sql);

            if ($stmt->execute($params)) {
                echo json_encode([
                    'message' => 'Actualizado correctamente',
                    'updated_at' => $updated_at
                ]);
            } else {
                http_response_code(500);
                echo json_encode(['error' => 'Error al actualizar el registro']);
            }
            
        } else {
            // 5: Registro / Insert
            $movie_id = $input['movie_id'] ?? null;
            $server = $input['server'] ?? null;
            $header = $input['header'] ?? null;
            $link = trimNullableUrl($input['link'] ?? null);
            $lang = $input['lang'] ?? null;
            $embed = $input['embed'] ?? null;
            $youtubelink = $input['youtubelink'] ?? null;
            $hls = $input['hls'] ?? null;
            $supported_hosts = $input['supported_hosts'] ?? null;

            if (!$movie_id) {
                http_response_code(400);
                echo json_encode(['error' => 'Falta el parámetro movie_id para el registro']);
                break;
            }

            if ($link !== null) {
                $checkStmt = $conn->prepare("SELECT id, `link` FROM movie_videos WHERE movie_id = :movie_id");
                $checkStmt->bindParam(':movie_id', $movie_id);
                $checkStmt->execute();
                $existingRows = $checkStmt->fetchAll(PDO::FETCH_ASSOC);
                $duplicateRow = findDuplicateUrlRow($existingRows, 'link', $link);
                if ($duplicateRow !== null) {
                    echo json_encode(buildDuplicateResponse(['id' => (string)$duplicateRow['id']]));
                    break;
                }
            }

            $current_time = date('Y-m-d H:i:s');

            $stmt = $conn->prepare("INSERT INTO movie_videos 
                (movie_id, server, header, `link`, lang, embed, youtubelink, hls, supported_hosts, created_at, updated_at) 
                VALUES (:movie_id, :server, :header, :link, :lang, :embed, :youtubelink, :hls, :supported_hosts, :created_at, :updated_at)");
                
            $stmt->bindParam(':movie_id', $movie_id);
            $stmt->bindParam(':server', $server);
            $stmt->bindParam(':header', $header);
            $stmt->bindParam(':link', $link);
            $stmt->bindParam(':lang', $lang);
            $stmt->bindParam(':embed', $embed);
            $stmt->bindParam(':youtubelink', $youtubelink);
            $stmt->bindValue(':hls', is_bool($hls) ? (int)$hls : $hls);
            $stmt->bindValue(':supported_hosts', is_array($supported_hosts) ? json_encode($supported_hosts) : $supported_hosts);
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
