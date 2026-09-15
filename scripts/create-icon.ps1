Add-Type -AssemblyName System.Drawing
$bitmap = [System.Drawing.Bitmap]::new(256, 256)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$dark = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#132523'))
$back = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#296359'))
$front = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#80e5c4'))
$pen = [System.Drawing.Pen]::new($dark, 10)
$pen.StartCap = $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
function New-RoundedBox([int]$x, [int]$y, [int]$width, [int]$height, [int]$radius) {
  $shape = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $size = $radius * 2
  $shape.AddArc($x, $y, $size, $size, 180, 90)
  $shape.AddArc($x + $width - $size, $y, $size, $size, 270, 90)
  $shape.AddArc($x + $width - $size, $y + $height - $size, $size, $size, 0, 90)
  $shape.AddArc($x, $y + $height - $size, $size, $size, 90, 90)
  $shape.CloseFigure()
  return $shape
}
$tile = New-RoundedBox 0 0 256 256 48
$rear = New-RoundedBox 59 54 151 112 20
$bubble = New-RoundedBox 30 77 154 103 19
try {
  $graphics.Clear([System.Drawing.Color]::Transparent)
  $graphics.FillPath($dark, $tile)
  $graphics.FillPath($back, $rear)
  $graphics.FillPolygon($back, [System.Drawing.Point[]]@([System.Drawing.Point]::new(134, 165), [System.Drawing.Point]::new(167, 194), [System.Drawing.Point]::new(167, 165)))
  $graphics.FillPath($front, $bubble)
  $graphics.FillPolygon($front, [System.Drawing.Point[]]@([System.Drawing.Point]::new(61, 179), [System.Drawing.Point]::new(61, 207), [System.Drawing.Point]::new(96, 179)))
  $graphics.DrawLines($pen, [System.Drawing.Point[]]@([System.Drawing.Point]::new(79, 111), [System.Drawing.Point]::new(60, 129), [System.Drawing.Point]::new(79, 147)))
  $graphics.DrawLines($pen, [System.Drawing.Point[]]@([System.Drawing.Point]::new(136, 111), [System.Drawing.Point]::new(155, 129), [System.Drawing.Point]::new(136, 147)))
  $graphics.DrawLine($pen, 115, 104, 101, 154)
  $bitmap.Save([System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../media/icons/icon.png')), [System.Drawing.Imaging.ImageFormat]::Png)
} finally {
  $tile.Dispose(); $rear.Dispose(); $bubble.Dispose()
  $pen.Dispose(); $dark.Dispose(); $back.Dispose(); $front.Dispose()
  $graphics.Dispose(); $bitmap.Dispose()
}
