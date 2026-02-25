<?php
// 常量定义
const APP_ID = '5f39826474a524f95d5f436eacfacfb67457c4a7';
const APP_VERSION = '1.3.7';
const UA = 'cctv_app_tv';
const REFERER = 'api.cctv.cn';
const PUB_KEY = 'MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC/ZeLwTPPLSU7QGwv6tVgdawz9n7S2CxboIEVQlQ1USAHvBRlWBsU2l7+HuUVMJ5blqGc/5y3AoaUzPGoXPfIm0GnBdFL+iLeRDwOS1KgcQ0fIquvr/2Xzj3fVA1o4Y81wJK5BP8bDTBFYMVOlOoCc1ZzWwdZBYpb4FNxt//5dAwIDAQAB';
const URL_CLOUDWS_REGISTER = 'https://ytpcloudws.cctv.cn/cloudps/wssapi/device/v1/register';
const URL_GET_BASE = 'https://ytpaddr.cctv.cn/gsnw/live';
const URL_GET_APP_SECRET = 'https://ytpaddr.cctv.cn/gsnw/tpa/sk/obtain';
const URL_GET_STREAM = 'https://ytpvdn.cctv.cn/cctvmobileinf/rest/cctv/videoliveUrl/getstream';

// 缓存配置：移除原const CACHE_DIR，改为动态变量（后续在主程序中定义）
const CACHE_TTL = 120;

// CCTV 频道列表
$cctvList = [
    'cctv1'    => 'Live1717729995180256',
    'cctv2'    => 'Live1718261577870260',
    'cctv3'    => 'Live1718261955077261',
    'cctv4'    => 'Live1718276148119264',
    'cctv5'    => 'Live1719474204987287',
    'cctv5p'   => 'Live1719473996025286',
    'cctv7'    => 'Live1718276412224269',
    'cctv8'    => 'Live1718276458899270',
    'cctv9'    => 'Live1718276503187272',
    'cctv10'   => 'Live1718276550002273',
    'cctv11'   => 'Live1718276603690275',
    'cctv12'   => 'Live1718276623932276',
    'cctv13'   => 'Live1718276575708274',
    'cctv14'   => 'Live1718276498748271',
    'cctv15'   => 'Live1718276319614267',
    'cctv16'   => 'Live1718276256572265',
    'cctv17'   => 'Live1718276138318263',
    'cgtnen'   => 'Live1719392219423280',
    'cgtnfr'   => 'Live1719392670442283',
    'cgtnru'   => 'Live1719392779653284',
    'cgtnar'   => 'Live1719392885692285',
    'cgtnes'   => 'Live1719392560433282',
    'cgtndoc'  => 'Live1719392360336281',
    'cctv4k16' => 'Live1704966749996185',
    'cctv4k'   => 'Live1704872878572161',
    'cctv8k'   => 'Live1688400593818102',
];

function getGuid(): string {
    // 引入全局缓存目录变量
    global $CACHE_DIR;
    $cacheFile = $CACHE_DIR . 'guid.cache';
    $guid = '';
    
    if (file_exists($cacheFile) && time() - filemtime($cacheFile) < CACHE_TTL) {
        $guid = trim(file_get_contents($cacheFile));
    }
    
    if (strlen($guid) >= 18) {
        return $guid;
    }
    
    $timestamp = base_convert((string)round(microtime(true) * 1000), 10, 36);
    $random = base_convert((string)mt_rand(), 10, 36);
    $randomPart = substr($random, 0, 11);
    $padLength = 11 - strlen($randomPart);
    $newGuid = $timestamp . "_" . str_repeat('0', $padLength) . $randomPart;
    
    file_put_contents($cacheFile, $newGuid);
    
    return $newGuid;
}  

function encryptByPublicKey($data, $pubKeyStr) {
    $pubKey = openssl_pkey_get_public("-----BEGIN PUBLIC KEY-----\n" .
        chunk_split($pubKeyStr, 64, "\n") .
        "-----END PUBLIC KEY-----");
    
    if ($pubKey === false) {
        die("公钥加载失败: " . openssl_error_string());
    }
    
    openssl_public_encrypt($data, $encrypted, $pubKey);
    return base64_encode($encrypted);
}

