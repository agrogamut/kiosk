#!/usr/bin/env fish
# Generates a real .env from .env.example with random JWT secrets filled in.
# Refuses to overwrite an existing .env.

if test -f .env
    echo ".env already exists — refusing to overwrite. Delete it first if you want to regenerate."
    exit 1
end

set access_secret (openssl rand -hex 32)
set refresh_secret (openssl rand -hex 32)

cp .env.example .env
sed -i "s#^JWT_ACCESS_SECRET=.*#JWT_ACCESS_SECRET=$access_secret#" .env
sed -i "s#^JWT_REFRESH_SECRET=.*#JWT_REFRESH_SECRET=$refresh_secret#" .env

echo "Generated .env with real JWT secrets."
echo "Fill in MINIO_*, LIVEKIT_*, MSG91_*, RAZORPAY_*, ADMIN_PASSWORD manually before deploying."
