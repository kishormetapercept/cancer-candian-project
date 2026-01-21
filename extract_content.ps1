[xml]$xml = Get-Content "c:\Projects\Cancer Canadian Project\output\Find cancer early\_Local\Phone Message\{6F8D1E10-EB67-4103-947E-3DE923658237}\en\1\xml"

$contentList = @()
foreach ($content in $xml.SelectNodes("//content")) {
    if ($content.InnerText) {
        $contentList += $content.InnerText
    }
}

$contentList -join "`n`n" | Out-File -FilePath "c:\Projects\Cancer Canadian Project\data.txt" -Encoding UTF8

Write-Host "Extracted $($contentList.Count) content blocks to data.txt"