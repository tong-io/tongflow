"""
PaddlePaddle OCR 模块 - Modal Function
使用 Modal 部署的无服务器 OCR 和文档解析服务
直接使用 PaddlePaddle 官方 Docker 镜像
"""

import modal
import logging
import json
import time
import os
import subprocess
import tempfile
import urllib.request
from typing import Optional

# 直接使用 PaddlePaddle 官方 Docker 镜像 (已包含 Python 和 PaddlePaddle)
image = modal.Image.from_registry(
    "paddlepaddle/paddle:3.2.0"
).pip_install(
    "redis",
    "paddleocr[all]"
)

app = modal.App("paddle-ocr", image=image)
secrets = modal.Secret.from_name("OPENAPI")

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger(__name__)


# =========================
# Redis 通知器
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
# 辅助函数
# =========================
def download_image(url: str, save_dir: str = None) -> str:
    """下载图像到本地临时文件"""
    if save_dir is None:
        save_dir = tempfile.gettempdir()
    
    # 从 URL 获取文件扩展名
    ext = os.path.splitext(url.split("?")[0])[-1] or ".png"
    local_path = os.path.join(save_dir, f"input_image_{int(time.time())}{ext}")
    
    logger.info(f"下载图像: {url} -> {local_path}")
    urllib.request.urlretrieve(url, local_path)
    
    if not os.path.exists(local_path):
        raise FileNotFoundError(f"下载失败: {local_path}")
    
    file_size = os.path.getsize(local_path)
    logger.info(f"图像下载完成: {local_path}, 大小: {file_size} bytes")
    
    return local_path


