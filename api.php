<?php
// Set headers to allow cross-origin requests (only needed if frontend is on a different domain)
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json');

// Get the action from the request
$action = isset($_GET['action']) ? $_GET['action'] : '';

// Handle the request based on the action
switch ($action) {
    case 'fetch':
        fetchUrl();
        break;
    case 'sitemap':
        parseSitemap();
        break;
    case 'analyze-page':
        analyzePage();
        break;
    default:
        echo json_encode(['error' => 'Invalid action']);
        break;
}

// Function to fetch a URL
function fetchUrl() {
    $url = isset($_GET['url']) ? $_GET['url'] : '';

    if (empty($url)) {
        echo json_encode(['error' => 'URL parameter is required']);
        return;
    }

    // Initialize cURL session
    $ch = curl_init();

    // Set cURL options
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_MAXREDIRS, 5);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);
    curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Website Image Alt Analyzer');
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Accept: text/html,application/xhtml+xml,application/xml,text/plain',
        'Accept-Language: en-US,en;q=0.9'
    ]);

    // Execute cURL session
    $content = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);

    // Close cURL session
    curl_close($ch);

    // Check for errors
    if ($error) {
        echo json_encode(['error' => 'Failed to fetch URL', 'message' => $error, 'url' => $url]);
        return;
    }

    if ($httpCode >= 400) {
        echo json_encode(['error' => 'HTTP error', 'code' => $httpCode, 'url' => $url]);
        return;
    }

    // Output the content directly (not as JSON)
    header('Content-Type: text/html; charset=utf-8');
    echo $content;
}

// Function to parse a sitemap
function parseSitemap() {
    $url = isset($_GET['url']) ? $_GET['url'] : '';

    if (empty($url)) {
        echo json_encode(['error' => 'URL parameter is required']);
        return;
    }

    // Initialize cURL session
    $ch = curl_init();

    // Set cURL options
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_MAXREDIRS, 5);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);
    curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Website Image Alt Analyzer');
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Accept: application/xml,text/xml',
        'Accept-Language: en-US,en;q=0.9'
    ]);

    // Execute cURL session
    $xml = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);

    // Close cURL session
    curl_close($ch);

    // Check for errors
    if ($error) {
        echo json_encode(['error' => 'Failed to fetch sitemap', 'message' => $error, 'url' => $url]);
        return;
    }

    if ($httpCode >= 400) {
        echo json_encode(['error' => 'HTTP error', 'code' => $httpCode, 'url' => $url]);
        return;
    }

    // Load XML
    $xmlObj = simplexml_load_string($xml);

    if ($xmlObj === false) {
        echo json_encode(['error' => 'Invalid XML', 'url' => $url]);
        return;
    }

    // Check if it's a sitemap index or regular sitemap
    $namespaces = $xmlObj->getNamespaces(true);
    $urls = [];
    $type = '';

    // Check if this is a sitemap index
    if ($xmlObj->getName() === 'sitemapindex') {
        $type = 'sitemapindex';
        foreach ($xmlObj->sitemap as $sitemap) {
            $urls[] = (string)$sitemap->loc;
        }
    }
    // Check if this is a regular sitemap
    elseif ($xmlObj->getName() === 'urlset') {
        $type = 'urlset';
        foreach ($xmlObj->url as $url) {
            $urls[] = (string)$url->loc;
        }
    }

    echo json_encode([
        'type' => $type,
        'urls' => $urls
    ]);
}

// Function to analyze a page for images
function analyzePage() {
    $url = isset($_GET['url']) ? $_GET['url'] : '';

    if (empty($url)) {
        echo json_encode(['error' => 'URL parameter is required']);
        return;
    }

    // Initialize cURL session
    $ch = curl_init();

    // Set cURL options
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_MAXREDIRS, 5);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);
    curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Website Image Alt Analyzer');
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Accept: text/html,application/xhtml+xml',
        'Accept-Language: en-US,en;q=0.9'
    ]);

    // Execute cURL session
    $html = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);

    // Close cURL session
    curl_close($ch);

    // Check for errors
    if ($error) {
        echo json_encode(['error' => 'Failed to fetch page', 'message' => $error, 'url' => $url]);
        return;
    }

    if ($httpCode >= 400) {
        echo json_encode(['error' => 'HTTP error', 'code' => $httpCode, 'url' => $url]);
        return;
    }

    // Load HTML
    libxml_use_internal_errors(true);
    $dom = new DOMDocument();
    $dom->loadHTML($html);
    $xpath = new DOMXPath($dom);

    // Find all images
    $images = [];
    $imgNodes = $xpath->query('//img');

    foreach ($imgNodes as $img) {
        // Get image attributes
        $src = $img->getAttribute('src');
        $alt = $img->getAttribute('alt');
        $width = $img->getAttribute('width');
        $height = $img->getAttribute('height');

        // Check for lazy-loaded images
        if (!$src || strpos($src, 'data:') === 0 || strpos($src, 'blank.gif') !== false) {
            $dataSrc = $img->getAttribute('data-src') ?:
                       $img->getAttribute('data-lazy-src') ?:
                       $img->getAttribute('data-original') ?:
                       $img->getAttribute('lazy-src');

            if ($dataSrc) {
                $src = $dataSrc;
            }
        }

        // Skip if no valid source
        if (!$src || strpos($src, 'data:') === 0 || strlen($src) < 5) {
            continue;
        }

        // Skip tiny images (if dimensions are available)
        if (($width && intval($width) < 50) || ($height && intval($height) < 50)) {
            continue;
        }

        // Resolve relative URLs
        if (strpos($src, 'http') !== 0) {
            $base = parse_url($url);
            if (strpos($src, '//') === 0) {
                $src = $base['scheme'] . ':' . $src;
            } elseif (strpos($src, '/') === 0) {
                $src = $base['scheme'] . '://' . $base['host'] . $src;
            } else {
                $path = isset($base['path']) ? $base['path'] : '/';
                $path = preg_replace('#/[^/]*$#', '/', $path);
                $src = $base['scheme'] . '://' . $base['host'] . $path . $src;
            }
        }

        // Add to results
        $images[] = [
            'src' => $src,
            'alt' => $alt ?: '',
            'hasMissingAlt' => empty($alt)
        ];
    }

    // Find all links for crawling
    $links = [];
    $linkNodes = $xpath->query('//a[@href]');

    foreach ($linkNodes as $link) {
        $href = $link->getAttribute('href');

        // Skip invalid links
        if (!$href || strpos($href, '#') === 0 || strpos($href, 'javascript:') === 0 ||
            strpos($href, 'mailto:') === 0 || strpos($href, 'tel:') === 0) {
            continue;
        }

        // Resolve relative URLs
        if (strpos($href, 'http') !== 0) {
            $base = parse_url($url);
            if (strpos($href, '//') === 0) {
                $href = $base['scheme'] . ':' . $href;
            } elseif (strpos($href, '/') === 0) {
                $href = $base['scheme'] . '://' . $base['host'] . $href;
            } else {
                $path = isset($base['path']) ? $base['path'] : '/';
                $path = preg_replace('#/[^/]*$#', '/', $path);
                $href = $base['scheme'] . '://' . $base['host'] . $path . $href;
            }
        }

        $links[] = $href;
    }

    // Remove duplicate links
    $links = array_unique($links);

    echo json_encode([
        'url' => $url,
        'images' => $images,
        'links' => array_values($links)
    ]);
}
?>