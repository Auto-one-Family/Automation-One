@echo off
set WOKWI_CLI_TOKEN=wok_F9PGu0KSKMTupAZUUzEf6vFHyenjcYI420b4b725
cd /d "c:\Users\PCUser\Documents\PlatformIO\Projects\Auto-one\El Trabajante"
echo Starting Wokwi CLI...
"C:\Users\PCUser\.wokwi\bin\wokwi-cli.exe" . --timeout 30000
echo Exit code: %ERRORLEVEL%
