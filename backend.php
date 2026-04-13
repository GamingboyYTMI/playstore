<?php
/**
 * Play Store Clone Backend
 * Handles file uploads and downloads
 */

header('Content-Type: application/json');

$action = $_GET['action'] ?? '';

// Configuration
$apkDir = 'apk/';
$imagesDir = 'images/';

// Ensure directories exist
if (!is_dir($apkDir)) mkdir($apkDir, 0777, true);
if (!is_dir($imagesDir)) mkdir($imagesDir, 0777, true);

if ($action === 'upload') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        echo json_encode(['error' => 'Invalid request method']);
        exit;
    }

    if (!isset($_FILES['apk']) || !isset($_FILES['icon'])) {
        echo json_encode(['error' => 'Missing files']);
        exit;
    }

    $apkFile = $_FILES['apk'];
    $iconFile = $_FILES['icon'];
    $previews = $_FILES['previews'] ?? null;

    $apkName = time() . '_' . basename($apkFile['name']);
    $iconName = time() . '_' . basename($iconFile['name']);

    $apkTarget = $apkDir . $apkName;
    $iconTarget = $imagesDir . $iconName;

    $previewPaths = [];

    if (move_uploaded_file($apkFile['tmp_name'], $apkTarget) && move_uploaded_file($iconFile['tmp_name'], $iconTarget)) {
        
        if ($previews) {
            foreach ($previews['tmp_name'] as $key => $tmpName) {
                if ($previews['error'][$key] === UPLOAD_ERR_OK) {
                    $pName = time() . '_' . $key . '_' . basename($previews['name'][$key]);
                    $pTarget = $imagesDir . $pName;
                    if (move_uploaded_file($tmpName, $pTarget)) {
                        $previewPaths[] = $pTarget;
                    }
                }
            }
        }

        echo json_encode([
            'apk' => $apkTarget,
            'icon' => $iconTarget,
            'previews' => $previewPaths,
            'size' => round($apkFile['size'] / (1024 * 1024), 1) . ' MB'
        ]);
    } else {
        echo json_encode(['error' => 'Failed to move uploaded files']);
    }
} elseif ($action === 'download') {
    $file = $_GET['file'] ?? '';
    if (empty($file)) {
        die('No file specified');
    }

    $filePath = $apkDir . basename($file);
    if (file_exists($filePath)) {
        header('Content-Description: File Transfer');
        header('Content-Type: application/vnd.android.package-archive');
        header('Content-Disposition: attachment; filename="' . basename($filePath) . '"');
        header('Expires: 0');
        header('Cache-Control: must-revalidate');
        header('Pragma: public');
        header('Content-Length: ' . filesize($filePath));
        readfile($filePath);
        exit;
    } else {
        die('File not found');
    }
} else {
    echo json_encode(['error' => 'Invalid action']);
}
?>
