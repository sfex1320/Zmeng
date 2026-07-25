# ZMENG 图标生成：渐变圆角方块 + 几何 "Z" 字标
# 输出：src-tauri/icons/zmeng-source.png（1024，供 tauri icon 使用）
#       src-tauri/app-icons/zmeng-tray-*.png（64，托盘 6 变体）
[System.Reflection.Assembly]::LoadWithPartialName("System.Drawing") | Out-Null
Add-Type -AssemblyName System.Drawing -ErrorAction SilentlyContinue

$root = Split-Path -Parent $PSScriptRoot
$iconsDir = Join-Path $root "src-tauri\icons"
$trayDir  = Join-Path $root "src-tauri\app-icons"

function New-RoundedPath([single]$x, [single]$y, [single]$w, [single]$h, [single]$r) {
    $p = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $r * 2
    $p.AddArc($x, $y, $d, $d, 180, 90)
    $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
    $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
    $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
    $p.CloseFigure()
    return $p
}

function Make-Icon([int]$size, [string]$path, [bool]$bg, [int[]]$glyph) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.Clear([System.Drawing.Color]::Transparent)

    $S = [single]$size

    if ($bg) {
        $pad = $S * 0.06
        $rs = $S - 2 * $pad
        $radius = $S * 0.22
        $rrect = New-RoundedPath $pad $pad $rs $rs $radius
        $c1 = [System.Drawing.Color]::FromArgb(255, 14, 165, 233)
        $c2 = [System.Drawing.Color]::FromArgb(255, 37, 99, 235)
        $p1 = New-Object System.Drawing.PointF($pad, $pad)
        $p2 = New-Object System.Drawing.PointF(($pad + $rs), ($pad + $rs))
        $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($p1, $p2, $c1, $c2)
        $g.FillPath($brush, $rrect)
        $brush.Dispose()
        $rrect.Dispose()
    }

    # 几何 Z：上横 + 斜杠 + 下横
    $xL = $S * 0.30
    $xR = $S * 0.70
    $yT = $S * 0.32
    $yB = $S * 0.68
    $t  = $S * 0.085
    $dw = $S * 0.12

    $gb = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, $glyph[0], $glyph[1], $glyph[2]))

    # 上横
    $g.FillRectangle($gb, $xL, $yT, ($xR - $xL), $t)
    # 下横
    $g.FillRectangle($gb, $xL, ($yB - $t), ($xR - $xL), $t)
    # 斜杠（平行四边形，从右上到左下）
    $pts = @(
        (New-Object System.Drawing.PointF(($xR - $dw), $yT)),
        (New-Object System.Drawing.PointF($xR, $yT)),
        (New-Object System.Drawing.PointF(($xL + $dw), $yB)),
        (New-Object System.Drawing.PointF($xL, $yB))
    )
    $g.FillPolygon($gb, $pts)
    $gb.Dispose()

    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
    Write-Host "saved $path"
}

$white = @(255, 255, 255)
$dark  = @(31, 41, 55)

# 主图标源（彩色）
Make-Icon 1024 (Join-Path $iconsDir "zmeng-source.png") $true $white

# 托盘 6 变体
Make-Icon 64 (Join-Path $trayDir "zmeng-tray-default.png")      $true  $white
Make-Icon 64 (Join-Path $trayDir "zmeng-tray-snow-default.png") $true  $white
Make-Icon 64 (Join-Path $trayDir "zmeng-tray-light.png")        $false $white
Make-Icon 64 (Join-Path $trayDir "zmeng-tray-snow-light.png")   $false $white
Make-Icon 64 (Join-Path $trayDir "zmeng-tray-dark.png")         $false $dark
Make-Icon 64 (Join-Path $trayDir "zmeng-tray-snow-dark.png")    $false $dark

Write-Host "DONE"
