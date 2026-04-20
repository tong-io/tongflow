"""Modal CPU：PySceneDetect（pip: scenedetect[opencv]）场景检测与切片。文件名为 pyscenedetect.py，避免与包名 scenedetect 同名导致 import 指向本文件。"""

import base64
import modal
import logging
import time
from pathlib import Path
import boto3
from botocore.config import Config
import os
import tempfile
import uuid
import subprocess
import json
import shutil
import bisect
from typing import List, Tuple, Optional

# Modal 镜像配置
image = (
    modal.Image.debian_slim(python_version="3.13")
        .apt_install('ffmpeg')
        .uv_pip_install('scenedetect[opencv]', 'boto3', 'redis')
)
app = modal.App("scenedetect", image=image)
secrets = modal.Secret.from_name("OPENAPI")

# 日志配置
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger(__name__)

# =========================
# 工具函数：ffmpeg/ffprobe 可用性
# =========================
def _ensure_ff_tools():
    for bin_name in ("ffmpeg", "ffprobe"):
        if shutil.which(bin_name) is None:
            raise RuntimeError(
                f"未找到 `{bin_name}` 可执行文件，请在运行环境中安装 ffmpeg 工具集。"
            )
    logger.info("检测到 ffmpeg/ffprobe 可用。")

# =========================
# 工具函数：关键帧处理
# =========================
def _get_keyframes_seconds(video_path: Path) -> List[float]:
    """用 ffprobe 抽取关键帧时间戳（秒）。"""
    cmd = [
        "ffprobe", "-v", "error",
        "-select_streams", "v:0",
        "-show_frames",
        "-show_entries", "frame=key_frame,pkt_pts_time,best_effort_timestamp_time",
        "-of", "json",
        str(video_path)
    ]
    out = subprocess.check_output(cmd)
    data = json.loads(out)
    kfs: List[float] = []
    for f in data.get("frames", []):
        try:
            if int(f.get("key_frame", 0)) == 1:
                t_str = f.get("pkt_pts_time", f.get("best_effort_timestamp_time", None))
                if t_str is not None:
                    t = float(t_str)
                    if t >= 0:
                        kfs.append(t)
        except Exception:
            continue
    kfs = sorted(set(kfs))
    if not kfs or kfs[0] > 0.0005:
        kfs = [0.0] + kfs
    return kfs

def _snap_to_prev_kf(t: float, keyframes: List[float]) -> float:
    """对齐到不大于 t 的最近关键帧。"""
    i = bisect.bisect_right(keyframes, t)
    return keyframes[max(0, i - 1)]

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

    def download_file(self, key: str, local_path: str):
        """Download an object from R2 to a local path (blocking).
        
        Args:
            key: The key of the object in R2.
            local_path: The local file path to save to.
        """
        try:
            self.client.download_file(self.bucket, key, local_path)
            logger.info(f"Downloaded {key} to {local_path}")
        except Exception as e:
            logger.error(f"Failed to download {key} from bucket {self.bucket}: {e}")
            raise

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

# =========================
# Redis 通知器
# =========================
import json
import time
import traceback
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
            traceback.print_exc()

    def close(self):
        """Close Redis connection."""
        if self.redis_client:
            try:
                self.redis_client.close()
            except Exception:
                pass

# =========================
# 与 ffmpeg.py 一致：解析 Modal 传入的 bytes / base64
# =========================
def _normalize_modal_bytes(val) -> bytes:
    if val is None:
        raise ValueError("empty bytes")
    if isinstance(val, (bytes, bytearray)):
        return bytes(val)
    if isinstance(val, str):
        return base64.b64decode(val)
    return bytes(val)


