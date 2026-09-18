FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html fonts.css manifest.webmanifest sw.js /usr/share/nginx/html/
COPY fonts/ /usr/share/nginx/html/fonts/
COPY icons/ /usr/share/nginx/html/icons/
