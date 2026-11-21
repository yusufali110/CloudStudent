FROM nginx:1.25-alpine

# Remove default nginx static assets and configuration
RUN rm -rf /usr/share/nginx/html/* /etc/nginx/conf.d/default.conf

# Copy custom NGINX configuration
COPY nginx.conf /etc/nginx/nginx.conf

# Copy static frontend web assets
COPY index.html style.css app.js /usr/share/nginx/html/

EXPOSE 80

# Health check to ensure NGINX is responding
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:80/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
