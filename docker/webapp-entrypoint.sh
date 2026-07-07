#!/bin/sh
set -e

CERT_FILE="/etc/nginx/ssl/server.crt"
KEY_FILE="/etc/nginx/ssl/server.key"
NGINX_CONF="/etc/nginx/conf.d/default.conf"

if [ -n "${RAVENS_SERVER_PASSWORD:-}" ]; then
    echo "==> RAVENS_SERVER_PASSWORD set, enabling basic auth..."
    AUTH_USER="${RAVENS_SERVER_USERNAME:-ravens}"
    printf '%s:%s\n' "$AUTH_USER" "$(openssl passwd -apr1 "$RAVENS_SERVER_PASSWORD")" > /etc/nginx/.htpasswd
    chmod 600 /etc/nginx/.htpasswd
    sed -i 's|# auth_basic |auth_basic |' "$NGINX_CONF"
    sed -i 's|# auth_basic_user_file |auth_basic_user_file |' "$NGINX_CONF"
else
    echo "==> WARNING: RAVENS_SERVER_PASSWORD not set — no client auth. Do not expose this port publicly."
fi

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
