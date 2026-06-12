#!/bin/sh
set -e

CERT_FILE="/etc/nginx/ssl/server.crt"
KEY_FILE="/etc/nginx/ssl/server.key"
NGINX_CONF="/etc/nginx/conf.d/default.conf"

if [ -f "$CERT_FILE" ] && [ -f "$KEY_FILE" ]; then
    echo "==> SSL certificate found, enabling HTTPS..."
    sed -i 's/# listen 443 ssl;/listen 443 ssl;/' "$NGINX_CONF"
    sed -i 's|# ssl_certificate .*|ssl_certificate '"$CERT_FILE"';|' "$NGINX_CONF"
    sed -i 's|# ssl_certificate_key .*|ssl_certificate_key '"$KEY_FILE"';|' "$NGINX_CONF"
    sed -i 's/# if ($scheme = http)/if ($scheme = http)/' "$NGINX_CONF"
    sed -i 's|#     return 301|    return 301|' "$NGINX_CONF"
    echo "==> HTTPS enabled."
else
    echo "==> No SSL certificate found, running HTTP only."
fi

echo "==> Starting nginx..."
exec nginx -g "daemon off;"
