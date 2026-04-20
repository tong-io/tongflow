"""
whisper.cpp 语音转文字模块 - Modal Function
使用 Modal 部署的无服务器语音转文字服务，基于 whisper.cpp
"""

import modal
import logging
import json
import time
import os
import sys
from typing import Optional

# 定义镜像
# 我们需要安装 build-essential 和 cmake 来编译 whisper.cpp 的绑定
# 使用 pywhispercpp 作为 Python 绑定
# 定义镜像
# 我们需要安装 build-essential 和 cmake 来编译 whisper.cpp 的绑定
# 以及 FFmpeg 开发库以支持 WHISPER_FFMPEG
image = modal.Image.debian_slim(python_version="3.11").apt_install(
    "git", "build-essential", "cmake", "ffmpeg", "wget", "pkg-config",
    "libavcodec-dev", "libavformat-dev", "libavutil-dev"
).run_commands(
    "git clone --recursive https://github.com/abdeladim-s/pywhispercpp.git /root/pywhispercpp",
    "cd /root/pywhispercpp && WHISPER_FFMPEG=1 pip install ."
).pip_install(
    "redis",
    "requests"
)

app = modal.App("whisper", image=image)
secrets = modal.Secret.from_name("OPENAPI")

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger(__name__)


# =========================
# Redis 通知器 (复用 crawl4ai 的模式)
# =========================
import redis

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

# 定义模型缓存目录
MODEL_DIR = "/root/models"
# 使用 Modal Volume 来持久化存储模型，避免每次都下载
model_volume = modal.Volume.from_name("whisper-models", create_if_missing=True)

@app.function(
    cpu=4.0,  # 分配更多 CPU 核心以加速推理
    memory=4096, 
    timeout=600, 
    secrets=[secrets],
    volumes={MODEL_DIR: model_volume}
)
def transcribe(task: dict) -> dict:
    """
    Modal 函数: 语音转文字 (Whisper.cpp)
    
    Args:
        task: 任务字典，包含以下字段：
            - taskId: 任务ID
            - prompt: 提示信息字典
                - video 或 audio: 音频或视频文件的 URL (两个参数任选其一)
                - model: 模型名称 (可选, 默认 base, 可选: tiny, base, small, medium, large)
                - language: 语言代码 (可选, 默认 auto)
    
    Returns:
        转录结果字典
    """
    # 在函数内部导入，确保在容器中运行
    from pywhispercpp.model import Model
    import requests
    
    notifier = RedisNotifier()
    
    task_id = task.get("taskId")
    prompt = task.get("prompt", {})
    # 兼容 video 和 audio 两种参数名
    media_url = prompt.get("video") or prompt.get("audio")
    model_name = prompt.get("model", "base")
    language = prompt.get("language", "auto")
    
    if not media_url:
        return {"success": False, "error": "Missing media URL (provide 'video' or 'audio' parameter)"}

    try:
        logger.info(f"[{task_id}] 开始处理媒体文件: {media_url}, 模型: {model_name}")
        notifier.notify(task_id, "PROCESSING", {"message": "正在下载媒体文件..."})
        
        # 1. 下载媒体文件 (音频或视频)
        # 由于启用了 WHISPER_FFMPEG，我们可以直接将下载的文件传给 whisper.cpp
        # 它会自动处理格式转换和重采样
        local_media_path = f"/tmp/{task_id}_media"
        
        response = requests.get(media_url, stream=True)
        response.raise_for_status()
        with open(local_media_path, "wb") as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
                
        # 2. 加载模型
        notifier.notify(task_id, "PROCESSING", {"message": f"正在加载模型 {model_name}..."})
        
        model = Model(model_name, models_dir=MODEL_DIR, n_threads=4)
        
        # 3. 执行转录
        notifier.notify(task_id, "PROCESSING", {"message": "正在转录..."})
        
        # 直接传入媒体文件路径
        segments = model.transcribe(local_media_path, language=language)
        
        # 4. 整理结果 - 加上分隔标点符号
        full_text = "，".join([segment.text for segment in segments])
        
        result_data = {
            "success": True,
            "text": full_text,
            "segments": [
                {
                    "start": segment.t0,
                    "end": segment.t1,
                    "text": segment.text
                } for segment in segments
            ],
            "language": language,
            "model": model_name
        }
        
        logger.info(f"[{task_id}] 转录成功: {len(full_text)} 字符")
        notifier.notify(task_id, "COMPLETED", result_data)
        
        # 清理临时文件
        if os.path.exists(local_media_path):
            os.remove(local_media_path)
            
        return result_data

    except Exception as e:
        error_msg = f"转录出错: {str(e)}"
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
    # 使用一个公开的简短视频用于测试 (Big Buck Bunny 片段)
    # 或者使用之前的音频: "https://www2.cs.uic.edu/~i101/SoundFiles/BabyElephantWalk60.wav"
    test_media_url = "https://file.tongflow.com/3f608ffbf2194f6a892ece18dbbcb69f.mp4"
    
    test_task = {
        "taskId": "test-whisper-video-001",
        "prompt": {
            "url": test_media_url,
            "model": "tiny", # 测试用 tiny 模型比较快
        }
    }
    
    logger.info("开始测试语音/视频转文字...")
    # 注意：首次运行会下载模型，可能需要一些时间
    result = transcribe.remote(test_task)
    logger.info(f"测试结果: {json.dumps(result, indent=2, ensure_ascii=False)}")
