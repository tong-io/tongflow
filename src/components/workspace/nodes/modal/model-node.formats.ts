/**
 * 3D Model Node - Supported Formats
 *
 * This document lists all 3D file formats supported by the model-node.tsx component and their features.
 */

// ============================================================================
// Supported formats
// ============================================================================

const SUPPORTED_FORMATS = {
    // General 3D formats
    glb: {
        name: "glTF Binary",
        extension: ".glb",
        description: "推荐格式，支持动画、材质、压缩",
        features: ["动画", "PBR材质", "轻量级", "跨平台"],
        loader: "GLTFLoader",
    },

    gltf: {
        name: "glTF (Embedded JSON)",
        extension: ".gltf",
        description: "glTF 文本格式，适合编辑和调试",
        features: ["动画", "PBR材质", "易于编辑"],
        loader: "GLTFLoader",
    },

    obj: {
        name: "Wavefront OBJ",
        extension: ".obj",
        description: "经典网格格式，广泛支持",
        features: ["简单网格", "广泛兼容性", "轻量级"],
        loader: "OBJLoader",
    },

    fbx: {
        name: "Autodesk FBX",
        extension: ".fbx",
        description: "专业3D格式，支持骨骼和动画",
        features: ["骨骼动画", "变形器", "材质", "复杂拓扑"],
        loader: "FBXLoader",
    },

    // Point cloud formats
    ply: {
        name: "Polygon File Format",
        extension: ".ply",
        description: "点云和网格格式，支持颜色和法线",
        features: ["点云", "颜色信息", "法线数据"],
        loader: "PLYLoader",
    },

    ptx: {
        name: "Leica Point Cloud",
        extension: ".ptx",
        description: "激光扫描点云格式",
        features: ["高密度点云", "扫描数据", "XYZ + RGB"],
        loader: "PointCloudLoader (Custom)",
    },

    pts: {
        name: "Simple Point Cloud",
        extension: ".pts",
        description: "简单的点云格式 (X Y Z R G B)",
        features: ["轻量级点云", "XYZ坐标", "RGB颜色"],
        loader: "PointCloudLoader (Custom)",
    },

    xyz: {
        name: "XYZ Point Cloud",
        extension: ".xyz",
        description: "简单的点云格式 (X Y Z)",
        features: ["基础点云", "简单格式"],
        loader: "PointCloudLoader (Custom)",
    },

    // Gaussian splat formats
    spz: {
        name: "Scaniverse Splat",
        extension: ".spz",
        description: "压缩的高斯泼溅格式",
        features: ["高质量", "快速渲染", "压缩"],
        loader: "SplatMesh (Spark)",
    },

    splat: {
        name: "Splat Format",
        extension: ".splat",
        description: "高斯泼溅格式 (Antimatter15)",
        features: ["高斯泼溅", "逼真渲染"],
        loader: "SplatMesh (Spark)",
    },

    ksplat: {
        name: "Gaussian Splat",
        extension: ".ksplat",
        description: "高斯泼溅格式 (mkkellogg)",
        features: ["高斯泼溅", "优化版本"],
        loader: "SplatMesh (Spark)",
    },

    sog: {
        name: "PlayCanvas Splat",
        extension: ".sog",
        description: "PlayCanvas 高斯泼溅格式",
        features: ["高斯泼溅", "Web优化"],
        loader: "SplatMesh (Spark)",
    },

    // 3D printing formats
    stl: {
        name: "Stereolithography",
        extension: ".stl",
        description: "3D打印常用格式",
        features: ["3D打印", "简单网格", "二进制/ASCII"],
        loader: "STLLoader",
    },

    // CAD formats
    step: {
        name: "STEP (ISO 10303)",
        extension: ".step / .stp",
        description: "专业CAD交换格式",
        features: ["参数化几何", "装配体", "精确数据"],
        note: "需要专门的库支持，建议转换为GLTF或OBJ",
    },

    iges: {
        name: "IGES",
        extension: ".igs / .iges",
        description: "CAD文件交换格式",
        features: ["CAD数据", "精确几何"],
        note: "需要专门的库支持，建议转换为GLTF或OBJ",
    },

    // Model formats
    dae: {
        name: "COLLADA",
        extension: ".dae",
        description: "COLLADA 3D格式",
        features: ["动画", "材质", "跨平台"],
        loader: "ColladaLoader",
    },

    usdz: {
        name: "USD Zip",
        extension: ".usdz",
        description: "USD 压缩格式 (Apple推荐用于AR)",
        features: ["AR/VR", "压缩", "跨平台"],
        loader: "USDZLoader",
    },

    usd: {
        name: "Pixar USD",
        extension: ".usd",
        description: "Pixar 通用场景描述格式",
        features: ["复杂场景", "参数化", "版本控制"],
        loader: "USDZLoader",
    },

    tds: {
        name: "3D Studio Max",
        extension: ".3ds",
        description: "3DS Max 模型格式",
        features: ["动画", "材质", "老格式"],
        loader: "TDSLoader",
    },

    vtp: {
        name: "VTK Polydata",
        extension: ".vtp",
        description: "VTK 多边形格式",
        features: ["科学计算", "网格数据"],
        loader: "VTKLoader",
    },
};

