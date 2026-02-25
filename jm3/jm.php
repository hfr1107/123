<?php

header("Content-Type: text/plain;charset=utf-8"); // 确保内容是 utf-8 文本

function fetchUrl($url, $retries = 2, $retryUrls = []) {
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    // 注释说明生产环境应启用SSL验证
    //curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);  // 暂时禁用SSL验证，生产环境请设置为true并配置CA证书
    curl_setopt($ch, CURLOPT_USERAGENT, 'okhttp/4.12.0');
    $response = curl_exec($ch);
    
    if (curl_errno($ch) && $retries > 0) {
        foreach ($retryUrls as $retryUrl) {
            $newUrl = @file_get_contents($retryUrl . '?reurl=' . urlencode($url));
            if ($newUrl) {
                return fetchUrl($newUrl, $retries - 1, []); // 递归调用，重试次数减1，并确保不再使用其他备用URL
            } else {
                throw new Exception("请完善有效地代理地址" . $retryUrl);
            }
        }
        throw new Exception("域名解析出错啦！");
    }
    
    if (curl_errno($ch)) {
        throw new Exception("cURL Error: " . curl_error($ch) . " [URL: " . $url . "]");
    }
    
    curl_close($ch);
    return $response;
}

// 使用示例：

function containsSpecialStrings($response) {
    $specialStrings = ['sites', 'genre', 'EXTINF'];
    foreach ($specialStrings as $string) {
        if (strpos($response, $string) !== false) {
            return true;
        }
    }
    return false;
}

function extractContent($response) {
    if (containsSpecialStrings($response)) {
        return $response;
    }
    
    // 去除空白字符并尝试匹配末尾的 base64 编码字符串
    $responseNoSpaces = preg_replace("/\s+/", "", $response);
    if (preg_match('/\*\*(.*)$/', $responseNoSpaces, $matches)) {
        $decodedResponse = base64_decode($matches[1]);
        if (containsSpecialStrings($decodedResponse)) {
            return $decodedResponse;
        }
    } else {
       if (strpos($responseNoSpaces , "2324") !== false && strpos($responseNoSpaces , "2324") !== false) {
    // AES 解密
    $params = extract_encryption_params($responseNoSpaces);
    $decodedResponse = decrypt_aes($params['encryptedText'], $params['pwdInHax'], $params['roundtimeInHax']);
        if (containsSpecialStrings($decodedResponse)) {
            return $decodedResponse;
        }
}	
    }	
    throw new Exception("//请确保接口可以在 tvbox 中正常使用\n" . $responseNoSpaces);
}
function decrypt_aes($encryptedText, $pwdInHax, $roundtimeInHax) {
$roundTime = hex2bin($roundtimeInHax);
$pwd = hex2bin($pwdInHax);
$iv = str_pad($roundTime, 16, "\0", STR_PAD_RIGHT);
$key = str_pad($pwd, 16, "\0", STR_PAD_RIGHT);
$decryptedData = openssl_decrypt(hex2bin($encryptedText), 'AES-128-CBC', $key, OPENSSL_RAW_DATA, $iv);
return $decryptedData;
}
function decrypt($txt) {
    // Base64 解码（如果需要）
    $encodedData = base64_decode($txt);
    if (contains_special_strings($encodedData)) {
        return $encodedData;
    }
    
    // AES 解密
    $params = extract_encryption_params($encodedData);
    $decryptedData = decrypt_aes($params['encryptedText'], $params['pwdInHax'], $params['roundtimeInHax']);
    
    if (contains_special_strings($decryptedData)) {
        return $decryptedData;
    }
    return "//请确保接口可以在 tvbox 中正常使用\n" . $response;
}

$jm = $_GET['jm'] ?? '';
if (empty($jm)) {
    echo "//未输入url的参数，请在url后加[?jm=接口地址]\n";
    echo "//饭佬==>  ?jm=http://饭太硬.top/tv\n";	
    echo "//OK佬==> ?jm=http://ok321.top/tv\n";	
    exit;
}

try {
    $response = fetchUrl($jm, 2, [
        'https://hfr1107.top/api/box/reurl.php',
        'http://tv.hfr.free.nf/reurl.php'
    ]); 
    echo extractContent($response);
} catch (Exception $e) {
    echo $e->getMessage();
}
?>