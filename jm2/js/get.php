<?php
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $fullAddress = $_POST['fullAddress'] ?? ''; // 从POST数据中获取合并后的地址
    // 在这里你可以添加代码来处理或获取该合并地址的相关数据
    // 例如，你可能想查询某个API或使用其他逻辑来获取该地址的详细信息
    // 为简单起见，这里我们仅返回接收到的地址
    $fullAddress = @file_get_contents($fullAddress);
    echo $fullAddress; // 返回处理后的数据给前端AJAX调用者
} else {
    echo "Invalid request method.";
}
?>