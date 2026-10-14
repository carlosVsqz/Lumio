ARG ODOO_BASE_IMAGE=odoo:19.0
FROM ${ODOO_BASE_IMAGE}
COPY --chown=odoo:odoo addons /mnt/lumio-addons
COPY --chown=odoo:odoo production /opt/lumio
USER root
RUN mkdir -p /var/lib/lumio-integration \
    && chown odoo:11000 /var/lib/lumio-integration \
    && chmod 2750 /var/lib/lumio-integration
USER odoo
ENV ODOO_RC=/tmp/lumio-odoo.conf
ENTRYPOINT ["python3", "/opt/lumio/entrypoint.py"]
CMD ["odoo"]
HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=5 \
  CMD curl --fail --silent --max-time 4 http://127.0.0.1:8069/web/health > /dev/null || exit 1
