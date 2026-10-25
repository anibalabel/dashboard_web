<?php
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

$method = isset($_SERVER['REQUEST_METHOD']) ? strtoupper($_SERVER['REQUEST_METHOD']) : 'GET';
if ($method === 'OPTIONS') {
    http_response_code(200);
    exit;
}

header('Content-Type: application/json');

if (!isset($_GET['url'])) {
    http_response_code(400);
    echo json_encode(['error' => 'No URL provided']);
    exit;
}

$url = $_GET['url'];
$referer = isset($_GET['referer']) ? $_GET['referer'] : '';
$resolveRedirect = isset($_GET['resolve_redirect']) ? $_GET['resolve_redirect'] === 'true' : false;

$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
$headers = [
    'Accept-Language: es-ES,es;q=0.9,en;q=0.8',
    'Cache-Control: no-cache',
    'Pragma: no-cache',
];

if ($method === 'POST') {
    $headers[] = 'Accept: */*';
    $headers[] = 'X-Requested-With: XMLHttpRequest';
} else {
    $headers[] = 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';
}

curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
curl_setopt($ch, CURLOPT_TIMEOUT, 20);
curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 10);
curl_setopt($ch, CURLOPT_ENCODING, '');
curl_setopt($ch, CURLOPT_IPRESOLVE, CURL_IPRESOLVE_V4);

if ($referer) {
    curl_setopt($ch, CURLOPT_REFERER, $referer);
} else if (strpos($url, 'embed69.org') !== false) {
    curl_setopt($ch, CURLOPT_REFERER, 'https://pelisplushd.bz/');
}

// Si solo queremos resolver la redirección final (Streamwish)
if ($resolveRedirect) {
    curl_setopt($ch, CURLOPT_HEADER, true);
    curl_setopt($ch, CURLOPT_NOBODY, true); 
    curl_setopt($ch, CURLOPT_MAXREDIRS, 5);
    curl_setopt($ch, CURLOPT_TIMEOUT, 10);
    
    curl_exec($ch);
    $finalUrl = curl_getinfo($ch, CURLINFO_EFFECTIVE_URL);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    if ($httpCode == 405 || $httpCode == 403 || empty($finalUrl) || $finalUrl == $url) {
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
        curl_setopt($ch, CURLOPT_MAXREDIRS, 5);
        curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_TIMEOUT, 10);
        curl_setopt($ch, CURLOPT_RANGE, "0-100");
        
        curl_exec($ch);
        $finalUrl = curl_getinfo($ch, CURLINFO_EFFECTIVE_URL);
        curl_close($ch);
    }
    
    echo json_encode(['finalUrl' => $finalUrl ?: $url]);
    exit;
}

$contentType = isset($_SERVER['CONTENT_TYPE']) ? $_SERVER['CONTENT_TYPE'] : '';
if ($method === 'POST') {
    curl_setopt($ch, CURLOPT_POST, true);

    if (stripos($contentType, 'application/json') !== false) {
        $rawBody = file_get_contents('php://input');
        curl_setopt($ch, CURLOPT_POSTFIELDS, $rawBody);
        curl_setopt($ch, CURLOPT_HTTPHEADER, array_merge($headers, ['Content-Type: application/json']));
    } else {
        $postFields = [];
        foreach ($_POST as $key => $value) {
            $postFields[$key] = $value;
        }

        foreach ($_FILES as $key => $file) {
            if (is_array($file) && isset($file['tmp_name']) && is_uploaded_file($file['tmp_name'])) {
                $mime = isset($file['type']) ? $file['type'] : 'application/octet-stream';
                $name = isset($file['name']) ? $file['name'] : 'file';
                $postFields[$key] = new CURLFile($file['tmp_name'], $mime, $name);
            }
        }

        if (stripos($contentType, 'application/x-www-form-urlencoded') !== false) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($postFields));
            curl_setopt($ch, CURLOPT_HTTPHEADER, array_merge($headers, ['Content-Type: application/x-www-form-urlencoded']));
        } else {
            curl_setopt($ch, CURLOPT_POSTFIELDS, $postFields);
        }
    }
}

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);

if (curl_errno($ch)) {
    http_response_code(500);
    echo json_encode(['error' => curl_error($ch)]);
} else {
    // Si la respuesta parece ser un JSON, la devolvemos como tal
    $json = json_decode($response);
    if (json_last_error() === JSON_ERROR_NONE) {
        echo $response;
    } else {
        // Si no es JSON (ej. HTML), la devolvemos como texto plano para que el cliente la maneje
        header('Content-Type: text/plain');
        echo $response;
    }
}

curl_close($ch);
?>
