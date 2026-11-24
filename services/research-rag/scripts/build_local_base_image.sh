#!/bin/sh
# ONLY for environments where container registries are blocked (Docker Hub 403) but PyPI, the Ubuntu archive and GitHub
# releases are reachable. Assembles a LOCAL stand-in for python:3.13-slim (Ubuntu 24.04 minbase + python-build-standalone 3.13)
# and tags it local/python:3.13-ubuntu-noble. It is NOT the official image: build with the official one wherever possible.
#   sh scripts/build_local_base_image.sh [CA_BUNDLE_FILE]   (CA file only if a TLS-inspecting proxy needs it)
#   docker build --network=host --build-arg BASE_IMAGE=local/python:3.13-ubuntu-noble \
#                --build-arg HTTPS_PROXY="$HTTPS_PROXY" -t sadat-rag:local-base .
set -eu
R=${ROOTFS:-/tmp/rootfs}
UV_PYTHON_INSTALL_DIR=/tmp/uvpy uv python install 3.13
rm -rf "$R"
debootstrap --variant=minbase --components=main,universe --include=ca-certificates,passwd,curl noble "$R" http://archive.ubuntu.com/ubuntu
cp -r /tmp/uvpy/cpython-3.13*-linux-x86_64-gnu "$R/opt/python"
rm -f "$R"/opt/python/lib/python3.13/EXTERNALLY-MANAGED
ENVCA=""
if [ "${1:-}" ]; then cp "$1" "$R/etc/ssl/certs/local-ca.crt"; ENVCA="-c ENV PIP_CERT=/etc/ssl/certs/local-ca.crt"; fi
(cd "$R" && tar -c .) | docker import -c 'ENV PATH=/opt/python/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin' $ENVCA -c 'CMD ["/bin/bash"]' - local/python:3.13-ubuntu-noble
