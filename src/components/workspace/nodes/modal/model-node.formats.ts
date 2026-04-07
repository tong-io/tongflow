/**
 * 3D Model Node - 支持格式详解
 *
 * 这个文档列出了 model-node.tsx 组件支持的所有 3D 文件格式及其特性
 */

// ============================================================================
// 支持的格式列表
// ============================================================================

const SUPPORTED_FORMATS = {
    // 通用3D格式
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

    // 点云格式
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

    // 高斯泼溅格式
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

    // 3D打印格式
    stl: {
        name: "Stereolithography",
        extension: ".stl",
        description: "3D打印常用格式",
        features: ["3D打印", "简单网格", "二进制/ASCII"],
        loader: "STLLoader",
    },

    // CAD格式
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

    // 模型格式
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
// 格式分类
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
// 使用指南
// ============================================================================

/**
 * 1. GLB 文件使用
 *
 * GLB 是推荐的通用格式，具有以下优势：
 * - 支持动画和骨骼
 * - PBR 材质支持
 * - 文件较小，加载快速
 * - 跨平台兼容性最好
 *
 * 使用 Three.js 导出 GLB:
 * - Blender: File > Export > glTF 2.0 (.glb/.gltf)
 * - Maya: 使用 babylon.js 导出器或第三方插件
 * - 3ds Max: 使用 babylon.js 导出器
 */

/**
 * 2. 点云数据
 *
 * 支持多种点云格式：
 * - PLY: 最灵活，支持颜色和法线
 * - PTX: Leica 扫描仪标准格式
 * - PTS/XYZ: 简单的文本格式
 *
 * 点云文件格式示例:
 * XYZ 格式:
 *   0.0 0.0 0.0
 *   1.0 1.0 1.0
 *
 * XYZ RGB 格式:
 *   0.0 0.0 0.0 255 0 0
 *   1.0 1.0 1.0 0 255 0
 */

/**
 * 3. 高斯泼溅格式
 *
 * 这些格式提供最高质量的实时渲染：
 *
 * SPZ (推荐):
 * - Scaniverse 格式，压缩率最好
 * - 网址: https://scaniverse.com
 *
 * SPLAT:
 * - Antimatter15 的实现
 * - 文件较大，但广泛支持
 *
 * 生成高斯泼溅:
 * - 使用专业工具如 Reality Capture, Metashape
 * - 或使用开源 gaussian-splatting 项目
 */

/**
 * 4. CAD 格式处理
 *
 * STEP/IGES 格式需要特殊处理：
 * - 组件复杂性高
 * - 需要专门的 CAD 库
 * - 建议在 CAD 软件中转换为 GLTF 或 OBJ
 *
 * 转换步骤:
 * 1. 在 CAD 软件中打开文件
 * 2. 导出为 GLTF 或 OBJ
 * 3. 上传转换后的文件
 */

/**
 * 5. 3D 打印格式
 *
 * STL 格式：
 * - 用于 3D 打印
 * - 网格格式，不包含纹理或颜色
 * - 可以是二进制或 ASCII
 */

// ============================================================================
// 格式选择建议
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
// 故障排除
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
