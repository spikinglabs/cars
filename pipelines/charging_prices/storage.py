"""Where snapshots go: a local folder (for tests and dry runs) or Cloudflare R2."""

from __future__ import annotations

import os
from pathlib import Path


class LocalStore:
    def __init__(self, root: str | Path):
        self.root = Path(root)

    def put(self, key: str, data: bytes, content_type: str = "application/octet-stream") -> None:
        path = self.root / key
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    def get(self, key: str) -> bytes | None:
        path = self.root / key
        return path.read_bytes() if path.exists() else None

    def exists(self, key: str) -> bool:
        return (self.root / key).exists()

    def total_bytes(self, prefix: str = "") -> tuple[int, int]:
        files = [f for f in (self.root / prefix).rglob("*") if f.is_file()] if (self.root / prefix).exists() else []
        return sum(f.stat().st_size for f in files), len(files)

    def list_keys(self, prefix: str = "") -> list[str]:
        base = self.root / prefix
        if not base.exists():
            return []
        return sorted(f.relative_to(self.root).as_posix() for f in base.rglob("*") if f.is_file())

    def delete(self, keys: list[str]) -> None:
        for key in keys:
            (self.root / key).unlink(missing_ok=True)

    def __str__(self) -> str:
        return f"local:{self.root}"


class R2Store:
    """Cloudflare R2 through its S3-compatible API.

    Needs R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY in the environment.
    """

    def __init__(self, bucket: str):
        import boto3  # only needed in CI

        self.bucket = bucket
        self.client = boto3.client(
            "s3",
            endpoint_url=f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com",
            aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
            aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
            region_name="auto",
        )

    def put(self, key: str, data: bytes, content_type: str = "application/octet-stream") -> None:
        extra = {"ContentType": content_type}
        if key.endswith(".gz"):
            extra["ContentEncoding"] = "gzip"
        self.client.put_object(Bucket=self.bucket, Key=key, Body=data, **extra)

    def get(self, key: str) -> bytes | None:
        try:
            return self.client.get_object(Bucket=self.bucket, Key=key)["Body"].read()
        except self.client.exceptions.NoSuchKey:
            return None

    def exists(self, key: str) -> bool:
        from botocore.exceptions import ClientError

        try:
            self.client.head_object(Bucket=self.bucket, Key=key)
            return True
        except ClientError as exc:
            if exc.response.get("Error", {}).get("Code") in ("404", "NoSuchKey", "NotFound"):
                return False
            raise

    def total_bytes(self, prefix: str = "") -> tuple[int, int]:
        size = count = 0
        for page in self.client.get_paginator("list_objects_v2").paginate(Bucket=self.bucket, Prefix=prefix):
            for obj in page.get("Contents", []):
                size += obj["Size"]
                count += 1
        return size, count

    def list_keys(self, prefix: str = "") -> list[str]:
        keys = []
        for page in self.client.get_paginator("list_objects_v2").paginate(Bucket=self.bucket, Prefix=prefix):
            keys.extend(obj["Key"] for obj in page.get("Contents", []))
        return sorted(keys)

    def delete(self, keys: list[str]) -> None:
        for i in range(0, len(keys), 1000):
            batch = [{"Key": k} for k in keys[i : i + 1000]]
            self.client.delete_objects(Bucket=self.bucket, Delete={"Objects": batch, "Quiet": True})

    def __str__(self) -> str:
        return f"r2:{self.bucket}"


class PrefixedStore:
    """Puts every key under one top-level folder of a shared bucket."""

    def __init__(self, inner, prefix: str):
        self.inner = inner
        self.prefix = prefix.strip("/") + "/"

    def put(self, key: str, data: bytes, content_type: str = "application/octet-stream") -> None:
        self.inner.put(self.prefix + key, data, content_type)

    def get(self, key: str) -> bytes | None:
        return self.inner.get(self.prefix + key)

    def exists(self, key: str) -> bool:
        return self.inner.exists(self.prefix + key)

    def total_bytes(self, prefix: str = "") -> tuple[int, int]:
        # Free-tier limits apply to the whole bucket, so measure all of it.
        return self.inner.total_bytes(prefix)

    def list_keys(self, prefix: str = "") -> list[str]:
        n = len(self.prefix)
        return [k[n:] for k in self.inner.list_keys(self.prefix + prefix)]

    def delete(self, keys: list[str]) -> None:
        self.inner.delete([self.prefix + k for k in keys])

    def __str__(self) -> str:
        return f"{self.inner}/{self.prefix}"
