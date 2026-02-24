<?php
// rsa_handler.php
const PUB_KEY = 'MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC/ZeLwTPPLSU7QGwv6tVgdawz9n7S2CxboIEVQlQ1USAHvBRlWBsU2l7+HuUVMJ5blqGc/5y3AoaUzPGoXPfIm0GnBdFL+iLeRDwOS1KgcQ0fIquvr/2Xzj3fVA1o4Y81wJK5BP8bDTBFYMVOlOoCc1ZzWwdZBYpb4FNxt//5dAwIDAQAB';

function encryptByPublicKey($data) {
    $pubKey = openssl_pkey_get_public("-----BEGIN PUBLIC KEY-----\n" .
        chunk_split(PUB_KEY, 64, "\n") .
        "-----END PUBLIC KEY-----");
    
    if ($pubKey === false) {
        return json_encode(['error' => '公钥加载失败: ' . openssl_error_string()]);
    }
    
    $encrypted = '';
    if (openssl_public_encrypt($data, $encrypted, $pubKey)) {
        return json_encode(['data' => base64_encode($encrypted)]);
    } else {
        return json_encode(['error' => '加密失败: ' . openssl_error_string()]);
    }
}

function decryptByPublicKey($encryptedStr) {
    $pubKey = openssl_pkey_get_public("-----BEGIN PUBLIC KEY-----\n" .
        chunk_split(PUB_KEY, 64, "\n") .
        "-----END PUBLIC KEY-----");
    
    if ($pubKey === false) {
        return json_encode(['error' => '公钥加载失败: ' . openssl_error_string()]);
    }
    
    $encrypted = base64_decode($encryptedStr);
    $decrypted = '';
    
    if (openssl_public_decrypt($encrypted, $decrypted, $pubKey)) {
        return json_encode(['data' => $decrypted]);
    } else {
        return json_encode(['error' => '解密失败: ' . openssl_error_string()]);
    }
}

function getGuid() {
    $cacheFile = __DIR__ . '/cache/guid.cache';
    $guid = '';
    
    if (file_exists($cacheFile) && time() - filemtime($cacheFile) < 120) {
        $guid = trim(file_get_contents($cacheFile));
    }
    
    if (strlen($guid) >= 18) {
        return json_encode(['data' => $guid]);
    }
    
    $timestamp = base_convert((string)round(microtime(true) * 1000), 10, 36);
    $random = base_convert((string)mt_rand(), 10, 36);
    $randomPart = substr($random, 0, 11);
    $padLength = 11 - strlen($randomPart);
    $newGuid = $timestamp . "_" . str_repeat('0', $padLength) . $randomPart;
    
    // 确保缓存目录存在
    if (!file_exists(dirname($cacheFile))) {
        mkdir(dirname($cacheFile), 0777, true);
    }
    
    file_put_contents($cacheFile, $newGuid);
    
    return json_encode(['data' => $newGuid]);
}

// 处理请求
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

$action = $_GET['action'] ?? '';

switch ($action) {
    case 'encrypt':
        $data = file_get_contents('php://input');
        echo encryptByPublicKey($data);
        break;
    case 'decrypt':
        $data = file_get_contents('php://input');
        echo decryptByPublicKey($data);
        break;
    case 'guid':
        echo getGuid();
        break;
    default:
        echo json_encode(['error' => '未知操作']);
        break;
}
?>