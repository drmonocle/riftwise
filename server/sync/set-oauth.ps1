# Puts the Discord / Twitch app keys for RiftWise sign-in on HomeServer (W:\Sites\riftwise-sync-data\oauth.json).
# Run on the main PC:  powershell -ExecutionPolicy Bypass -File server\sync\set-oauth.ps1
# Press Enter to keep the client ID shown in brackets; paste each secret when asked (it isn't shown on screen).
# The sync service notices the new file by itself within a minute. Never commit oauth.json or paste secrets in chat.
param(
    [string]$Path = "W:\Sites\riftwise-sync-data\oauth.json"
)

function AskId($label, $default) {
    $v = Read-Host "$label [$default]"
    if ([string]::IsNullOrWhiteSpace($v)) { $default } else { $v.Trim() }
}

function AskSecret($label) {
    $s = Read-Host -AsSecureString $label
    $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
    try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b).Trim() } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }
}

$discordId = AskId "Discord client ID" "1560863566855143545"
$discordSecret = AskSecret "Discord client secret (Enter to skip Discord)"
$twitchId = AskId "Twitch client ID" "ta6y4hfflv25ah768prqffvt13ki9g"
$twitchSecret = AskSecret "Twitch client secret (Enter to skip Twitch)"

$o = [ordered]@{ publicBase = "https://lolworlds.com/riftwise" }
if ($discordSecret) { $o.discord = [ordered]@{ clientId = $discordId; clientSecret = $discordSecret } }
if ($twitchSecret) { $o.twitch = [ordered]@{ clientId = $twitchId; clientSecret = $twitchSecret } }
[IO.File]::WriteAllText($Path, ($o | ConvertTo-Json), (New-Object Text.UTF8Encoding $false))
Write-Host "Saved $Path  (Discord: $([bool]$discordSecret), Twitch: $([bool]$twitchSecret)). Sign-in buttons appear within a minute."
