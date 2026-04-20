"""
Crawl4AI 网页爬取 — Modal Function（结构与 modal/cpu/ffmpeg.py 对齐）
使用 Crawl4AI 官方 Docker 镜像。

勿命名为 crawl4ai.py：会与 PyPI 包 crawl4ai 同名，导致 from crawl4ai import 解析到本文件。
部署: modal deploy crawl4ai_app.py
"""

import asyncio
import json
import logging
import os
import time
from typing import Any, Dict, Optional

import modal

# Modal 镜像：Crawl4AI 官方镜像 + Redis 客户端（任务通知）
image = modal.Image.from_registry("unclecode/crawl4ai:0.7.7").pip_install("redis")

app = modal.App("crawl4ai", image=image)
secrets = modal.Secret.from_name("OPENAPI")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger(__name__)

with image.imports():
    from crawl4ai import AsyncWebCrawler


def _maybe_fix_utf8_misdecode(text: str) -> str:
    """
    修复「UTF-8 网页被按 latin-1/cp1252 解码」导致的 mojibake（如 æœå¡ → 服务）。
    若原文已是正确 Unicode，encode 会失败，原样返回。
    多种尝试中取 CJK 字符最多的一种，避免误伤纯英文。
    """
    if not text:
        return text

    def cjk_count(s: str) -> int:
        return sum(1 for c in s if "\u4e00" <= c <= "\u9fff")

    best = text
    best_n = cjk_count(text)
    for enc in ("latin-1", "cp1252"):
        try:
            fixed = text.encode(enc).decode("utf-8")
        except (UnicodeEncodeError, UnicodeDecodeError, LookupError):
            continue
        n = cjk_count(fixed)
        if n > best_n:
            best = fixed
            best_n = n
    return best


# ========== Modal 函数 ==========
@app.function(cpu=2.0, memory=4096, timeout=600, secrets=[secrets])
def crawl(task: Dict[str, Any]) -> Dict[str, Any]:
    """网页爬取。task: { taskId, prompt: { url } }。"""
    notifier = None
    try:
        notifier = RedisNotifier()
        task_id = task["taskId"]
        prompt = task["prompt"]

        notifier.notify(task_id, "PROCESSING")

        url = prompt.get("url")
        if not url:
            error_result = {
                "success": False,
                "status": "error",
                "error": "missing url in prompt",
            }
            notifier.notify(task_id, "ERROR", error_result)
            return error_result

        logger.info(f"[{task_id}] crawl start: {url}")

        async def _arun():
            async with AsyncWebCrawler() as crawler:
                return await crawler.arun(url=url)

        result = asyncio.run(_arun())

        success = bool(result.success)
        error_message = str(result.error_message) if result.error_message else None
        markdown_content = str(result.markdown) if result.markdown else ""
        markdown_content = _maybe_fix_utf8_misdecode(markdown_content)

        if not success:
            error_msg = f"爬取失败: {error_message}"
            logger.error(f"[{task_id}] {error_msg}")
            error_result = {"success": False, "status": "error", "error": error_msg}
            notifier.notify(task_id, "ERROR", error_result)
            return error_result

        response_data = {
            "success": True,
            "url": str(url),
            "markdown": markdown_content,
            "content_length": len(markdown_content),
        }
        logger.info(
            f"[{task_id}] crawl ok: {url} len={response_data['content_length']}"
        )
        notifier.notify(
            task_id,
            "COMPLETED",
            {
                "url": str(url),
                "content_length": response_data["content_length"],
            },
        )
        return response_data

    except Exception as e:
        logger.error(f"crawl failed: {e}", exc_info=True)
        error_result = {"success": False, "status": "error", "error": str(e)}
        if notifier:
            try:
                notifier.notify(task["taskId"], "ERROR", error_result)
            except Exception:
                pass
        return error_result
    finally:
        if notifier:
            notifier.close()


import redis
import traceback


class RedisNotifier:
    """Redis task notification helper using synchronous Redis client."""

    def __init__(self, redis_url: Optional[str] = None):
        self.redis_url = redis_url or os.getenv("REDIS_URL", "redis://localhost:6379")
        self.redis_client = None

        try:
            self.redis_client = redis.from_url(self.redis_url)
            self.redis_client.ping()
            logger.info("Redis connection OK")
        except Exception as e:
            logger.warning(f"Redis connect failed: {e}")
            self.redis_client = None

    def notify(self, task_id: str, status: str, data: Optional[Dict[str, Any]] = None):
        """Publish task notification to Redis."""
        if not self.redis_client:
            logger.warning("Redis client not connected, skipping notify")
            return
        try:
            payload = json.dumps(
                {
                    "id": task_id,
                    "status": status,
                    "data": data or {},
                    "timestamp": time.time(),
                },
                ensure_ascii=False,
            )
            self.redis_client.publish(f"task:{task_id}", payload)
            logger.info(f"Published task:{task_id} status={status}")
        except Exception as e:
            logger.warning(f"Redis notify failed: {e}")
            traceback.print_exc()

    def close(self):
        if self.redis_client:
            try:
                self.redis_client.close()
            except Exception:
                pass


# ========== 本地入口 ==========
@app.local_entrypoint()
def main():
    test_task = {
        "taskId": "test-crawl-001",
        "prompt": {
            "url": "https://mp.weixin.qq.com/s?src=11&timestamp=1763454963&ver=6365&signature=Rxjk0OdxNVZZcdQjrBCSbFIwxcDHpH7fW94hVuEfyPNHUYuDwmaYa6E2CDyA2BgFueqEBtkHnPcLLHAMw6oP349yAU*6drjl7gJfCxYPJge8vWHUTcczZBKd8A7sv9KD&new=1",
        },
    }
    logger.info("local test crawl...")
    result = crawl.remote(test_task)
    logger.info(f"result: {json.dumps(result, indent=2, ensure_ascii=False)}")
