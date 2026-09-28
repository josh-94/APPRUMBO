FROM python:3.12-slim
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends wget ca-certificates tzdata \
    && rm -rf /var/lib/apt/lists/* \
    && adduser --disabled-password --gecos "" --uid 65532 app
COPY apps/api-py/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY apps/api-py /app
RUN pip install --no-cache-dir pytest \
    && pytest -q \
    && pip uninstall -y pytest
USER app
EXPOSE 8080
ENTRYPOINT ["python", "-m", "hoy"]
