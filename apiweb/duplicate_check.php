<?php

function normalizeComparableUrl($rawUrl): string {
    $trimmed = trim((string)($rawUrl ?? ''));
    if ($trimmed === '') {
        return '';
    }
    if (strpos($trimmed, '//') === 0) {
        $trimmed = 'https:' . $trimmed;
    }

    $parts = @parse_url($trimmed);
    if ($parts === false || empty($parts['host'])) {
        $fallback = preg_replace('/^http:\/\//i', 'https://', $trimmed);
        return rtrim((string)$fallback, '/');
    }

    $scheme = strtolower($parts['scheme'] ?? 'https');
    if ($scheme === 'http') {
        $scheme = 'https';
    }
    $host = preg_replace('/^www\./', '', strtolower($parts['host']));
    $port = isset($parts['port']) ? ':' . $parts['port'] : '';
    $path = isset($parts['path']) ? rtrim($parts['path'], '/') : '';
    $query = isset($parts['query']) ? '?' . $parts['query'] : '';
    $fragment = isset($parts['fragment']) ? '#' . $parts['fragment'] : '';

    return "{$scheme}://{$host}{$port}{$path}{$query}{$fragment}";
}

function trimNullableUrl($rawUrl): ?string {
    if ($rawUrl === null) {
        return null;
    }
    $trimmed = trim((string)$rawUrl);
    return $trimmed === '' ? null : $trimmed;
}

function findDuplicateUrlRow(array $rows, string $urlColumn, $incomingUrl): ?array {
    $target = normalizeComparableUrl($incomingUrl);
    if ($target === '') {
        return null;
    }
    foreach ($rows as $row) {
        if (normalizeComparableUrl($row[$urlColumn] ?? '') === $target) {
            return $row;
        }
    }
    return null;
}

function buildDuplicateResponse(array $extraData = []): array {
    return [
        'success' => true,
        'duplicate' => true,
        'skipped' => true,
        'message' => 'El enlace ya existe en la BD (omitido)',
        'data' => array_merge($extraData, ['duplicate' => true]),
    ];
}