function decryptByPublicKey($encryptedStr, $pubKeyStr) {
    $pubKey = openssl_pkey_get_public("-----BEGIN PUBLIC KEY-----\n" .
        chunk_split($pubKeyStr, 64, "\n") .
        "-----END PUBLIC KEY-----");
    
    if ($pubKey === false) {
        die("公钥加载失败: " . openssl_error_string());
    }
    
    $encrypted = base64_decode($encryptedStr);
    openssl_public_decrypt($encrypted, $decrypted, $pubKey);
    
    return $decrypted;
}

function httpPost($url, $data, $headers = []) {
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $data);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    curl_setopt($ch, CURLOPT_TIMEOUT, 15);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_MAXREDIRS, 3);
    
    $response = curl_exec($ch);
    curl_close($ch);
    
    return $response;
}

function getAppSecret($guid, $uid) {
    // 引入全局缓存目录变量
    global $CACHE_DIR;
    $cacheKey = 'app_secret_' . md5($uid . $guid);
    $cacheFile = $CACHE_DIR . $cacheKey;
    
    if (file_exists($cacheFile)) {
        $cacheData = json_decode(file_get_contents($cacheFile), true);
        
        if ($cacheData) {
            $cacheAge = time() - $cacheData['time'];
            
            if ($cacheAge < CACHE_TTL) {
                return $cacheData['data'];
            }
        }
    }
    
    $encryptedGUID = encryptByPublicKey($guid, PUB_KEY);
    
    $requestBody = json_encode(['guid' => $encryptedGUID]);
    $headers = [
        'Accept: application/json',
        'UID: ' . $uid,
        'Referer: ' . REFERER,
        'User-Agent: ' . UA,
        'Content-Type: application/json',
    ];
    
    $response = httpPost(URL_GET_APP_SECRET, $requestBody, $headers);
    $result = json_decode($response, true);
    
    if (json_last_error() !== JSON_ERROR_NONE) {
        die("JSON解析失败: " . json_last_error_msg());
    }
    
    if (!isset($result['data']['appSecret'])) {
        die("API响应中缺少appSecret字段");
    }
    
    $appSecret = decryptByPublicKey($result['data']['appSecret'], PUB_KEY);
    
    $cacheContent = json_encode([
        'data' => $appSecret,
        'time' => time()
    ]);
    
    file_put_contents($cacheFile, $cacheContent);
    
    return $appSecret;
}

function getBaseM3uUrl($liveID, $uid) {
    // 引入全局缓存目录变量
    global $CACHE_DIR;
    $cacheKey = 'base_m3u_' . md5($uid . $liveID);
    $cacheFile = $CACHE_DIR . $cacheKey;
    
    if (file_exists($cacheFile)) {
        $cacheData = json_decode(file_get_contents($cacheFile), true);
        
        if ($cacheData) {
            $cacheAge = time() - $cacheData['time'];
            
            if ($cacheAge < CACHE_TTL) {
                return $cacheData['data'];
            }
        }
    }
    
    $requestBody = json_encode([
        'rate'       => '',
        'systemType' => 'android',
        'model'      => '',
        'id'         => $liveID,
        'userId'     => '',
        'clientSign' => 'cctvVideo',
        'deviceId'   => [
            'serial'     => '',
            'imei'       => '',
            'android_id' => $uid,
        ],
    ]);
    
    $headers = [
        'Accept: application/json',
        'UID: ' . $uid,
        'Referer: ' . REFERER,
        'User-Agent: ' . UA,
        'Content-Type: application/json',
    ];
    
    $response = httpPost(URL_GET_BASE, $requestBody, $headers);
    $result = json_decode($response, true);
    
    if (json_last_error() !== JSON_ERROR_NONE) {
        die("JSON解析失败: " . json_last_error_msg());
    }
    
    if (!isset($result['data']['videoList'][0]['url'])) {
        die("API响应中缺少videoList或url字段");
    }
    
    $baseUrl = $result['data']['videoList'][0]['url'];
    
    $cacheContent = json_encode([
        'data' => $baseUrl,
        'time' => time()
    ]);
    
    file_put_contents($cacheFile, $cacheContent);
    
    return $baseUrl;
}

