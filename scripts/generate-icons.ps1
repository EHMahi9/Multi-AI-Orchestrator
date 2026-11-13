Add-Type -AssemblyName System.Drawing

function Create-AppIcon {
    param(
        [int]$size,
        [string]$outPng
    )
    
    $bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)

    [float]$center = [float]$size / 2.0
    [float]$radius = [float]$size * 0.44

    # Hexagon points
    $points = New-Object "System.Drawing.PointF[]" 6
    for ($i = 0; $i -lt 6; $i++) {
        $angleDeg = 60.0 * $i - 30.0
        $angleRad = [Math]::PI / 180.0 * $angleDeg
        [float]$x = $center + ($radius * [Math]::Cos($angleRad))
        [float]$y = $center + ($radius * [Math]::Sin($angleRad))
        $points[$i] = New-Object System.Drawing.PointF($x, $y)
    }

    # Fill Hexagon Shield with Dark Slate Navy (#0a0d15)
    $shieldBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 10, 13, 21))
    $g.FillPolygon($shieldBrush, $points)

    # Outer Hexagon Border (#3b82f6)
    [float]$penW = [Math]::Max(2.0, [float]$size * 0.035)
    $borderPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 59, 130, 246), $penW)
    $g.DrawPolygon($borderPen, $points)

    # Cross Relays (Lines)
    [float]$relayW = [Math]::Max(1.5, [float]$size * 0.02)
    $relayPenBlue = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(200, 56, 189, 248), $relayW)
    $relayPenGreen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(200, 16, 185, 129), $relayW)

    [float]$nodeDist = [float]$size * 0.28
    $topPt = New-Object System.Drawing.PointF($center, ($center - $nodeDist))
    $rightPt = New-Object System.Drawing.PointF(($center + $nodeDist), $center)
    $bottomPt = New-Object System.Drawing.PointF($center, ($center + $nodeDist))
    $leftPt = New-Object System.Drawing.PointF(($center - $nodeDist), $center)

    $g.DrawLine($relayPenBlue, $topPt, $bottomPt)
    $g.DrawLine($relayPenGreen, $leftPt, $rightPt)

    # Diamond Mesh
    [float]$meshW = [Math]::Max(1.0, [float]$size * 0.015)
    $meshPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(140, 99, 102, 241), $meshW)
    $g.DrawLine($meshPen, $topPt, $rightPt)
    $g.DrawLine($meshPen, $rightPt, $bottomPt)
    $g.DrawLine($meshPen, $bottomPt, $leftPt)
    $g.DrawLine($meshPen, $leftPt, $topPt)

    # Center Nexus Core Diamond
    [float]$coreSize = [float]$size * 0.08
    $corePts = New-Object "System.Drawing.PointF[]" 4
    $corePts[0] = New-Object System.Drawing.PointF($center, ($center - $coreSize))
    $corePts[1] = New-Object System.Drawing.PointF(($center + $coreSize), $center)
    $corePts[2] = New-Object System.Drawing.PointF($center, ($center + $coreSize))
    $corePts[3] = New-Object System.Drawing.PointF(($center - $coreSize), $center)
    $coreBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 99, 102, 241))
    $g.FillPolygon($coreBrush, $corePts)

    $coreCenterBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    [float]$coreDotR = [Math]::Max(2.0, [float]$size * 0.025)
    $g.FillEllipse($coreCenterBrush, ($center - $coreDotR), ($center - $coreDotR), ($coreDotR * 2.0), ($coreDotR * 2.0))

    # 4 AI Nodes
    [float]$nodeRadius = [Math]::Max(3.0, [float]$size * 0.045)
    [float]$nodeDiameter = $nodeRadius * 2.0
    [float]$nodePenW = [Math]::Max(1.0, [float]$size * 0.015)

    function DrawNode($point, $color) {
        $brush = New-Object System.Drawing.SolidBrush($color)
        $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::White, $nodePenW)
        $g.FillEllipse($brush, ($point.X - $nodeRadius), ($point.Y - $nodeRadius), $nodeDiameter, $nodeDiameter)
        $g.DrawEllipse($pen, ($point.X - $nodeRadius), ($point.Y - $nodeRadius), $nodeDiameter, $nodeDiameter)
    }

    DrawNode $topPt ([System.Drawing.Color]::FromArgb(255, 6, 182, 212))     # DeepSeek Cyan
    DrawNode $rightPt ([System.Drawing.Color]::FromArgb(255, 16, 163, 127))   # ChatGPT Emerald
    DrawNode $bottomPt ([System.Drawing.Color]::FromArgb(255, 59, 130, 246))  # Gemini Blue
    DrawNode $leftPt ([System.Drawing.Color]::FromArgb(255, 245, 158, 11))   # Claude Gold

    $g.Flush()
    $bmp.Save($outPng, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    return $bmp
}

$projRoot = "D:\code\NEXT JS\multi-ai-orchestrator"
$pubDir = Join-Path $projRoot "public"
$resDir = Join-Path $projRoot "resources"

if (-not (Test-Path $resDir)) {
    New-Item -ItemType Directory -Path $resDir | Out-Null
}

# 1. Generate 256x256 PNG for Electron app & taskbar
$png256 = Join-Path $pubDir "icon.png"
$bmp256 = Create-AppIcon -size 256 -outPng $png256
Copy-Item $png256 (Join-Path $resDir "icon.png") -Force

# 2. Generate 32x32 for high quality Windows .ico
$png32 = Join-Path $pubDir "icon-32.png"
$bmp32 = Create-AppIcon -size 32 -outPng $png32
$hIcon = $bmp32.GetHicon()
$icon = [System.Drawing.Icon]::FromHandle($hIcon)

$icoPath = Join-Path $pubDir "favicon.ico"
$fileStream = [System.IO.File]::OpenWrite($icoPath)
$icon.Save($fileStream)
$fileStream.Close()
Copy-Item $icoPath (Join-Path $resDir "icon.ico") -Force
Remove-Item $png32 -Force

Write-Host "Icons successfully created at $pubDir and $resDir"
