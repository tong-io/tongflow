import base64
import modal
import json
import logging
import time
import subprocess
import tempfile
import uuid
from pathlib import Path
from typing import Optional

import os
import logging
import uuid
from botocore.config import Config
import boto3

logger = logging.getLogger(__name__)

# Modal 镜像配置
image = (
    modal.Image.debian_slim(python_version="3.13")
        .apt_install('ffmpeg')
        .uv_pip_install('moviepy', 'boto3', 'redis')
)
app = modal.App("ffmpeg", image=image)
secrets = modal.Secret.from_name("OPENAPI")

# 日志配置
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger(__name__)

with image.imports():
    # MoviePy v2.x 导入方式
    from moviepy import VideoFileClip, AudioFileClip, concatenate_videoclips, concatenate_audioclips

# ========== 视频处理函数 ==========
def concat_videos_helper(local_paths: list[Path], output_path: Path, quality: str = "medium", 
                 resolution_scale: float = 1.0, fps_limit: Optional[int] = None, 
                 optimize_memory: bool = False):
    """拼接视频，增加资源管理和全面性能优化"""
    logger.info(f"开始拼接视频: {len(local_paths)} 个文件, 质量={quality}, 分辨率缩放={resolution_scale}, 帧率限制={fps_limit}")
    start_time = time.time()
    clips = []
    try:
        # 加载视频片段，根据配置进行优化
        for path in local_paths:
            clip = VideoFileClip(str(path))
            
            # 分辨率缩放优化
            if resolution_scale != 1.0:
                clip = clip.resized(resolution_scale)
                logger.info(f"视频分辨率缩放到 {resolution_scale*100:.0f}%")
            
            # 帧率限制优化
            if fps_limit and clip.fps > fps_limit:
                clip = clip.with_fps(fps_limit)
                logger.info(f"视频帧率限制为 {fps_limit} fps")
            
            clips.append(clip)
        
        # 拼接视频
        if optimize_memory:
            logger.info("使用内存优化模式")
            final = concatenate_videoclips(clips, method="chain")
        else:
            final = concatenate_videoclips(clips, method="compose")
        
        # 生成编码参数 - 简化为CPU编码以确保稳定性
        ffmpeg_params = ["-threads", "0"]
        codec = "libx264"
        
        # 根据质量设置选择编码参数
        if quality == "fast":
            preset = "ultrafast"
            crf = "28"
            ffmpeg_params.extend([
                "-preset", "ultrafast",
                "-tune", "fastdecode",
                "-x264-params", "bframes=0:b-adapt=0:no-scenecut"
            ])
        elif quality == "medium":
            preset = "fast"
            crf = "23"
        else:  # high quality
            preset = "medium"
            crf = "20"
        
        # 通用优化参数
        ffmpeg_params.extend([
            "-movflags", "+faststart",
            "-pix_fmt", "yuv420p",
        ])
        
        # 写入视频文件
        logger.info(f"使用CPU编码: codec={codec}, preset={preset}, crf={crf}")
        final.write_videofile(
            str(output_path), 
            codec=codec, 
            audio_codec="aac",
            preset=preset,
            ffmpeg_params=["-crf", crf] + ffmpeg_params
        )
        
        final.close()
        
        processing_time = time.time() - start_time
        logger.info(f"视频拼接完成，总耗时 {processing_time:.2f} 秒")
        
    except Exception as e:
        logger.error(f"视频拼接失败: {str(e)}")
        raise Exception(f"视频拼接失败: {str(e)}")
    finally:
        for clip in clips:
            try:
                clip.close()
            except:
                pass


