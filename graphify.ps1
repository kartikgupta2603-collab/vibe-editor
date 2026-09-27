# Use the repository environment instead of a stale globally installed launcher.
$taskPython = Join-Path $PSScriptRoot '.venv/Scripts/python.exe'
if (-not (Test-Path -LiteralPath $taskPython)) {
    throw 'Create .venv and install requirements-dev.txt before running Graphify.'
}
& $taskPython -m graphify @args
exit $LASTEXITCODE