# =========================
# PaddleOCR 推理函数
# =========================
def run_paddleocr_ocr(image_path: str, **kwargs) -> dict:
    """运行 PP-OCRv5 推理 - 使用 Python API"""
    try:
        from paddleocr import PaddleOCR
        
        # 初始化 OCR，使用 PP-OCRv5
        # 新版本 PaddleOCR 参数有变化，移除不支持的参数
        ocr = PaddleOCR(
            use_angle_cls=True,
            lang='ch',
            use_gpu=False
        )
        
        # 执行 OCR
        result = ocr.ocr(image_path, cls=True)
        
        if result is None or len(result) == 0:
            return {
                "success": True,
                "model": "PP-OCRv5",
                "output": "",
                "texts": []
            }
        
        # 提取文本结果
        texts = []
        full_text_lines = []
        
        for page_result in result:
            if page_result is None:
                continue
            for line in page_result:
                if line and len(line) >= 2:
                    box = line[0]  # 边界框坐标
                    text_info = line[1]  # (文本, 置信度)
                    text = text_info[0]
                    confidence = text_info[1]
                    texts.append({
                        "text": text,
                        "confidence": round(confidence, 4),
                        "box": box
                    })
                    full_text_lines.append(text)
        
        full_text = "\n".join(full_text_lines)
        
        return {
            "success": True,
            "model": "PP-OCRv5",
            "output": full_text,
            "texts": texts
        }
    except Exception as e:
        logger.error(f"OCR 推理错误: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


def run_paddleocr_structure(image_path: str, **kwargs) -> dict:
    """运行 PP-StructureV3 推理 - 使用 CLI"""
    try:
        cmd = [
            "paddleocr", "pp_structurev3",
            "-i", image_path,
            "--use_doc_orientation_classify", "False",
            "--use_doc_unwarping", "False"
        ]
        
        logger.info(f"执行命令: {' '.join(cmd)}")
        
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=300
        )
        
        # 合并 stdout 和 stderr
        output = result.stdout + result.stderr
        logger.info(f"Structure 命令输出长度: stdout={len(result.stdout)}, stderr={len(result.stderr)}")
        
        if result.returncode != 0:
            return {
                "success": False,
                "error": f"Structure recognition failed: {output}"
            }
        
        return {
            "success": True,
            "model": "PP-StructureV3",
            "output": output
        }
    except Exception as e:
        logger.error(f"Structure 推理错误: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


def run_paddleocr_chatocrv4(image_path: str, query_key: str, qianfan_api_key: str, **kwargs) -> dict:
    """运行 PP-ChatOCRv4 推理 - 使用 CLI"""
    if not qianfan_api_key:
        return {
            "success": False,
            "error": "qianfan_api_key is required for PP-ChatOCRv4"
        }
    
    try:
        cmd = [
            "paddleocr", "pp_chatocrv4_doc",
            "-i", image_path,
            "-k", query_key or "",
            "--qianfan_api_key", qianfan_api_key,
            "--use_doc_orientation_classify", "False",
            "--use_doc_unwarping", "False"
        ]
        
        logger.info(f"执行 ChatOCRv4 命令")
        
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=300
        )
        
        output = result.stdout + result.stderr
        logger.info(f"ChatOCRv4 命令输出长度: stdout={len(result.stdout)}, stderr={len(result.stderr)}")
        
        if result.returncode != 0:
            return {
                "success": False,
                "error": f"ChatOCRv4 failed: {output}"
            }
        
        return {
            "success": True,
            "model": "PP-ChatOCRv4",
            "output": output
        }
    except Exception as e:
        logger.error(f"ChatOCRv4 推理错误: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


def run_paddleocr_vl(image_path: str, **kwargs) -> dict:
    """运行 PaddleOCR-VL 文档解析 - 使用 CLI"""
    try:
        cmd = [
            "paddleocr", "doc_parser",
            "-i", image_path
        ]
        
        logger.info(f"执行命令: {' '.join(cmd)}")
        
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=300
        )
        
        output = result.stdout + result.stderr
        logger.info(f"VL 命令输出长度: stdout={len(result.stdout)}, stderr={len(result.stderr)}")
        
        if result.returncode != 0:
            return {
                "success": False,
                "error": f"Document parsing failed: {output}"
            }
        
        return {
            "success": True,
            "model": "PaddleOCR-VL",
            "output": output
        }
    except Exception as e:
        logger.error(f"VL 推理错误: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


# 推理模式映射表
INFERENCE_MODES = {
    "ocr": run_paddleocr_ocr,
    "structure": run_paddleocr_structure,
    "chatocrv4": run_paddleocr_chatocrv4,
    "vl": run_paddleocr_vl,
}


# =========================
# Modal 函数
# =========================
@app.function(cpu=2.0, memory=4096, timeout=600, secrets=[secrets])
def paddle_infer(task: dict) -> dict:
    """
    Modal 函数: PaddlePaddle OCR 和文档解析推理
    
    Args:
        task: 任务字典，包含以下字段：
            - taskId: 任务ID
            - prompt: 提示信息字典
                - image_url: 图像 URL
                - mode: 推理模式 (ocr, structure, chatocrv4, vl)
                - query_key: 查询关键词 (仅 chatocrv4 模式)
                - qianfan_api_key: 千帆 API Key (仅 chatocrv4 模式)
    
    Returns:
        推理结果字典
    """
    notifier = RedisNotifier()
    
    task_id = task.get("taskId")
    prompt = task.get("prompt", {})
    image_url = prompt.get("image_url")
    mode = prompt.get("mode", "ocr")
    local_image_path = None
    
    try:
        logger.info(f"[{task_id}] 开始推理: 模式={mode}, 图像={image_url}")
        
        # 通知任务开始
        notifier.notify(task_id, "PROCESSING", {
            "message": f"正在进行 {mode} 推理...",
            "mode": mode
        })
        
        # 检查模式是否支持
        if mode not in INFERENCE_MODES:
            error_msg = f"不支持的推理模式: {mode}"
            logger.error(f"[{task_id}] {error_msg}")
            notifier.notify(task_id, "FAILED", {"error": error_msg})
            return {"success": False, "error": error_msg}
        
        # 下载图像到本地
        logger.info(f"[{task_id}] 开始下载图像...")
        local_image_path = download_image(image_url)
        logger.info(f"[{task_id}] 图像下载完成: {local_image_path}")
        
        # 获取推理函数
        infer_func = INFERENCE_MODES[mode]
        
        # 执行推理 - 使用本地路径
        infer_kwargs = {
            "image_path": local_image_path,
            "query_key": prompt.get("query_key"),
            "qianfan_api_key": prompt.get("qianfan_api_key"),
        }
        
        inference_result = infer_func(**infer_kwargs)
        
        if not inference_result.get("success"):
            error_msg = inference_result.get("error", "未知错误")
            logger.error(f"[{task_id}] 推理失败: {error_msg}")
            notifier.notify(task_id, "FAILED", {"error": error_msg})
            return {"success": False, "error": error_msg}
        
        # 构建响应数据 - 只使用基本 Python 类型
        response_data = {
            "success": True,
            "taskId": task_id,
            "mode": mode,
            "image_url": image_url,
            "model": inference_result.get("model"),
            "output": inference_result.get("output"),
            "output_length": len(inference_result.get("output", "")),
        }
        
        # 如果有详细的文本结果，添加到响应中
        if "texts" in inference_result:
            response_data["texts"] = inference_result["texts"]
            response_data["text_count"] = len(inference_result["texts"])
        
        logger.info(f"[{task_id}] 推理成功: 模式={mode} - 输出长度: {response_data['output_length']}")
        
        # 通知任务完成
        notifier.notify(task_id, "COMPLETED", response_data)
        
        return response_data
        
    except Exception as e:
        error_msg = f"推理出错: {str(e)}"
        logger.error(f"[{task_id}] {error_msg}", exc_info=True)
        notifier.notify(task_id, "FAILED", {"error": error_msg})
        return {"success": False, "error": error_msg}
    finally:
        # 清理临时文件
        if local_image_path and os.path.exists(local_image_path):
            try:
                os.remove(local_image_path)
                logger.info(f"[{task_id}] 已清理临时文件: {local_image_path}")
            except Exception as e:
                logger.warning(f"清理临时文件失败: {e}")
        notifier.close()


# =========================
# 本地测试入口
# =========================
@app.local_entrypoint()
def main():
    """本地测试入口"""
    # 测试 OCR 模式
    test_task_ocr = {
        "taskId": "test-paddle-ocr-001",
        "prompt": {
            "image_url": "https://paddle-model-ecology.bj.bcebos.com/paddlex/imgs/demo_image/general_ocr_002.png",
            "mode": "ocr",
        }
    }
    
    logger.info("开始测试 OCR 推理...")
    result = paddle_infer.remote(test_task_ocr)
    logger.info(f"OCR 测试结果: {json.dumps(result, indent=2, ensure_ascii=False)}")
    
    # # 测试 Structure 模式
    # test_task_structure = {
    #     "taskId": "test-paddle-structure-001",
    #     "prompt": {
    #         "image_url": "https://paddle-model-ecology.bj.bcebos.com/paddlex/imgs/demo_image/pp_structure_v3_demo.png",
    #         "mode": "structure",
    #     }
    # }
    
    # logger.info("开始测试 Structure 推理...")
    # result = paddle_infer.remote(test_task_structure)
    # logger.info(f"Structure 测试结果: {json.dumps(result, indent=2, ensure_ascii=False)}")
    
    # # 测试 VL 模式
    # test_task_vl = {
    #     "taskId": "test-paddle-vl-001",
    #     "prompt": {
    #         "image_url": "https://paddle-model-ecology.bj.bcebos.com/paddlex/imgs/demo_image/paddleocr_vl_demo.png",
    #         "mode": "vl",
    #     }
    # }
    
    # logger.info("开始测试 VL 推理...")
    # result = paddle_infer.remote(test_task_vl)
    # logger.info(f"VL 测试结果: {json.dumps(result, indent=2, ensure_ascii=False)}")
