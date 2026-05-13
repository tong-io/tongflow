/**
 * 3D Model Node Component - Usage Guide
 *
 * This component is used to preview and interact with 3D model files in the workspace.
 * It supports multiple 3D file formats, including Gaussian splat formats.
 */

/**
 * Node data structure
 *
 * When using this component, provide these fields in the node data:
 * - fileKey: File key in R2 storage (string)
 * - fileName: File name used to determine the file type (string)
 */

// Example 1: Single GLTF model
const gltfNodeData = {
    fileKey: "models/character-avatar-001",
    fileName: "avatar.glb",
    type: "3d-model",
};

// Example 2: Gaussian splat model (Butterfly example)
const splatNodeData = {
    fileKey: "models/gaussian-splatting/butterfly",
    fileName: "butterfly.spz",
    type: "3d-model",
};

// Example 3: OBJ model
const objNodeData = {
    fileKey: "models/mesh-data/scene",
    fileName: "scene.obj",
    type: "3d-model",
};

// Example 4: FBX model (with skeletal animation)
const fbxNodeData = {
    fileKey: "models/animated/character",
    fileName: "character.fbx",
    type: "3d-model",
};

/**
 * Supported file formats
 *
 * Recommended formats (best experience):
 * 1. .glb/.gltf - glTF format
 *    - Features: Animation support, PBR materials, lightweight, compressed
 *    - Use cases: Model presentation, real-time rendering, web applications
 *
 * General 3D formats:
 * 2. .obj - Wavefront OBJ format
 *    - Features: Basic mesh format, widely supported
 *    - Use cases: Simple models, mesh data
 *
 * 3. .fbx - Autodesk FBX format
 *    - Features: Supports skeletons, animations, materials, deformers
 *    - Use cases: Character models, animated models, games
 *
 * 4. .dae - COLLADA format
 *    - Features: Supports animations, materials, cross-platform
 *    - Use cases: Multi-tool collaboration
 *
 * Gaussian splat formats (next-generation high-quality rendering):
 * 5. .spz/.splat/.ksplat/.sog - Gaussian splat formats
 *    - Features: High quality, fast rendering, point cloud representation
 *    - Use cases: Photogrammetry, 3D scanning, realistic scenes
 *    - Requires Spark library support
 *    - Recommended: .spz (Scaniverse format, with the best compression ratio)
 *
 * Point cloud formats:
 * 6. .ply - Polygon File Format
 *    - Features: Point clouds and meshes, supports colors and normals
 *    - Use cases: Laser scanning, 3D scan data
 *
 * 7. .ptx - Leica Point Cloud
 *    - Features: Laser scan point clouds, high-density data
 *    - Use cases: Engineering surveys, building scans
 *
 * 8. .pts/.xyz - Simple point cloud formats
 *    - Features: Lightweight, text format (X Y Z [R G B])
 *    - Use cases: Quick testing, data exchange
 *
 * 3D printing formats:
 * 9. .stl - Stereolithography
 *    - Features: 3D printing standard, simple mesh
 *    - Use cases: 3D printing preprocessing, mesh inspection
 *
 * CAD formats:
 * 10. .step/.stp - STEP (ISO 10303)
 *    - Features: Professional CAD exchange, parametric geometry
 *    - Use cases: Engineering design, assemblies
 *    - Note: Recommended to convert to GLTF or OBJ in CAD software first
 *
 * 11. .igs/.iges - IGES format
 *    - Features: CAD data exchange, precise geometry
 *    - Use cases: Industrial design, mechanical manufacturing
 *    - Note: Recommended to convert to GLTF or OBJ in CAD software first
 *
 * Apple AR formats:
 * 12. .usdz/.usd - Pixar USD format
 *    - Features: Recommended by Apple, AR/VR support, compressed
 *    - Use cases: Augmented reality, cross-platform applications
 *
 * Other formats:
 * 13. .3ds - 3D Studio Max
 *    - Features: Classic format, animation support (older)
 *    - Use cases: Legacy project compatibility
 *
 * 14. .vtp - VTK Polydata
 *    - Features: Scientific computing format, mesh data
 *    - Use cases: Numerical simulation, scientific visualization
 *
 * Complete format list:
 * .glb, .gltf, .obj, .fbx, .dae, .stl, .ply, .spz, .splat, .ksplat, .sog,
 * .ptx, .pts, .xyz, .usdz, .usd, .3ds, .step, .stp, .igs, .iges, .vtp
 */

/**
 * Features
 *
 * 1. 3D preview:
 *    - Full-screen preview mode
 *    - Real-time rendering
 *    - Automatic scaling and centering
 *
 * 2. Interactive controls:
 *    - Mouse drag: Rotate the model
 *    - Mouse wheel: Zoom in/out
 *    - Reset button: Restore the default view
 *
 * 3. Animation support:
 *    - Automatically plays glTF/FBX animations
 *    - Animation mixer management
 *
 * 4. Gaussian splats:
 *    - Integrates the Spark library for Gaussian splat rendering
 *    - Supports multiple splat formats
 *    - Dynamic lighting and material editing
 *
 * 5. Downloading:
 *    - Supports direct downloads of the original model file
 */

/**
 * How to add a 3D node to a workflow
 *
 * 1. Register it in the nodes list:
 *    import 3DNode from "@/components/workspace/nodes/modal/3d-node";
 *
 *    // Add it to nodeTypes
 *    const nodeTypes = {
 *      "3d-model": 3DNode,
 *      // ... other node types
 *    };
 *
 * 2. Specify the type and data when creating the node in the workflow:
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
 * Tech stack
 *
 * - Three.js (r181): 3D rendering engine
 *   - GLTFLoader: Loads glTF/GLB files
 *   - OBJLoader: Loads OBJ files
 *   - FBXLoader: Loads FBX files
 *   - Built-in Mesh, Light, Camera, and more
 *
 * - Spark (@sparkjsdev/spark): Gaussian splat rendering
 *   - Built on top of Three.js
 *   - Specially optimized point cloud rendering
 *   - Supports GPU acceleration
 *
 * - React: Component framework
 *   - hooks for state management
 *   - useRef for DOM/Object3D references
 *
 * - XYFlow: Node editing framework
 *   - Handle: Node connection point
 *   - Position: Positioning enum
 */

/**
 * Performance optimization
 *
 * 1. Lazy loading: Load the Spark library only when needed
 * 2. Caching: Use useR2AsyncLoader for file caching
 * 3. Memory management:
 *    - Properly handle renderer.dispose()
 *    - Clean up event listeners
 *    - Cancel animation frames
 * 4. Rendering optimization:
 *    - Adaptive resolution
 *    - Cached automatic scaling calculation
 */

/**
 * Error handling
 *
 * 1. Unsupported formats: Show a friendly error message
 * 2. Load failures: Show error information and retry options
 * 3. Missing dependencies: Degrade gracefully (for example, when Spark is unavailable)
 */

export { gltfNodeData, splatNodeData, objNodeData, fbxNodeData };
