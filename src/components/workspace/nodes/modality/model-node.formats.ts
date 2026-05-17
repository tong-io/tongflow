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
        description:
            "Recommended format. Supports animation, materials, and compression.",
        features: [
            "Animation",
            "PBR materials",
            "Lightweight",
            "Cross-platform",
        ],
        loader: "GLTFLoader",
    },

    gltf: {
        name: "glTF (Embedded JSON)",
        extension: ".gltf",
        description: "Text form of glTF; good for editing and debugging.",
        features: ["Animation", "PBR materials", "Easy to edit"],
        loader: "GLTFLoader",
    },

    obj: {
        name: "Wavefront OBJ",
        extension: ".obj",
        description: "Classic mesh format; widely supported.",
        features: ["Simple meshes", "Broad compatibility", "Lightweight"],
        loader: "OBJLoader",
    },

    fbx: {
        name: "Autodesk FBX",
        extension: ".fbx",
        description:
            "Professional 3D format; supports skeletons and animation.",
        features: [
            "Skeletal animation",
            "Morph targets",
            "Materials",
            "Complex topology",
        ],
        loader: "FBXLoader",
    },

    // Point cloud formats
    ply: {
        name: "Polygon File Format",
        extension: ".ply",
        description: "Point cloud and mesh format; supports color and normals.",
        features: ["Point cloud", "Color info", "Normal data"],
        loader: "PLYLoader",
    },

    ptx: {
        name: "Leica Point Cloud",
        extension: ".ptx",
        description: "Laser-scan point cloud format.",
        features: ["High-density point cloud", "Scan data", "XYZ + RGB"],
        loader: "PointCloudLoader (Custom)",
    },

    pts: {
        name: "Simple Point Cloud",
        extension: ".pts",
        description: "Simple point cloud format (X Y Z R G B).",
        features: ["Lightweight point cloud", "XYZ coordinates", "RGB color"],
        loader: "PointCloudLoader (Custom)",
    },

    xyz: {
        name: "XYZ Point Cloud",
        extension: ".xyz",
        description: "Simple point cloud format (X Y Z).",
        features: ["Basic point cloud", "Simple format"],
        loader: "PointCloudLoader (Custom)",
    },

    // Gaussian splat formats
    spz: {
        name: "Scaniverse Splat",
        extension: ".spz",
        description: "Compressed Gaussian splat format.",
        features: ["High quality", "Fast rendering", "Compressed"],
        loader: "SplatMesh (Spark)",
    },

    splat: {
        name: "Splat Format",
        extension: ".splat",
        description: "Gaussian splat format (Antimatter15).",
        features: ["Gaussian splat", "Photorealistic rendering"],
        loader: "SplatMesh (Spark)",
    },

    ksplat: {
        name: "Gaussian Splat",
        extension: ".ksplat",
        description: "Gaussian splat format (mkkellogg).",
        features: ["Gaussian splat", "Optimized variant"],
        loader: "SplatMesh (Spark)",
    },

    sog: {
        name: "PlayCanvas Splat",
        extension: ".sog",
        description: "PlayCanvas Gaussian splat format.",
        features: ["Gaussian splat", "Web-optimized"],
        loader: "SplatMesh (Spark)",
    },

    // 3D printing formats
    stl: {
        name: "Stereolithography",
        extension: ".stl",
        description: "Common 3D printing format.",
        features: ["3D printing", "Simple meshes", "Binary / ASCII"],
        loader: "STLLoader",
    },

    // CAD formats
    step: {
        name: "STEP (ISO 10303)",
        extension: ".step / .stp",
        description: "Professional CAD interchange format.",
        features: ["Parametric geometry", "Assemblies", "Precise data"],
        note: "Requires dedicated library support; convert to GLTF or OBJ recommended.",
    },

    iges: {
        name: "IGES",
        extension: ".igs / .iges",
        description: "CAD file interchange format.",
        features: ["CAD data", "Precise geometry"],
        note: "Requires dedicated library support; convert to GLTF or OBJ recommended.",
    },

    // Model formats
    dae: {
        name: "COLLADA",
        extension: ".dae",
        description: "COLLADA 3D format.",
        features: ["Animation", "Materials", "Cross-platform"],
        loader: "ColladaLoader",
    },

    usdz: {
        name: "USD Zip",
        extension: ".usdz",
        description: "USD compressed format (Apple's recommendation for AR).",
        features: ["AR / VR", "Compressed", "Cross-platform"],
        loader: "USDZLoader",
    },

    usd: {
        name: "Pixar USD",
        extension: ".usd",
        description: "Pixar Universal Scene Description format.",
        features: ["Complex scenes", "Parametric", "Version control"],
        loader: "USDZLoader",
    },

    tds: {
        name: "3D Studio Max",
        extension: ".3ds",
        description: "3DS Max model format.",
        features: ["Animation", "Materials", "Legacy format"],
        loader: "TDSLoader",
    },

    vtp: {
        name: "VTK Polydata",
        extension: ".vtp",
        description: "VTK polygon format.",
        features: ["Scientific computing", "Mesh data"],
        loader: "VTKLoader",
    },
};