function getM3uUrl($channelLiveID, $uid, $guid) {
    // 引入全局缓存目录变量
    global $CACHE_DIR;
    $appSecret = getAppSecret($guid, $uid);
    $baseUrl = getBaseM3uUrl($channelLiveID, $uid);

    $streamCacheKey = 'stream_url_' . md5($uid . $channelLiveID);
    $streamCacheFile = $CACHE_DIR . $streamCacheKey;

    $streamUrl = '';
    if (file_exists($streamCacheFile)) {
        $cacheData = json_decode(file_get_contents($streamCacheFile), true);
        
        if ($cacheData) {
            $cacheAge = time() - $cacheData['time'];
            
            if ($cacheAge < CACHE_TTL) {
                $streamUrl = $cacheData['data'];
            }
        }
    }

    if (empty($streamUrl)) {
        $appRandomStr = uniqid();
        $appSign = md5(APP_ID . $appSecret . $appRandomStr);
        
        $postData = [
            'appcommon' => '{"adid":"' . $uid . '","av":"' . APP_VERSION . '","an":"央视视频电视投屏助手","ap":"cctv_app_tv"}',
            'url'       => $baseUrl,
        ];
        
        $headers = [
            'User-Agent: ' . UA,
            'Referer: ' . REFERER,
            'UID: ' . $uid,
            'APPID: ' . APP_ID,
            'APPSIGN: ' . $appSign,
            'APPRANDOMSTR: ' . $appRandomStr,
            'Content-Type: application/x-www-form-urlencoded',
        ];

        $retry = 2;
        $response = '';
        while ($retry-- > 0) {
            $response = httpPost(URL_GET_STREAM, http_build_query($postData), $headers);
            
            if (!empty($response)) {
                break;
            }
            
            usleep(500000);
        }

        $result = json_decode($response, true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            die("JSON解析失败: " . json_last_error_msg());
        }
        
        if (empty($response) || !is_array($result) || !isset($result['url'])) {
            die("获取视频流失败");
        }
        
        $streamUrl = $result['url'];

        $cacheContent = json_encode([
            'data' => $streamUrl,
            'time' => time()
        ]);
        
        file_put_contents($streamCacheFile, $cacheContent);
    }

    $urlParts = parse_url($streamUrl);
    
    if (!isset($urlParts['scheme'], $urlParts['host'])) {
        die("URL解析失败，缺少必要字段");
    }

    $basePath = $urlParts['scheme'] . '://' . $urlParts['host'];
    if (isset($urlParts['path'])) {
        $basePath .= dirname($urlParts['path']) . '/';
    } else {
        $basePath .= '/';
    }
    $urlQuery = $urlParts['query'] ?? '';

    $ch = curl_init();
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_URL, $streamUrl);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        "User-Agent: " . UA,
        "Referer: " . REFERER,
        "UID: " . $uid,
    ]);
    
    $data = curl_exec($ch);
    
    if (curl_errno($ch)) {
        die("cURL错误: " . curl_error($ch));
    }
    
    curl_close($ch);
    
    // 动态获取代理基础地址（根据当前服务器信息）
    $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? "https" : "http";
    $host = $_SERVER['HTTP_HOST'] ?? $_SERVER['SERVER_NAME'];
    $scriptPath = $_SERVER['SCRIPT_NAME'] ?? '';
    $proxyBaseUrl = $protocol . "://" . $host . $scriptPath;

    // 处理M3U8内容，生成代理链接并去除重复参数
    $m3u8Content = preg_replace_callback('/([^\r\n]+\.ts(?:\?[^\r\n]+)?)/i', function($matches) use ($proxyBaseUrl) {
        $tsUrl = $matches[1];
        
        // 解析TS URL
        $parsed = parse_url($tsUrl);
        if (!$parsed) {
            return $tsUrl;
        }
        
        // 提取TS文件名（live/后面的部分）
        $tsFile = basename($parsed['path'] ?? '');
        
        // 解析查询参数
        $queryParams = [];
        if (!empty($parsed['query'])) {
            parse_str($parsed['query'], $queryParams);
        }
        
        // 提取有效的wsSecret和wsTime（取第一个值，去除重复）
        $wsSecret = is_array($queryParams['wsSecret'] ?? null) ? $queryParams['wsSecret'][0] : ($queryParams['wsSecret'] ?? '');
        $wsTime = is_array($queryParams['wsTime'] ?? null) ? $queryParams['wsTime'][0] : ($queryParams['wsTime'] ?? '');
        
        // 构建代理链接
        $proxyParams = [
            'ts' => $tsFile,//如直连注释掉
            'wsSecret' => $wsSecret,
            'wsTime' => $wsTime
        ];
        //return 'http://liveali-tpgq.cctv.cn/live/' . $tsFile . '?' . http_build_query($proxyParams);//直连
        return $proxyBaseUrl . '?' . http_build_query($proxyParams);
    }, $data);
    
    return $m3u8Content;
}

