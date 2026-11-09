# Local web server for the 1031 post-exam 3D deck (Windows, no install needed: built-in PowerShell).
# Started by "Start-Windows.bat". Opens the default browser at http://localhost:<port>/
# Keep this window open while presenting; close it to stop.
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$types = @{
  ".html" = "text/html; charset=utf-8"; ".css" = "text/css; charset=utf-8"; ".js" = "text/javascript; charset=utf-8"
  ".json" = "application/json"; ".glb" = "model/gltf-binary"; ".mp3" = "audio/mpeg"; ".mp4" = "video/mp4"
  ".png" = "image/png"; ".jpg" = "image/jpeg"; ".jpeg" = "image/jpeg"; ".svg" = "image/svg+xml"; ".txt" = "text/plain; charset=utf-8"
}
$listener = $null
foreach ($port in 8785..8795) {
  try {
    $l = New-Object System.Net.HttpListener
    $l.Prefixes.Add("http://localhost:$port/")
    $l.Start()
    $listener = $l; break
  } catch { }
}
if (-not $listener) { Write-Host "Cannot open a local port (8785-8795)."; Read-Host "Press Enter to exit"; exit 1 }
$url = $listener.Prefixes | Select-Object -First 1
Write-Host ""
Write-Host "  1031 deck is running at $url"
Write-Host "  Keep this window open while presenting. Close it to stop."
Write-Host ""
if (-not $env:DECK_NO_BROWSER) { Start-Process $url }
while ($listener.IsListening) {
  try { $ctx = $listener.GetContext() } catch { break }
  $res = $ctx.Response
  try {
    $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart("/")
    if ($rel -eq "") { $rel = "index.html" }
    $path = [IO.Path]::GetFullPath([IO.Path]::Combine($root, $rel))
    if (-not $path.StartsWith($root) -or -not [IO.File]::Exists($path)) {
      $res.StatusCode = 404
    } else {
      $ext = [IO.Path]::GetExtension($path).ToLower()
      $res.ContentType = $(if ($types.ContainsKey($ext)) { $types[$ext] } else { "application/octet-stream" })
      $res.Headers.Add("Cache-Control", "no-store")
      $fs = [IO.File]::OpenRead($path)
      try { $res.ContentLength64 = $fs.Length; $fs.CopyTo($res.OutputStream) } finally { $fs.Close() }
    }
  } catch { } finally { try { $res.Close() } catch { } }
}