// ============================================================================
// Format categories
// ============================================================================

const FORMAT_CATEGORIES = {
    推荐格式: {
        description: "最佳兼容性和特性",
        formats: [".glb", ".gltf"],
    },

    通用3D格式: {
        description: "广泛支持的通用格式",
        formats: [".fbx", ".obj", ".dae"],
    },

    点云格式: {
        description: "用于点云数据",
        formats: [".ply", ".ptx", ".pts", ".xyz"],
    },

    高斯泼溅格式: {
        description: "新一代高质量渲染格式（需要 Spark 库）",
        formats: [".spz", ".splat", ".ksplat", ".sog"],
    },

    CAD格式: {
        description: "工程设计和制造文件",
        formats: [".step", ".stp", ".igs", ".iges"],
        note: "建议转换为 GLTF 以获得最佳支持",
    },

    "3D打印": {
        description: "3D打印相关格式",
        formats: [".stl"],
    },

    "Apple AR": {
        description: "Apple 增强现实推荐格式",
        formats: [".usdz"],
    },

    "学术/科学": {
        description: "学术和科学计算格式",
        formats: [".vtp", ".usd"],
    },

    过时格式: {
        description: "仍然支持但不推荐的旧格式",
        formats: [".3ds", ".dae"],
    },
};

// ============================================================================
// Usage guide
// ============================================================================

/**
 * 1. Using GLB files
 *
 * GLB is the recommended general-purpose format, with these advantages:
 * - Supports animation and skeletons
 * - Supports PBR materials
 * - Smaller files and fast loading
 * - Best cross-platform compatibility
 *
 * Exporting GLB for Three.js:
 * - Blender: File > Export > glTF 2.0 (.glb/.gltf)
 * - Maya: Use the babylon.js exporter or a third-party plugin
 * - 3ds Max: Use the babylon.js exporter
 */

/**
 * 2. Point cloud data
 *
 * Supports multiple point cloud formats:
 * - PLY: Most flexible, supports colors and normals
 * - PTX: Standard format for Leica scanners
 * - PTS/XYZ: Simple text formats
 *
 * Point cloud file format examples:
 * XYZ format:
 *   0.0 0.0 0.0
 *   1.0 1.0 1.0
 *
 * XYZ RGB format:
 *   0.0 0.0 0.0 255 0 0
 *   1.0 1.0 1.0 0 255 0
 */

/**
 * 3. Gaussian splat formats
 *
 * These formats provide the highest quality real-time rendering:
 *
 * SPZ (recommended):
 * - Scaniverse format, with the best compression ratio
 * - Website: https://scaniverse.com
 *
 * SPLAT:
 * - Antimatter15 implementation
 * - Larger files, but widely supported
 *
 * Generating Gaussian splats:
 * - Use professional tools such as Reality Capture or Metashape
 * - Or use the open-source gaussian-splatting project
 */

/**
 * 4. Handling CAD formats
 *
 * STEP/IGES formats require special handling:
 * - High component complexity
 * - Requires dedicated CAD libraries
 * - Recommended to convert to GLTF or OBJ in CAD software
 *
 * Conversion steps:
 * 1. Open the file in CAD software
 * 2. Export as GLTF or OBJ
 * 3. Upload the converted file
 */

/**
 * 5. 3D printing formats
 *
 * STL format:
 * - Used for 3D printing
 * - Mesh format without textures or colors
 * - Can be binary or ASCII
 */

// ============================================================================
// Format selection recommendations
// ============================================================================

const RECOMMENDATIONS = {
    最佳通用格式: ".glb",
    最佳点云格式: ".ply",
    最佳摄影测量: ".spz (Gaussian Splat)",
    "3D打印": ".stl",
    网页应用: ".glb 或 .gltf",
    移动AR: ".glb 或 .usdz",
    游戏引擎: ".fbx 或 .glb",
    CAD专业工作: ".step (转换为 .glb)",
    点云可视化: ".ply 或 .ptx",
    文件大小最小: ".glb (压缩)",
};

// ============================================================================
// Troubleshooting
// ============================================================================

const TROUBLESHOOTING = {
    格式不支持: {
        solution: "将文件转换为支持的格式（推荐 .glb）",
    },

    文件无法加载: {
        causes: ["网络问题导致下载失败", "文件损坏", "格式不正确"],
        solution: "检查文件有效性，尝试重新转换或从原始软件导出",
    },

    "颜色/材质丢失": {
        causes: ["某些格式不支持纹理", "导出设置不正确", "缺少关联的纹理文件"],
        solution: "使用支持材质的格式（如 .glb）或确保正确导出所有资源",
    },

    模型显示不全: {
        causes: ["模型非常大或非常小", "相机视角问题"],
        solution: "自动缩放应该处理大多数情况，可以使用鼠标操作调整视角",
    },

    动画不播放: {
        causes: ["格式不支持动画", "导出时未包含动画"],
        solution: "使用支持动画的格式（.glb, .fbx）并确保动画被正确导出",
    },
};

export {
    SUPPORTED_FORMATS,
    FORMAT_CATEGORIES,
    RECOMMENDATIONS,
    TROUBLESHOOTING,
};
