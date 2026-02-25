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
function extractText($responseNoSpaces) {
    // 检查是否包含两组连续的**
    $pos1 = strpos($responseNoSpaces, '**');
    $pos2 = strpos($responseNoSpaces, '**', $pos1 + 2);

    if ($pos2 !== false) {
        // 如果包含两组连续的**，则取两组**之间的文本
        $start = $pos1 + 2; // 第一组**之后的位置
        $length = $pos2 - $start; // 两组**之间的长度
        return substr($responseNoSpaces, $start, $length);
    } else {
        // 如果只包含一组连续的**，则取**之后的文本
        $pos1 += 2; // 跳过**
        return substr($responseNoSpaces, $pos1);
    }
}
function extractContent($response) {
    if (containsSpecialStrings($response)) {
        return $response;
    }
    
    // 去除空白字符并尝试匹配末尾的 base64 编码字符串
    $responseNoSpaces = preg_replace("/\s+/", "", $response);
       if (strpos($responseNoSpaces, '**') !== false) {
	    $cleaned_text = extractText($responseNoSpaces);
        $responseNoSpaces = base64_decode($cleaned_text);
        if (containsSpecialStrings($responseNoSpaces)) {
			return $responseNoSpaces;
        }
      if (substr($responseNoSpaces, 0, 4) === "2423") {
    // AES 解密
    $params = extract_encryption_params($responseNoSpaces);
    $responseNoSpaces = decrypt_aes($params['encryptedText'], $params['pwdInHax'], $params['roundtimeInHax']);

        if (containsSpecialStrings($responseNoSpaces)) {
            return $responseNoSpaces;
        }
    throw new Exception("//请确保接口可以在 tvbox 中正常使用\n" . $responseNoSpaces);
}	
} 
}
function extract_encryption_params($str) {
    $prefix = "2423";
    $suffix = "2324";
    $pwdMix = substr($str, 0, strpos($str, $suffix) + strlen($suffix));
    $roundtimeInHax = substr($str, -26);
    $encryptedText = substr($str, strlen($pwdMix), -26);
    $pwdInHax = substr($pwdMix, strlen($prefix), -strlen($suffix));
    return [
        'pwdInHax' => $pwdInHax,
        'roundtimeInHax' => $roundtimeInHax,
        'encryptedText' => $encryptedText
    ];
}
function decrypt_aes($encryptedText, $pwdInHax, $roundtimeInHax) {
$roundTime = hex2bin($roundtimeInHax);
$pwd = hex2bin($pwdInHax);
$iv = str_pad($roundTime, 16, "0", STR_PAD_RIGHT);
$key = str_pad($pwd, 16, "0", STR_PAD_RIGHT);	
$decryptedData = openssl_decrypt(hex2bin($encryptedText), 'AES-128-CBC', $key, OPENSSL_RAW_DATA, $iv);
return $decryptedData;
}

    $jm = $_POST['fullAddress'] ?? ''; // 从POST数据中获取合并后的地址

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