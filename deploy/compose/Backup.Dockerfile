FROM restic/restic:0.20.0 AS restic
FROM postgres:18.6-alpine
COPY --from=restic /usr/bin/restic /usr/local/bin/restic
COPY backup.sh /usr/local/bin/backbricks-backup
ENTRYPOINT ["sh", "/usr/local/bin/backbricks-backup"]
CMD ["backup"]