// TS文件代理转发
if (isset($_GET['ts'])) {
    $uid = $_GET['uid'] ?? '1234123122';//12b611e9210b7fb3
    $guid = '5533d255662146f7a58ee081b4a51aac';//getGuid();
    
    // 定义TS代理场景下的缓存目录（因$uid已赋值）
    $CACHE_DIR = __DIR__ . '/cache/ysptp/'. $uid. '/';
    // 确保缓存目录存在
    if (!file_exists($CACHE_DIR)) {
        mkdir($CACHE_DIR, 0777, true);
    }
    
    $appSecret = getAppSecret($guid, $uid);
    $appRandomStr = uniqid();
    $appSign = md5(APP_ID . $appSecret . $appRandomStr);
    
    $ts = $_GET['ts'] ?? '';  
    $wsSecret = $_GET['wsSecret'] ?? '';
    $wsTime = $_GET['wsTime'] ?? '';
    
    $ts_url = "http://liveali-tpgq.cctv.cn/live/{$ts}?wsSecret={$wsSecret}&wsTime={$wsTime}";
    
    $headers = [
        "User-Agent: cctv_app_tv",
        "Referer: api.cctv.cn",
        "UID: " . $uid,
        "APPSIGN: " . $appSign,        
        "APPID: 5f39826474a524f95d5f436eacfacfb67457c4a7",
        "APPRANDOMSTR: " . $appRandomStr,
        "Accept: */*",
        "Accept-Encoding: gzip, deflate",
        "Accept-Language: zh-CN,zh;q=0.9",
        "Connection: keep-alive",
        "appChannel: CCTV",
    ];

    $ch = curl_init($ts_url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    
    $tsData = curl_exec($ch);
    curl_close($ch);
    
    header("Content-Type: video/MP2T");
    echo $tsData;
    exit;
}

// 主程序
$uid = $_GET['uid'] ?? '1234123122';//12b611e9210b7fb3
$guid = '5533d255662146f7a58ee081b4a51aac';//getGuid();
$id = $_GET['id'] ?? 'cctv1';

// 定义主程序场景下的缓存目录（$uid已赋值，修复核心语法错误）
$CACHE_DIR = __DIR__ . '/cache/ysptp/'. $uid. '/';
// 确保缓存目录存在
if (!file_exists($CACHE_DIR)) {
    mkdir($CACHE_DIR, 0777, true);
}

if (!isset($cctvList[$id])) {
    die("无效的频道ID: " . $id);
}

$channelLiveID = $cctvList[$id];

// 无缓存头
header("Cache-Control: no-cache, no-store, must-revalidate");
header("Pragma: no-cache");
header("Expires: 0");
header("Content-Type: application/x-mpegURL; charset=utf-8");
header("Content-Disposition: inline; filename=" . $id . ".m3u8");

$m3u8Content = getM3uUrl($channelLiveID, $uid, $guid);
echo $m3u8Content;
?>