// ============================================================================
// Format categories
// ============================================================================

const FORMAT_CATEGORIES = {
    recommended: {
        description: "Best compatibility and feature support",
        formats: [".glb", ".gltf"],
    },

    general3D: {
        description: "Widely supported general-purpose formats",
        formats: [".fbx", ".obj", ".dae"],
    },

    pointCloud: {
        description: "For point cloud data",
        formats: [".ply", ".ptx", ".pts", ".xyz"],
    },

    gaussianSplat: {
        description:
            "Next-generation high-quality rendering format (requires the Spark library)",
        formats: [".spz", ".splat", ".ksplat", ".sog"],
    },

    cad: {
        description: "Engineering design and manufacturing files",
        formats: [".step", ".stp", ".igs", ".iges"],
        note: "Convert to GLTF for the best support.",
    },

    "3DPrinting": {
        description: "3D-printing-related formats",
        formats: [".stl"],
    },

    AppleAR: {
        description: "Apple's recommended AR format",
        formats: [".usdz"],
    },

    academic: {
        description: "Academic and scientific-computing formats",
        formats: [".vtp", ".usd"],
    },

    legacy: {
        description: "Still supported but no longer recommended",
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
    bestGeneralPurpose: ".glb",
    bestPointCloud: ".ply",
    bestPhotogrammetry: ".spz (Gaussian Splat)",
    "3DPrinting": ".stl",
    web: ".glb or .gltf",
    mobileAR: ".glb or .usdz",
    gameEngine: ".fbx or .glb",
    professionalCAD: ".step (convert to .glb)",
    pointCloudVisualization: ".ply or .ptx",
    smallestFileSize: ".glb (compressed)",
};

// ============================================================================
// Troubleshooting
// ============================================================================

const TROUBLESHOOTING = {
    formatUnsupported: {
        solution:
            "Convert the file to a supported format (.glb is recommended).",
    },

    fileFailedToLoad: {
        causes: [
            "Network failure during download",
            "Corrupted file",
            "Wrong format",
        ],
        solution:
            "Validate the file and try re-converting or re-exporting from the source software.",
    },

    colorsOrMaterialsMissing: {
        causes: [
            "The format does not support textures",
            "Incorrect export settings",
            "Missing referenced texture files",
        ],
        solution:
            "Use a format that supports materials (such as .glb), or ensure all assets are exported correctly.",
    },

    modelNotFullyVisible: {
        causes: ["Model is very large or very small", "Camera framing issue"],
        solution:
            "Auto-fit handles most cases; use the mouse controls to adjust the view manually.",
    },

    animationNotPlaying: {
        causes: [
            "The format does not support animation",
            "Animation was not included on export",
        ],
        solution:
            "Use a format that supports animation (.glb, .fbx) and ensure the animation is exported.",
    },
};

export {
    SUPPORTED_FORMATS,
    FORMAT_CATEGORIES,
    RECOMMENDATIONS,
    TROUBLESHOOTING,
};
