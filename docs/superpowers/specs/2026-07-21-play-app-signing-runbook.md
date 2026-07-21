# Play App Signing Runbook — MadamGy

## Upload keystore
Generated 2026-07-21 via `keytool -genkeypair ... -keystore madamgy-upload-key.jks -alias madamgy-upload -keyalg RSA -keysize 2048 -validity 9125`.

Location: <password-manager entry name — e.g. "1Password: MadamGy > Play Upload Keystore" — never a filesystem path or a value>
Alias: madamgy-upload
Key password and store password: stored in the same password manager entry, not here.

## Play App Signing enrollment steps
1. Play Console > your app > Setup > App signing.
2. Choose "Use Play App Signing" (Google-managed) rather than legacy full self-management --
   Google recommends this for new apps and it's the current default flow.
3. Upload the certificate generated from `madamgy-upload-key.jks` when prompted (Play Console
   walks through exporting the public certificate via `keytool -export`).
4. Confirm the SHA-1 and SHA-256 fingerprints shown in Play Console match a local
   `keytool -list -v -keystore madamgy-upload-key.jks` output before trusting the enrollment.

## Who has access
<team member names and their password-manager access — so this isn't a single point of failure if one person leaves>
