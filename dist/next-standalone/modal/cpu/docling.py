"""
Docling 文件解析模块 - Modal Function
使用 Modal 部署的无服务器文档解析服务
直接使用 Docling 官方 Docker 镜像
"""

import modal
import logging
import json
import time
import os
import uuid
import tempfile
from pathlib import Path
from typing import Optional, Dict, Any

# 构建 Docker 镜像，包含 Docling 及预下载的模型
image = (
    modal.Image.from_registry("python:3.11-slim")
    # 安装 OpenCV 和其他系统依赖
    .apt_install(
        "libgl1",           # OpenGL library for cv2
        "libglib2.0-0",     # GLib library
        "libsm6",           # Session Management library
        "libxext6",         # X11 extensions
        "libxrender1",      # X Rendering Extension
        "libgomp1",         # GNU OpenMP library
        "libglu1-mesa"      # OpenGL utility library
    )
    .pip_install(
        "docling",
        "redis",
        "pdf2image",
        "pillow",
        "boto3"
    )
    # 使用 docling-tools 预下载所有模型
    # 这样可以避免首次运行时的长时间等待
    .run_commands(
        "docling-tools models download"
    )
)

app = modal.App("docling", image=image)
secrets = modal.Secret.from_name("OPENAPI")

# 在 Modal 环境中提前导入，避免序列化问题
with image.imports():
    from docling.document_converter import DocumentConverter
    import boto3
    from botocore.config import Config
    import redis

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger(__name__)


# =========================
# R2 客户端
# =========================
class R2Client:
    """R2 (S3-compatible) client wrapper for Cloudflare R2."""

    def __init__(self):
        """Initialize the R2 client with configuration from environment variables."""
        self.region = os.getenv("R2_REGION", "auto")
        self.bucket = os.getenv("R2_BUCKET")
        self.access_key_id = os.getenv("R2_ACCESS_KEY_ID")
        self.secret_access_key = os.getenv("R2_SECRET_ACCESS_KEY")
        self.endpoint = os.getenv("R2_ENDPOINT")

        if not self.bucket:
            raise RuntimeError("R2_BUCKET is not set")

        config = Config(region_name=self.region)
        self.client = boto3.client(
            's3',
            endpoint_url=self.endpoint,
            aws_access_key_id=self.access_key_id,
            aws_secret_access_key=self.secret_access_key,
            config=config,
        )
        logger.info(f"R2 client initialized for bucket={self.bucket}")

    def upload_file(self, local_path: str, dest_key: str = None) -> str:
        """Upload a local file to R2.
        
        Args:
            local_path: The local file path to upload.
            dest_key: The destination key in R2. If None, generates a UUID-based key.
        
        Returns:
            The destination key where the file was uploaded.
        """
        try:
            if dest_key is None:
                dest_key = f"{uuid.uuid4().hex}_{os.path.basename(local_path)}"
            self.client.upload_file(local_path, self.bucket, dest_key)
            logger.info(f"Uploaded {local_path} to {dest_key}")
            return dest_key
        except Exception as e:
            logger.error(f"Failed to upload {local_path} to bucket {self.bucket}: {e}")
            raise

    def download_file(self, r2_key: str, local_path: str) -> str:
        """Download a file from R2 to local path.
        
        Args:
            r2_key: The key of the file in R2.
            local_path: The local file path to save to.
        
        Returns:
            The local path where the file was downloaded.
        """
        try:
            self.client.download_file(self.bucket, r2_key, local_path)
            logger.info(f"Downloaded {r2_key} to {local_path}")
            return local_path
        except Exception as e:
            logger.error(f"Failed to download {r2_key} from bucket {self.bucket}: {e}")
            raise


# =========================
# Redis 通知器
# =========================

class RedisNotifier:
    """Redis task notification helper using synchronous Redis client."""

    def __init__(self, redis_url: str = None):
        self.redis_url = redis_url or os.getenv("REDIS_URL", "redis://localhost:6379")
        self.redis_client = None
        
        try:
            self.redis_client = redis.from_url(self.redis_url)
            # test connection with PING
            self.redis_client.ping()
            logger.info("Redis connection OK")
        except Exception as e:
            logger.warning(f"Redis connect failed: {e}")
            self.redis_client = None

    def notify(self, task_id: str, status: str, data: dict = None):
        """Publish task notification to Redis."""
        if not self.redis_client:
            logger.warning("Redis client not connected, skipping notify")
            return
        try:
            payload = json.dumps({
                "id": task_id,
                "status": status,
                "data": data or {},
                "timestamp": time.time()
            }, ensure_ascii=False)
            self.redis_client.publish(f"task:{task_id}", payload)
            logger.info(f"Published task:{task_id} status={status}")
        except Exception as e:
            logger.warning(f"Redis notify failed: {e}")

    def close(self):
        """Close Redis connection."""
        if self.redis_client:
            try:
                self.redis_client.close()
            except Exception:
                pass


