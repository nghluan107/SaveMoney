# Gộp index.html + styles.css + app.js thành 1 file dist/so-thu-chi.html để đăng lên claude.ai (Artifact)
$root = $PSScriptRoot
$html = [IO.File]::ReadAllText("$root\index.html", [Text.Encoding]::UTF8)
$css  = [IO.File]::ReadAllText("$root\styles.css", [Text.Encoding]::UTF8)
$js   = [IO.File]::ReadAllText("$root\app.js", [Text.Encoding]::UTF8)

$head = [regex]::Match($html, '(?s)<head>(.*?)</head>').Groups[1].Value
$body = [regex]::Match($html, '(?s)<body>(.*?)</body>').Groups[1].Value

# Bỏ meta charset/viewport (trang Artifact tự thêm), thay stylesheet bằng CSS nội tuyến
$head = [regex]::Replace($head, '<meta[^>]*>\s*', '')
$head = $head.Replace('<link rel="stylesheet" href="styles.css" />', "<style>`n$css`n</style>")
$body = $body.Replace('<script src="app.js"></script>', "<script>`n$js`n</script>")

$out = $head.Trim() + "`n" + $body.Trim() + "`n"
New-Item -ItemType Directory -Force "$root\dist" | Out-Null
[IO.File]::WriteAllText("$root\dist\so-thu-chi.html", $out, (New-Object Text.UTF8Encoding($false)))
Write-Host "Built dist\so-thu-chi.html ($([math]::Round($out.Length/1024)) KB)"