# =========================
# Modal 函数
# =========================
@app.function(cpu=1.0, memory=2048, timeout=3600, secrets=[secrets])
def split_video(task: dict) -> dict:
    """场景检测与切分：优先 prompt.video_bytes（OpenFlow 与 ffmpeg 一致），否则 R2 fileKey。"""
    notifier = RedisNotifier()
    task_id = None
    try:
        task_id = task.get("taskId") or task.get("task_id")
        if not task_id:
            raise ValueError("missing taskId / task_id")

        prompt = task["prompt"]
        threshold = prompt.get("threshold", 30.0)

        notifier.notify(task_id, "PROCESSING")

        with tempfile.TemporaryDirectory() as tmpdir:
            tmpdir_path = Path(tmpdir)
            vb = prompt.get("video_bytes")
            file_key_ref = prompt.get("fileKey") or ""

            if vb is not None:
                data = _normalize_modal_bytes(vb)
                name = prompt.get("video_filename") or "input.mp4"
                local_video_path = tmpdir_path / Path(str(name)).name
                local_video_path.write_bytes(data)
                logger.info(
                    f"已写入输入视频 ({len(data)} bytes)，场景检测阈值: {threshold}"
                )
                split_files = detect_and_split_keyframe_aligned(local_video_path)
                outputs = []
                for p in split_files:
                    pth = Path(p)
                    ext = pth.suffix.lstrip(".") or "mp4"
                    outputs.append(
                        {"output_bytes": pth.read_bytes(), "output_ext": ext}
                    )
                result = {
                    "success": True,
                    "outputs": outputs,
                    "original_key": file_key_ref,
                    "count": len(outputs),
                    "note": "切点对齐到关键帧，-c copy 无转码裁剪",
                }
                notifier.notify(
                    task_id,
                    "COMPLETED",
                    {
                        "split_count": len(outputs),
                        "original_key": file_key_ref,
                    },
                )
                logger.info(
                    f"任务完成: {len(outputs)} 个切片（字节流回传 Next.js）"
                )
                return result

            r2_client = R2Client()
            file_key = prompt["fileKey"]
            local_video_path = tmpdir_path / Path(file_key).name

            logger.info(f"下载视频文件: {file_key}")
            r2_client.download_file(file_key, str(local_video_path))

            logger.info(f"开始场景检测，阈值: {threshold}")
            split_files = detect_and_split_keyframe_aligned(local_video_path)

            uploaded_keys = []
            logger.info(f"上传 {len(split_files)} 个视频切片到 R2...")
            for idx, file_path in enumerate(split_files):
                dest_key = f"tasks/{task_id}/{uuid.uuid4().hex}.mp4"
                r2_client.upload_file(file_path, dest_key)
                uploaded_keys.append(dest_key)
                logger.info(f"上传完成: {dest_key} ({idx+1}/{len(split_files)})")

            result = {
                "original_key": file_key,
                "split_keys": uploaded_keys,
                "count": len(uploaded_keys),
                "note": "切点对齐到关键帧，-c copy 无转码裁剪",
            }
            notifier.notify(task_id, "COMPLETED", result)

            logger.info(
                f"任务完成: {file_key}, 总共生成 {len(uploaded_keys)} 个切片"
            )
            return result

    except Exception as e:
        logger.error(f"场景检测处理失败: {e}")
        import traceback

        traceback.print_exc()
        error_result = {"status": "error", "error": str(e)}
        if task_id is not None:
            notifier.notify(task_id, "ERROR", error_result)
        raise
    finally:
        notifier.close()

# =========================
# 核心：关键帧对齐切分
# =========================
def detect_and_split_keyframe_aligned(
    local_video_path: Path,
) -> List[str]:
    """
    使用 PySceneDetect AdaptiveDetector 检测场景 + 对齐关键帧 + -c copy 切割
    """
    from scenedetect import VideoManager, SceneManager, FrameTimecode, open_video
    from scenedetect.detectors import AdaptiveDetector
    from scenedetect.video_splitter import split_video_ffmpeg

    _ensure_ff_tools()
    logger.info(f"开始场景检测: {local_video_path}")

    video = open_video(str(local_video_path))
    fps = video.frame_rate
    scene_manager = SceneManager()
    detector = AdaptiveDetector(
        adaptive_threshold=3.0,
        min_scene_len=10,
        min_content_val=2.0
    )
    scene_manager.add_detector(detector)

    scene_manager.detect_scenes(video)
    scene_list = scene_manager.get_scene_list()
    logger.info(f"检测到 {len(scene_list)} 个场景")

    output_dir = local_video_path.parent
    output_dir.mkdir(exist_ok=True)

    adjusted_scenes = []
    for start, end in scene_list:
        # 保证不越界（起点不小于 0 帧）
        start_frame = max(start.get_frames() + int(fps / 3), 0)
        end_frame = max(end.get_frames() - int(fps / 3), 0)
        if end_frame - start_frame < fps:
            continue
        start_adj = FrameTimecode(start_frame, fps=fps)
        end_adj = FrameTimecode(end_frame, fps=fps)
        adjusted_scenes.append((start_adj, end_adj))
    
    split_video_ffmpeg(
        input_video_path=str(local_video_path),
        scene_list=adjusted_scenes,
        output_dir=output_dir,
        output_file_template="$VIDEO_NAME-Scene-$SCENE_NUMBER.mp4",
        arg_override="-map 0:v:0 -map 0:a? -map 0:s? -c copy",
        show_progress=True,
        show_output=False
    )

    # 收集切片文件
    stem = local_video_path.stem
    split_files = sorted(
        [f for f in output_dir.glob(f"*-Scene-*.*") if f.is_file()],
        key=lambda f: int(f.stem.split("Scene-")[-1]) if "Scene-" in f.stem else 9999
    )

    if len(scene_list) == 0:
        return [str(local_video_path)]
    return [str(f) for f in split_files]

# ========== 本地入口 ==========
@app.local_entrypoint()
def main():
    """本地测试入口（R2 fileKey 路径）"""
    param = {
        "taskId": "1",
        "prompt": {
            "fileKey": "00b91882-dcd1-4f78-a312-de2c02ea3e9e.mp4",
        },
    }
    split_video.remote(param)

    # fn = modal.Function.from_name(app_name="ffmpeg", name="separate_av")
    # fn.remote(param)