def concat_videos_fast_copy(local_paths: list[Path], output_path: Path):
    """超快速视频拼接 - 使用ffmpeg直接copy模式，适用于相同编码格式的视频"""
    try:
        file_list_path = output_path.parent / "filelist.txt"
        with open(file_list_path, 'w', encoding='utf-8') as f:
            for path in local_paths:
                escaped_path = str(path).replace("'", "'\"'\"'")
                f.write(f"file '{escaped_path}'\n")
        
        cmd = [
            "ffmpeg", "-y",
            "-f", "concat",
            "-safe", "0",
            "-i", str(file_list_path),
            "-c", "copy",
            str(output_path)
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        file_list_path.unlink(missing_ok=True)
        
    except subprocess.CalledProcessError as e:
        raise Exception(f"快速视频拼接失败: {e.stderr}")
    except Exception as e:
        raise Exception(f"快速视频拼接失败: {str(e)}")
    finally:
        if 'file_list_path' in locals() and file_list_path.exists():
            file_list_path.unlink(missing_ok=True)


def concat_audios_helper(local_paths: list[Path], output_path: Path):
    """拼接音频"""
    clips = []
    try:
        clips = [AudioFileClip(str(p)) for p in local_paths]
        final = concatenate_audioclips(clips)
        final.write_audiofile(str(output_path))
        final.close()
    except Exception as e:
        raise Exception(f"音频拼接失败: {str(e)}")
    finally:
        for clip in clips:
            try:
                clip.close()
            except:
                pass


def get_audio_codec(input_file: Path):
    """获取音频编码格式"""
    cmd = [
        "ffprobe", "-v", "error",
        "-select_streams", "a:0",
        "-show_entries", "stream=codec_name",
        "-of", "json",
        str(input_file)
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, check=True)
    info = json.loads(result.stdout)
    
    # Check if audio stream exists
    if not info.get("streams") or len(info["streams"]) == 0:
        raise Exception("视频文件中没有音频轨道")
    
    codec = info["streams"][0]["codec_name"]
    return codec


def separate_av_helper(local_path: Path, out_video: Path, out_audio: Path):
    """分离音视频"""
    try:
        subprocess.run([
            "ffmpeg", "-i", str(local_path),
            "-an", "-c", "copy", str(out_video)
        ], check=True, capture_output=True)

        subprocess.run([
            "ffmpeg", "-i", str(local_path),
            "-vn", "-c", "copy",
            str(out_audio)
        ], check=True, capture_output=True)
    except Exception as e:
        raise Exception(f"音视频分离失败: {str(e)}")


def has_audio_track(video_path: Path) -> bool:
    """检测视频是否有音频轨道"""
    try:
        cmd = [
            "ffprobe", "-v", "error",
            "-select_streams", "a:0",
            "-show_entries", "stream=codec_name",
            "-of", "json",
            str(video_path)
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        info = json.loads(result.stdout)
        return bool(info.get("streams") and len(info["streams"]) > 0)
    except Exception:
        return False


def get_media_duration(file_path: Path) -> float:
    """获取媒体文件时长（秒）"""
    try:
        cmd = [
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration",
            "-of", "json",
            str(file_path)
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        info = json.loads(result.stdout)
        return float(info.get("format", {}).get("duration", 0))
    except Exception:
        return 0


def merge_av_helper(video_path: Path, audio_path: Path, output_path: Path):
    """合并音视频，如果原视频有音频则混合两个音轨，新音频会被截取到视频长度"""
    try:
        # 获取视频时长
        video_duration = get_media_duration(video_path)
        logger.info(f"视频时长: {video_duration:.2f} 秒")
        
        # 检测原视频是否有音频轨道
        if has_audio_track(video_path):
            logger.info("原视频有音频轨道，将混合两个音轨")
            # 使用 ffmpeg:
            # 1. 截取新音频到视频长度 (atrim)
            # 2. 保留原视频完整音频
            # 3. 混合两个音频 (amix, duration=first 确保以原视频音频长度为准)
            filter_complex = (
                f"[1:a]atrim=0:{video_duration},asetpts=PTS-STARTPTS[trimmed];"
                f"[0:a][trimmed]amix=inputs=2:duration=first[aout]"
            )
            cmd = [
                "ffmpeg", "-y",
                "-i", str(video_path),
                "-i", str(audio_path),
                "-filter_complex", filter_complex,
                "-map", "0:v",
                "-map", "[aout]",
                "-c:v", "copy",
                "-c:a", "aac",
                str(output_path)
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        else:
            logger.info("原视频无音频轨道，直接添加新音频（截取到视频长度）")
            # 原视频无音频，截取新音频到视频长度后添加
            filter_complex = f"[0:a]atrim=0:{video_duration},asetpts=PTS-STARTPTS[aout]"
            cmd = [
                "ffmpeg", "-y",
                "-i", str(audio_path),
                "-i", str(video_path),
                "-filter_complex", filter_complex,
                "-map", "1:v",
                "-map", "[aout]",
                "-c:v", "copy",
                "-c:a", "aac",
                "-shortest",
                str(output_path)
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, check=True)
    except subprocess.CalledProcessError as e:
        raise Exception(f"音视频合并失败: {e.stderr}")
    except Exception as e:
        raise Exception(f"音视频合并失败: {str(e)}")


def remove_audio_helper(video_path: Path, output_path: Path):
    """从视频中移除音频轨道"""
    video = None
    video_without_audio = None
    try:
        video = VideoFileClip(str(video_path))
        video_without_audio = video.without_audio()
        video_without_audio.write_videofile(
            str(output_path),
            codec="libx264",
            preset="fast",
            ffmpeg_params=["-crf", "23", "-threads", "0"]
        )
    except Exception as e:
        raise Exception(f"移除音频失败: {str(e)}")
    finally:
        for clip in [video, video_without_audio]:
            if clip:
                try:
                    clip.close()
                except:
                    pass


def extract_audio_helper(video_path: Path, output_path: Path, audio_format: str = "mp3"):
    """从视频中提取音频"""
    video = None
    try:
        video = VideoFileClip(str(video_path))
        
        if video.audio is None:
            raise Exception("视频文件中没有音频轨道")
        
        audio_ext = audio_format.lower()
        if audio_ext == 'mp3':
            audio_codec = 'libmp3lame'
        elif audio_ext == 'aac' or audio_ext == 'm4a':
            audio_codec = 'aac'
        elif audio_ext == 'ogg':
            audio_codec = 'libvorbis'
        elif audio_ext == 'wav':
            audio_codec = 'pcm_s16le'
        else:
            audio_codec = 'libmp3lame'
        
        video.audio.write_audiofile(
            str(output_path),
            codec=audio_codec,
            ffmpeg_params=["-threads", "0"]
        )
    except Exception as e:
        raise Exception(f"提取音频失败: {str(e)}")
    finally:
        if video:
            try:
                video.close()
            except:
                pass


def scale_video_helper(video_path: Path, output_path: Path, scale_percent: float):
    """等比缩放视频"""
    video = None
    scaled = None
    try:
        video = VideoFileClip(str(video_path))
        scale_factor = scale_percent / 100.0
        logger.info(f"缩放视频到 {scale_percent}% ({scale_factor}x)")
        
        scaled = video.resized(scale_factor)
        scaled.write_videofile(
            str(output_path),
            codec="libx264",
            audio_codec="aac",
            preset="fast",
            ffmpeg_params=["-crf", "23", "-threads", "0"]
        )
    except Exception as e:
        raise Exception(f"视频缩放失败: {str(e)}")
    finally:
        for clip in [video, scaled]:
            if clip:
                try:
                    clip.close()
                except:
                    pass


def get_first_frame_helper(video_path: Path, output_path: Path):
    """获取视频的第一帧"""
    video = None
    try:
        video = VideoFileClip(str(video_path))
        logger.info(f"Extracting first frame (duration={video.duration:.3f}s, fps={video.fps})")
        video.save_frame(str(output_path), t=0)
    except Exception as e:
        raise Exception(f"获取首帧失败: {str(e)}")
    finally:
        if video:
            try:
                video.close()
            except:
                pass


def get_last_frame_helper(video_path: Path, output_path: Path):
    """获取视频的最后一帧"""
    video = None
    try:
        video = VideoFileClip(str(video_path))
        fps = video.fps if video.fps else 24.0
        # 取最后一帧的时间中心点，比 duration - 1/fps 更安全，防止浮点误差导致丢帧或越界
        t = max(0, video.duration - (0.5 / fps))
        
        logger.info(f"Extracting frame at t={t:.3f}s (duration={video.duration:.3f}s, fps={fps})")
        video.save_frame(str(output_path), t=t)
    except Exception as e:
        raise Exception(f"获取尾帧失败: {str(e)}")
    finally:
        if video:
            try:
                video.close()
            except:
                pass


# ========== 与前端/GPU 一致：优先使用 prompt 中的 *_bytes，避免容器内 R2 HeadObject 本地-only key ==========

def _normalize_modal_bytes(val) -> bytes:
    if val is None:
        raise ValueError("empty bytes")
    if isinstance(val, (bytes, bytearray)):
        return bytes(val)
    if isinstance(val, str):
        return base64.b64decode(val)
    return bytes(val)


def _result_bytes(out_path: Path, ext: str, task_id: str, notifier) -> dict:
    """返回字节给 Next.js saveFile（与 qwen3tts GPU 一致），不再依赖 R2 上的 file_key 供 /api/uploads 读取。"""
    data = out_path.read_bytes()
    ext_clean = ext.lstrip(".")
    result = {"success": True, "output_bytes": data, "output_ext": ext_clean}
    notifier.notify(
        task_id,
        "COMPLETED",
        {"output_ext": ext_clean, "byte_len": len(data)},
    )
    return result


# ========== Modal 函数 ==========
@app.function(cpu=0.5, memory=1024, timeout=3600, secrets=[secrets])
def concat_videos(task: dict) -> dict:
    """Modal 函数: 拼接视频"""
    try:
        notifier = RedisNotifier()

        task_id = task["taskId"]
        prompt = task["prompt"]
        
        notifier.notify(task_id, "PROCESSING")
        
        with tempfile.TemporaryDirectory() as tmpdir:
            tmpdir_path = Path(tmpdir)
            local_files = []
            raw_videos = prompt.get("videos_bytes")
            if raw_videos is not None:
                names = prompt.get("filenames") or []
                for i, raw in enumerate(raw_videos):
                    data = _normalize_modal_bytes(raw)
                    fn = names[i] if i < len(names) else f"{i}.mp4"
                    local_path = tmpdir_path / Path(fn).name
                    local_path.write_bytes(data)
                    local_files.append(local_path)
                    logger.info(f"已写入输入视频 {i + 1} ({len(data)} bytes)")
            else:
                r2_client = R2Client()
                file_keys = prompt["fileKeys"]
                logger.info(f"下载 {len(file_keys)} 个视频文件...")
                for idx, key in enumerate(file_keys):
                    local_path = tmpdir_path / Path(key).name
                    r2_client.download_file(key, str(local_path))
                    local_files.append(local_path)
                    logger.info(f"下载完成: {key}")
            
            # 拼接视频
            output_name = f"{uuid.uuid4().hex}.mp4"
            out_path = tmpdir_path / output_name
            
            concat_videos_fast_copy(local_files, out_path)
            
            result = _result_bytes(out_path, "mp4", task_id, notifier)
            return result
    
    except Exception as e:
        logger.error(f"视频拼接处理失败: {e}")
        error_result = {"success": False, "status": "error", "error": str(e)}
        notifier.notify( task_id, "ERROR", error_result)
        return error_result
    finally:
        notifier.close()


@app.function(cpu=0.5, memory=1024, timeout=3600, secrets=[secrets])
def concat_audios(task: dict) -> dict:
    """Modal 函数: 拼接音频"""
    try:
        notifier = RedisNotifier()
        
        task_id = task["taskId"]
        prompt = task["prompt"]
        
        notifier.notify(task_id, "PROCESSING")
        
        with tempfile.TemporaryDirectory() as tmpdir:
            tmpdir_path = Path(tmpdir)
            local_files = []
            raw_audios = prompt.get("audios_bytes")
            if raw_audios is not None:
                names = prompt.get("filenames") or []
                for i, raw in enumerate(raw_audios):
                    data = _normalize_modal_bytes(raw)
                    fn = names[i] if i < len(names) else f"{i}.mp3"
                    local_path = tmpdir_path / Path(fn).name
                    local_path.write_bytes(data)
                    local_files.append(local_path)
                    logger.info(f"已写入输入音频 {i + 1} ({len(data)} bytes)")
            else:
                r2_client = R2Client()
                file_keys = prompt["fileKeys"]
                logger.info(f"下载 {len(file_keys)} 个音频文件...")
                for idx, key in enumerate(file_keys):
                    local_path = tmpdir_path / Path(key).name
                    r2_client.download_file(key, str(local_path))
                    local_files.append(local_path)
            
            output_name = f"{uuid.uuid4().hex}.mp3"
            out_path = tmpdir_path / output_name
            
            concat_audios_helper(local_files, out_path)
            
            result = _result_bytes(out_path, "mp3", task_id, notifier)
            return result
    
    except Exception as e:
        logger.error(f"音频拼接处理失败: {e}")
        error_result = {"success": False, "status": "error", "error": str(e)}
        notifier.notify(task_id, "ERROR", error_result)
        return error_result
    finally:
        notifier.close()


@app.function(cpu=0.5, memory=1024, timeout=3600, secrets=[secrets])
def separate_video_audio(task: dict) -> dict:
    print("separate_av task:", task)
    
    """Modal 函数: 分离音视频"""
    try:
        notifier = RedisNotifier()
        task_id = task["taskId"]
        prompt = task["prompt"]
        
        notifier.notify(task_id, "PROCESSING")
        
        with tempfile.TemporaryDirectory() as tmpdir:
            tmpdir_path = Path(tmpdir)
            vb = prompt.get("video_bytes")
            if vb is not None:
                fn = prompt.get("video_filename") or "input.mp4"
                local_path = tmpdir_path / Path(fn).name
                local_path.write_bytes(_normalize_modal_bytes(vb))
                logger.info(f"已写入输入视频 ({local_path.stat().st_size} bytes)")
            else:
                r2_client = R2Client()
                file_key = prompt["fileKey"]
                local_path = tmpdir_path / Path(file_key).name
                logger.info(f"下载视频文件: {file_key}")
                r2_client.download_file(file_key, str(local_path))
            
            try:
                codec = get_audio_codec(local_path)
                codec_to_ext = {
                    "aac": ".m4a", "mp3": ".mp3", "vorbis": ".ogg",
                    "pcm_s16le": ".wav", "opus": ".opus"
                }
                ext = codec_to_ext.get(codec, ".m4a")
            except Exception as e:
                # Re-raise with clear error message if no audio track
                raise Exception(f"无法获取音频编码格式: {str(e)}")
            
            video_name = f"{uuid.uuid4().hex}.mp4"
            audio_name = f"{uuid.uuid4().hex}{ext}"
            out_video = tmpdir_path / video_name
            out_audio = tmpdir_path / audio_name
            
            separate_av_helper(local_path, out_video, out_audio)
            
            aext = Path(audio_name).suffix.lstrip(".") or "m4a"
            result = {
                "success": True,
                "outputs": [
                    {"output_bytes": out_video.read_bytes(), "output_ext": "mp4"},
                    {"output_bytes": out_audio.read_bytes(), "output_ext": aext},
                ],
            }
            notifier.notify(
                task_id,
                "COMPLETED",
                {"mode": "separate", "byte_lens": [len(result["outputs"][0]["output_bytes"]), len(result["outputs"][1]["output_bytes"])]},
            )
            return result
    
    except Exception as e:
        logger.error(f"音视频分离失败: {e}")
        error_result = {"success": False, "status": "error", "error": str(e)}
        notifier.notify(task_id, "ERROR", error_result)
        return error_result
    finally:
        notifier.close()


@app.function(cpu=0.5, memory=1024, timeout=3600, secrets=[secrets])
def merge_video_audio(task: dict) -> dict:
    """Modal 函数: 合并音视频"""
    try:
        notifier = RedisNotifier()
        
        task_id = task["taskId"]
        prompt = task["prompt"]
        
        notifier.notify(task_id, "PROCESSING")
        
        with tempfile.TemporaryDirectory() as tmpdir:
            tmpdir_path = Path(tmpdir)
            
            vvb = prompt.get("video_bytes")
            avb = prompt.get("audio_bytes")
            if vvb is not None and avb is not None:
                vfn = prompt.get("video_filename") or "video.mp4"
                afn = prompt.get("audio_filename") or "audio.mp3"
                local_video = tmpdir_path / Path(vfn).name
                local_audio = tmpdir_path / Path(afn).name
                local_video.write_bytes(_normalize_modal_bytes(vvb))
                local_audio.write_bytes(_normalize_modal_bytes(avb))
                logger.info("已写入合并用音视频字节")
            else:
                r2_client = R2Client()
                video_key = prompt["video_key"]
                audio_key = prompt["audio_key"]
                local_video = tmpdir_path / Path(video_key).name
                local_audio = tmpdir_path / Path(audio_key).name
                logger.info(f"下载音视频文件...")
                r2_client.download_file(video_key, str(local_video))
                r2_client.download_file(audio_key, str(local_audio))
            
            output_name = f"{uuid.uuid4().hex}.mp4"
            out_path = tmpdir_path / output_name
            
            merge_av_helper(local_video, local_audio, out_path)
            
            result = _result_bytes(out_path, "mp4", task_id, notifier)
            return result
    
    except Exception as e:
        logger.error(f"音视频合并失败: {e}")
        error_result = {"success": False, "status": "error", "error": str(e)}
        notifier.notify(task_id, "ERROR", error_result)
        return error_result
    finally:
        notifier.close()


@app.function(cpu=0.5, memory=1024, timeout=3600, secrets=[secrets])
def remove_audio(task: dict) -> dict:
    """Modal 函数: 移除音频"""
    try:
        notifier = RedisNotifier()
        
        task_id = task["taskId"]
        prompt = task["prompt"]
        
        notifier.notify(task_id, "PROCESSING")
        
        with tempfile.TemporaryDirectory() as tmpdir:
            tmpdir_path = Path(tmpdir)
            vb = prompt.get("video_bytes")
            if vb is not None:
                fn = prompt.get("video_filename") or "input.mp4"
                local_video = tmpdir_path / Path(fn).name
                local_video.write_bytes(_normalize_modal_bytes(vb))
                logger.info(f"已写入输入视频 ({local_video.stat().st_size} bytes)")
            else:
                r2_client = R2Client()
                video_key = prompt["videoKey"]
                local_video = tmpdir_path / Path(video_key).name
                logger.info(f"下载视频文件: {video_key}")
                r2_client.download_file(video_key, str(local_video))
            
            output_name = f"{uuid.uuid4().hex}.mp4"
            out_path = tmpdir_path / output_name
            
            remove_audio_helper(local_video, out_path)
            
            result = _result_bytes(out_path, "mp4", task_id, notifier)
            return result
    
    except Exception as e:
        logger.error(f"移除音频失败: {e}")
        error_result = {"success": False, "status": "error", "error": str(e)}
        notifier.notify(task_id, "ERROR", error_result)
        return error_result
    finally:
        notifier.close()


@app.function(cpu=0.5, memory=1024, timeout=3600, secrets=[secrets])
def extract_audio(task: dict) -> dict:
    """Modal 函数: 提取音频"""
    try:
        notifier = RedisNotifier()
        
        task_id = task["taskId"]
        prompt = task["prompt"]
        audio_format = prompt.get("audioFormat", "mp3")
        
        notifier.notify(task_id, "PROCESSING")
        
        with tempfile.TemporaryDirectory() as tmpdir:
            tmpdir_path = Path(tmpdir)
            vb = prompt.get("video_bytes")
            if vb is not None:
                fn = prompt.get("video_filename") or "input.mp4"
                local_video = tmpdir_path / Path(fn).name
                local_video.write_bytes(_normalize_modal_bytes(vb))
                logger.info(f"已写入输入视频 ({local_video.stat().st_size} bytes)")
            else:
                r2_client = R2Client()
                video_key = prompt["fileKey"]
                local_video = tmpdir_path / Path(video_key).name
                logger.info(f"下载视频文件: {video_key}")
                r2_client.download_file(video_key, str(local_video))
            
            output_name = f"{uuid.uuid4().hex}.{audio_format}"
            out_path = tmpdir_path / output_name
            
            extract_audio_helper(local_video, out_path, audio_format)
            
            result = _result_bytes(out_path, audio_format, task_id, notifier)
            return result
    
    except Exception as e:
        logger.error(f"提取音频失败: {e}")
        error_result = {"success": False, "status": "error", "error": str(e)}
        notifier.notify(task_id, "ERROR", error_result)
        return error_result
    finally:
        notifier.close()


@app.function(cpu=0.5, memory=1024, timeout=3600, secrets=[secrets])
def scale_video(task: dict) -> dict:
    """Modal 函数: 缩放视频"""
    try:
        notifier = RedisNotifier()
        
        task_id = task["taskId"]
        prompt = task["prompt"]
        scale_percent = prompt.get("scalePercent", 50)
        
        notifier.notify(task_id, "PROCESSING")
        
        with tempfile.TemporaryDirectory() as tmpdir:
            tmpdir_path = Path(tmpdir)
            vb = prompt.get("video_bytes")
            if vb is not None:
                fn = prompt.get("video_filename") or "input.mp4"
                local_video = tmpdir_path / Path(fn).name
                local_video.write_bytes(_normalize_modal_bytes(vb))
                logger.info(f"已写入输入视频 ({local_video.stat().st_size} bytes)")
            else:
                r2_client = R2Client()
                video_key = prompt["videoKey"]
                local_video = tmpdir_path / Path(video_key).name
                logger.info(f"下载视频文件: {video_key}")
                r2_client.download_file(video_key, str(local_video))
            
            output_name = f"{uuid.uuid4().hex}.mp4"
            out_path = tmpdir_path / output_name
            
            scale_video_helper(local_video, out_path, scale_percent)
            
            result = _result_bytes(out_path, "mp4", task_id, notifier)
            return result
    
    except Exception as e:
        logger.error(f"视频缩放失败: {e}")
        error_result = {"success": False, "status": "error", "error": str(e)}
        notifier.notify(task_id, "ERROR", error_result)
        return error_result
    finally:
        notifier.close()


@app.function(cpu=0.5, memory=1024, timeout=3600, secrets=[secrets])
def get_last_frame(task: dict) -> dict:
    """Modal 函数: 获取视频尾帧"""
    try:
        notifier = RedisNotifier()
        
        task_id = task["taskId"]
        prompt = task["prompt"]
        
        notifier.notify(task_id, "PROCESSING")
        
        with tempfile.TemporaryDirectory() as tmpdir:
            tmpdir_path = Path(tmpdir)
            vb = prompt.get("video_bytes")
            if vb is not None:
                fn = prompt.get("video_filename") or "input.mp4"
                local_video = tmpdir_path / Path(fn).name
                local_video.write_bytes(_normalize_modal_bytes(vb))
                logger.info(f"已写入输入视频 ({local_video.stat().st_size} bytes)")
            else:
                r2_client = R2Client()
                video_key = prompt["videoKey"]
                local_video = tmpdir_path / Path(video_key).name
                logger.info(f"下载视频文件: {video_key}")
                r2_client.download_file(video_key, str(local_video))
            
            output_name = f"{uuid.uuid4().hex}.png"
            out_path = tmpdir_path / output_name
            
            get_last_frame_helper(local_video, out_path)
            
            result = _result_bytes(out_path, "png", task_id, notifier)
            return result
    
    except Exception as e:
        logger.error(f"获取尾帧失败: {e}")
        error_result = {"success": False, "status": "error", "error": str(e)}
        notifier.notify(task_id, "ERROR", error_result)
        return error_result
    finally:
        notifier.close()


@app.function(cpu=0.5, memory=1024, timeout=3600, secrets=[secrets])
def get_first_frame(task: dict) -> dict:
    """Modal 函数: 获取视频首帧"""
    try:
        notifier = RedisNotifier()

        task_id = task["taskId"]
        prompt = task["prompt"]

        notifier.notify(task_id, "PROCESSING")

        with tempfile.TemporaryDirectory() as tmpdir:
            tmpdir_path = Path(tmpdir)
            vb = prompt.get("video_bytes")
            if vb is not None:
                fn = prompt.get("video_filename") or "input.mp4"
                local_video = tmpdir_path / Path(fn).name
                local_video.write_bytes(_normalize_modal_bytes(vb))
                logger.info(f"已写入输入视频 ({local_video.stat().st_size} bytes)")
            else:
                r2_client = R2Client()
                video_key = prompt["videoKey"]
                local_video = tmpdir_path / Path(video_key).name
                logger.info(f"下载视频文件: {video_key}")
                r2_client.download_file(video_key, str(local_video))

            output_name = f"{uuid.uuid4().hex}.png"
            out_path = tmpdir_path / output_name

            get_first_frame_helper(local_video, out_path)

            result = _result_bytes(out_path, "png", task_id, notifier)
            return result

    except Exception as e:
        logger.error(f"获取首帧失败: {e}")
        error_result = {"success": False, "status": "error", "error": str(e)}
        notifier.notify(task_id, "ERROR", error_result)
        return error_result
    finally:
        notifier.close()


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

import os
import json
import time
import logging
import traceback
import redis

logger = logging.getLogger(__name__)


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


# ========== 本地入口 ==========
@app.local_entrypoint()
def main():
    param = {
        "task_id": "1",
        "prompt": {
            "fileKey": "00b91882-dcd1-4f78-a312-de2c02ea3e9e.mp4"
        }
    }
    """本地测试入口"""
    # separate_av.remote(param)

    fn = modal.Function.from_name(app_name="ffmpeg", name="separate_av")
    fn.remote(param)

