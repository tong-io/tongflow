/**
 * 3D Model Node Component - 使用指南
 *
 * 这个组件用于在workspace中预览和交互3D模型文件。
 * 支持多种格式的3D文件，包括高斯泼溅格式。
 */

import Model3DNode from "@/components/workspace/nodes/modal/model-node";

/**
 * 节点数据结构
 *
 * 使用该组件时，需要在节点数据中提供：
 * - fileKey: R2存储中的文件键（字符串）
 * - fileName: 文件名，用于确定文件类型（字符串）
 */

// 示例1：单个GLTF模型
const gltfNodeData = {
    fileKey: "models/character-avatar-001",
    fileName: "avatar.glb",
    type: "3d-model",
};

// 示例2：高斯泼溅模型（Butterfly示例）
const splatNodeData = {
    fileKey: "models/gaussian-splatting/butterfly",
    fileName: "butterfly.spz",
    type: "3d-model",
};

// 示例3：OBJ模型
const objNodeData = {
    fileKey: "models/mesh-data/scene",
    fileName: "scene.obj",
    type: "3d-model",
};

// 示例4：FBX模型（带骨骼动画）
const fbxNodeData = {
    fileKey: "models/animated/character",
    fileName: "character.fbx",
    type: "3d-model",
};

/**
 * 支持的文件格式
 *
 * 推荐格式（最佳体验）：
 * 1. .glb/.gltf - glTF格式
 *    - 特点：支持动画、PBR材质、轻量级、压缩
 *    - 使用场景：模型展示、实时渲染、网页应用
 *
 * 通用3D格式：
 * 2. .obj - Wavefront OBJ格式
 *    - 特点：基础网格格式、广泛支持
 *    - 使用场景：简单模型、网格数据
 *
 * 3. .fbx - Autodesk FBX格式
 *    - 特点：支持骨骼、动画、材质、变形器
 *    - 使用场景：角色模型、动画模型、游戏
 *
 * 4. .dae - COLLADA格式
 *    - 特点：支持动画、材质、跨平台
 *    - 使用场景：多工具协作
 *
 * 高斯泼溅格式（新一代高质量渲染）：
 * 5. .spz/.splat/.ksplat/.sog - 高斯泼溅格式
 *    - 特点：高质量、快速渲染、点云表示
 *    - 使用场景：摄影测量、3D扫描、逼真场景
 *    - 需要Spark库支持
 *    - 推荐：.spz (Scaniverse 格式，压缩率最好)
 *
 * 点云格式：
 * 6. .ply - Polygon File Format
 *    - 特点：点云和网格、支持颜色和法线
 *    - 使用场景：激光扫描、3D扫描数据
 *
 * 7. .ptx - Leica Point Cloud
 *    - 特点：激光扫描点云、高密度数据
 *    - 使用场景：工程测量、建筑扫描
 *
 * 8. .pts/.xyz - 简单点云格式
 *    - 特点：轻量级、文本格式（X Y Z [R G B]）
 *    - 使用场景：快速测试、数据交换
 *
 * 3D打印格式：
 * 9. .stl - Stereolithography
 *    - 特点：3D打印标准、简单网格
 *    - 使用场景：3D打印预处理、网格检查
 *
 * CAD格式：
 * 10. .step/.stp - STEP (ISO 10303)
 *    - 特点：专业CAD交换、参数化几何
 *    - 使用场景：工程设计、装配体
 *    - 注意：建议先在CAD软件转换为GLTF或OBJ
 *
 * 11. .igs/.iges - IGES格式
 *    - 特点：CAD数据交换、精确几何
 *    - 使用场景：工业设计、机械制造
 *    - 注意：建议先在CAD软件转换为GLTF或OBJ
 *
 * Apple AR格式：
 * 12. .usdz/.usd - Pixar USD格式
 *    - 特点：Apple推荐、AR/VR支持、压缩
 *    - 使用场景：增强现实、跨平台应用
 *
 * 其他格式：
 * 13. .3ds - 3D Studio Max
 *    - 特点：经典格式、动画支持（较老）
 *    - 使用场景：遗留项目兼容
 *
 * 14. .vtp - VTK Polydata
 *    - 特点：科学计算格式、网格数据
 *    - 使用场景：数值模拟、科学可视化
 *
 * 完整格式列表：
 * .glb, .gltf, .obj, .fbx, .dae, .stl, .ply, .spz, .splat, .ksplat, .sog,
 * .ptx, .pts, .xyz, .usdz, .usd, .3ds, .step, .stp, .igs, .iges, .vtp
 */

/**
 * 功能特性
 *
 * 1. 3D预览：
 *    - 全屏预览模式
 *    - 实时渲染
 *    - 自动缩放和居中
 *
 * 2. 交互控制：
 *    - 鼠标拖动：旋转模型
 *    - 滚轮：缩放（zoom in/out）
 *    - 重置按钮：恢复默认视角
 *
 * 3. 动画支持：
 *    - 自动播放glTF/FBX动画
 *    - 动画混合器管理
 *
 * 4. 高斯泼溅：
 *    - 集成Spark库进行高斯泼溅渲染
 *    - 支持多种splat格式
 *    - 动态光照和材质编辑
 *
 * 5. 下载功能：
 *    - 支持直接下载原始模型文件
 */

/**
 * 在 workflow中添加3D节点的方式
 *
 * 1. 在nodes列表中注册：
 *    import 3DNode from "@/components/workspace/nodes/modal/3d-node";
 *
 *    // 在nodeTypes中添加
 *    const nodeTypes = {
 *      "3d-model": 3DNode,
 *      // ... 其他节点类型
 *    };
 *
 * 2. 在workflow中创建节点时指定类型和数据：
 *    const newNode = {
 *      id: "node-1",
 *      data: {
 *        fileKey: "path/to/model.glb",
 *        fileName: "model.glb"
 *      },
 *      position: { x: 0, y: 0 },
 *      type: "3d-model"
 *    };
 */

/**
 * 技术栈
 *
 * - Three.js (r181): 3D渲染引擎
 *   - GLTFLoader: 加载glTF/GLB文件
 *   - OBJLoader: 加载OBJ文件
 *   - FBXLoader: 加载FBX文件
 *   - 内置Mesh、Light、Camera等
 *
 * - Spark (@sparkjsdev/spark): 高斯泼溅渲染
 *   - 建立在Three.js之上
 *   - 专门优化的点云渲染
 *   - 支持GPU加速
 *
 * - React: 组件框架
 *   - hooks用于状态管理
 *   - useRef用于DOM/Object3D引用
 *
 * - XYFlow: 节点编辑框架
 *   - Handle: 节点连接点
 *   - Position: 定位枚举
 */

/**
 * 性能优化
 *
 * 1. 延迟加载：只在需要时加载Spark库
 * 2. 缓存：利用useR2AsyncLoader进行文件缓存
 * 3. 内存管理：
 *    - 正确处理renderer.dispose()
 *    - 清理event listeners
 *    - 取消动画帧
 * 4. 渲染优化：
 *    - 自适应分辨率
 *    - 缓存计算的自动缩放
 */

/**
 * 错误处理
 *
 * 1. 不支持的格式：显示友好的错误消息
 * 2. 加载失败：显示错误信息和重试选项
 * 3. 缺少依赖：优雅降级（如Spark不可用）
 */

export { gltfNodeData, splatNodeData, objNodeData, fbxNodeData };
