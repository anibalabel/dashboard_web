<?php
header('Content-Type: application/json');

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once __DIR__ . '/db_dooplex/Database.php';

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
        if (isset($_GET['tmdb_id'])) {
            $tmdb_id = $_GET['tmdb_id'];
            $stmt = $conn->prepare("SELECT id, name FROM animes WHERE tmdb_id = :tmdb_id");
            $stmt->bindParam(':tmdb_id', $tmdb_id);
            $stmt->execute();
            echo json_encode(['data' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
            break;
        }

        if (isset($_GET['anime_id'])) {
            $anime_id = $_GET['anime_id'];
            $stmt = $conn->prepare("SELECT * FROM anime_seasons WHERE anime_id = :anime_id");
            $stmt->bindParam(':anime_id', $anime_id);
            $stmt->execute();
            echo json_encode(['data' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
            break;
        }

        if (isset($_GET['anime_season_id'])) {
            $anime_season_id = $_GET['anime_season_id'];
            $stmt = $conn->prepare("SELECT id, episode_number, name FROM anime_episodes WHERE anime_season_id = :anime_season_id");
            $stmt->bindParam(':anime_season_id', $anime_season_id);
            $stmt->execute();
            echo json_encode(['data' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
            break;
        }

        if (isset($_GET['anime_episode_id'])) {
            $anime_episode_id = $_GET['anime_episode_id'];
            $stmt = $conn->prepare("SELECT id, server, header, `link`, lang FROM anime_videos WHERE anime_episode_id = :anime_episode_id");
            $stmt->bindParam(':anime_episode_id', $anime_episode_id);
            $stmt->execute();
            echo json_encode(['data' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
            break;
        }

        echo json_encode(['error' => 'Faltan parámetros (tmdb_id, anime_id, anime_season_id o anime_episode_id)']);
        break;

    case 'DELETE':
        $input = json_decode(file_get_contents('php://input'), true);
        $id = $_GET['id'] ?? ($input['id'] ?? null);

        if (!$id) {
            http_response_code(400);
            echo json_encode(['error' => 'Falta el parámetro id para eliminar']);
            break;
        }

        $stmt = $conn->prepare("DELETE FROM anime_videos WHERE id = :id");
        $stmt->bindParam(':id', $id);
        if ($stmt->execute()) {
            echo json_encode(['message' => 'Eliminado correctamente']);
        } else {
            http_response_code(500);
            echo json_encode(['error' => 'Error al eliminar el registro']);
        }
        break;

    case 'POST':
    case 'PUT':
        $input = json_decode(file_get_contents('php://input'), true);
        if (!$input) {
            $input = $_POST;
        }

        $id = $input['id'] ?? null;
        $anime_episodes_id = $input['anime_episodes_id'] ?? null;

        if ($anime_episodes_id !== null) {
            if (!$anime_episodes_id) {
                http_response_code(400);
                echo json_encode(['error' => 'Falta el parámetro anime_episodes_id para actualizar']);
                break;
            }

            $name = $input['name'] ?? null;
            $overview = $input['overview'] ?? null;
            $still_path = $input['still_path'] ?? null;
            $still_path_tv = $input['still_path_tv'] ?? null;

            $updateFields = [];
            $params = [':anime_episodes_id' => $anime_episodes_id];

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

            $sql = "UPDATE anime_episodes SET " . implode(', ', $updateFields) . " WHERE id = :anime_episodes_id";
            $stmt = $conn->prepare($sql);

            if ($stmt->execute($params)) {
                echo json_encode(['message' => 'Actualizado correctamente']);
            } else {
                http_response_code(500);
                echo json_encode(['error' => 'Error al actualizar el registro']);
            }

            break;
        }

        if ($method === 'PUT' || $id !== null) {
            if (!$id) {
                http_response_code(400);
                echo json_encode(['error' => 'Falta el parámetro id para actualizar']);
                break;
            }

            $anime_episode_id = $input['anime_episode_id'] ?? null;
            $server = $input['server'] ?? null;
            $header = $input['header'] ?? null;
            $link = $input['link'] ?? null;
            $lang = $input['lang'] ?? null;

            if ($anime_episode_id === null || trim((string)$anime_episode_id) === '' || $server === null || trim((string)$server) === '' || $header === null || trim((string)$header) === '' || $link === null || trim((string)$link) === '' || $lang === null || trim((string)$lang) === '') {
                http_response_code(400);
                echo json_encode(['error' => 'Faltan parámetros (anime_episode_id, server, header, link, lang)']);
                break;
            }

            $updated_at = date('Y-m-d H:i:s');

            $stmt = $conn->prepare("UPDATE anime_videos SET 
                anime_episode_id = :anime_episode_id,
                server = :server,
                header = :header,
                `link` = :link,
                lang = :lang,
                updated_at = :updated_at
                WHERE id = :id");

            $stmt->bindParam(':anime_episode_id', $anime_episode_id);
            $stmt->bindParam(':server', $server);
            $stmt->bindParam(':header', $header);
            $stmt->bindParam(':link', $link);
            $stmt->bindParam(':lang', $lang);
            $stmt->bindParam(':updated_at', $updated_at);
            $stmt->bindParam(':id', $id);

            if ($stmt->execute()) {
                echo json_encode([
                    'message' => 'Actualizado correctamente',
                    'updated_at' => $updated_at
                ]);
            } else {
                http_response_code(500);
                echo json_encode(['error' => 'Error al actualizar el registro']);
            }

            break;
        }

        $anime_episode_id = $input['anime_episode_id'] ?? null;
        $server = $input['server'] ?? null;
        $header = $input['header'] ?? null;
        $link = $input['link'] ?? null;
        $lang = $input['lang'] ?? null;

        if ($anime_episode_id === null || trim((string)$anime_episode_id) === '' || $server === null || trim((string)$server) === '' || $header === null || trim((string)$header) === '' || $link === null || trim((string)$link) === '' || $lang === null || trim((string)$lang) === '') {
            http_response_code(400);
            echo json_encode(['error' => 'Faltan parámetros (anime_episode_id, server, header, link, lang)']);
            break;
        }

        $embed = 1;
        $current_time = date('Y-m-d H:i:s');

        $stmt = $conn->prepare("INSERT INTO anime_videos 
            (anime_episode_id, server, header, `link`, lang, embed, created_at, updated_at) 
            VALUES (:anime_episode_id, :server, :header, :link, :lang, :embed, :created_at, :updated_at)");

        $stmt->bindParam(':anime_episode_id', $anime_episode_id);
        $stmt->bindParam(':server', $server);
        $stmt->bindParam(':header', $header);
        $stmt->bindParam(':link', $link);
        $stmt->bindParam(':lang', $lang);
        $stmt->bindParam(':embed', $embed);
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

        break;

    default:
        http_response_code(405);
        echo json_encode(['error' => 'Método no permitido']);
        break;
}

$db->closeConnection();
?>
