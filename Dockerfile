# 默认用官方 python:3.12-slim（Render 可直连 Docker Hub）。
# 国内本地构建时通过 --build-arg 传入镜像源，例如：
#   docker build --build-arg PYTHON_BASE_IMAGE=docker.m.daocloud.io/library/python:3.12-slim -t soulwalking:test .
ARG PYTHON_BASE_IMAGE=python:3.12-slim
FROM ${PYTHON_BASE_IMAGE}

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# 先拷贝依赖清单与应用源码（种子数据在 app/data/ 内，会一并打入镜像）
COPY pyproject.toml README.md ./
COPY app ./app
COPY web ./web

RUN pip install .

# 运行时数据目录（SQLite / Chroma，Render 免费档为临时盘）
RUN mkdir -p /app/data

EXPOSE 10000

# Render 通过 $PORT 注入端口（免费档默认 10000），本地跑也回退到 10000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-10000}"]