# =========================
# Modal 函数
# =========================
@app.function(cpu=2.0, memory=4096, timeout=600, secrets=[secrets])
def parse_document(task: dict) -> dict:
    """
    Modal 函数: 文档解析
    
    Args:
        task: 任务字典，包含以下字段：
            - taskId: 任务ID
            - prompt: 提示信息字典
                - source: 要解析的文档来源（本地路径或URL）
    
    Returns:
        解析结果字典
    """
    notifier = RedisNotifier()
    r2_client = None
    
    task_id = task.get("taskId")
    prompt = task.get("prompt", {})
    source = prompt.get("source")
    
    try:
        if not source:
            raise ValueError("source 参数不能为空")
        
        logger.info(f"[{task_id}] 开始解析文档: {source}")
        
        # 通知任务开始
        notifier.notify(task_id, "PROCESSING", {"message": f"正在解析文档: {source}"})
        
        # 初始化 R2 客户端
        r2_client = R2Client()
        
        # 创建临时目录用于下载、解析和上传文件
        with tempfile.TemporaryDirectory() as tmpdir:
            # 从 R2 下载文件到本地
            filename = os.path.basename(source)
            local_file_path = os.path.join(tmpdir, filename)
            r2_client.download_file(source, local_file_path)
            logger.info(f"[{task_id}] 已从 R2 下载文件到: {local_file_path}")
            
            # 初始化转换器，使用默认模型配置
            converter = DocumentConverter()
            
            # 执行解析（使用本地文件路径）
            result = converter.convert(local_file_path)
            
            if not result:
                error_msg = "文档解析失败：返回结果为空"
                logger.error(f"[{task_id}] {error_msg}")
                notifier.notify(task_id, "FAILED", {"error": error_msg})
                return {"success": False, "error": error_msg}
            
            # 提取文档内容
            doc = result.document
            
            # 导出为 markdown
            content = doc.export_to_markdown()
            content_str = str(content)
            
            logger.info(f"[{task_id}] 解析成功: {source} - 内容长度: {len(content_str)}")
            
            # 创建临时 md 文件
            md_filename = f"{uuid.uuid4().hex}.md"
            local_md_path = Path(tmpdir) / md_filename
            
            # 写入 markdown 内容
            with open(local_md_path, 'w', encoding='utf-8') as f:
                f.write(content_str)
            
            logger.info(f"[{task_id}] 已保存 markdown 到临时文件: {local_md_path}")
            
            # 上传到 R2
            r2_key = f"tasks/{task_id}/{uuid.uuid4().hex}.md"
            r2_client.upload_file(str(local_md_path), r2_key)
            logger.info(f"[{task_id}] 已上传到 R2: {r2_key}")
        
        # 构建响应数据
        response_data = {
            "success": True,
            "source": str(source),
            "r2_key": r2_key,
            "content_length": len(content_str),
            "page_count": len(doc.pages) if hasattr(doc, "pages") else 0,
        }
        
        # 通知任务完成 - 只返回 r2_key
        notifier.notify(task_id, "COMPLETED", {
            "r2_key": r2_key,
            "content_length": len(content_str),
            "page_count": response_data['page_count']
        })
        
        return response_data
            
    except Exception as e:
        error_msg = f"文档解析出错: {str(e)}"
        logger.error(f"[{task_id}] {error_msg}", exc_info=True)
        notifier.notify(task_id, "FAILED", {"error": error_msg})
        return {"success": False, "error": error_msg}
    finally:
        notifier.close()


# =========================
# 本地测试入口
# =========================
@app.local_entrypoint()
def main():
    """本地测试入口"""
    # 模型已在镜像构建时预下载，直接进行文档解析测试
    logger.info("=" * 50)
    logger.info("Docling 文档解析测试")
    logger.info("=" * 50)
    
    test_task = {
        "taskId": "test-docling-001",
        "prompt": {
            "source": "https://pub-7e64b12f5e4f4331ad17dc7a012fe717.r2.dev/L43mqVtjzKHuzeyYBYUK8.pdf",  # Docling Technical Report
        }
    }
    
    logger.info("开始测试文档解析...")
    result = parse_document.remote(test_task)
    
    # 显示结果摘要
    if result.get("success"):
        logger.info(f"测试成功! R2 Key: {result.get('r2_key')}")
        logger.info(f"内容长度: {result.get('content_length')} 字符")
        logger.info(f"页数: {result.get('page_count')}")
    else:
        logger.error(f"测试失败: {json.dumps(result, indent=2, ensure_ascii=False)}")
