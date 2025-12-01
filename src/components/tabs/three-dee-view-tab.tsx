
"use client"

import React, { useRef, useEffect, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { useInspectionStore } from '@/store/use-inspection-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Camera, Expand, Minimize, Pin, Redo, RefreshCw } from 'lucide-react'

const getColor = (percentage: number | null, forShader = false): THREE.Color => {
    const color = new THREE.Color();
    if (percentage === null) color.set(0x888888); // Grey for ND
    else if (percentage <= 20) color.set(0xff0000); // Red
    else if (percentage <= 40) color.set(0xffa500); // Orange
    else if (percentage <= 60) color.set(0xffff00); // Yellow
    else if (percentage <= 80) color.set(0x90ee90); // LightGreen
    else color.set(0x006400); // DarkGreen
    return color;
};

export function ThreeDeeViewTab() {
  const { inspectionResult, selectedPoint, setSelectedPoint } = useInspectionStore()
  const mountRef = useRef<HTMLDivElement>(null)
  const [zScale, setZScale] = useState(5)
  const [showReference, setShowReference] = useState(true)
  const [showMinMax, setShowMinMax] = useState(true)
  const [hoveredPoint, setHoveredPoint] = useState<any>(null)
  
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const meshRef = useRef<THREE.Mesh | null>(null);
  const dataMapRef = useRef(new Map());

  useEffect(() => {
    if (!mountRef.current || !inspectionResult) return

    const { processedData, stats, nominalThickness } = inspectionResult
    const { gridSize, minThickness, maxThickness } = stats
    dataMapRef.current = new Map(processedData.map(p => [`${p.x},${p.y}`, p]))
    
    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight)
    renderer.setPixelRatio(window.devicePixelRatio)
    mountRef.current.innerHTML = ''
    mountRef.current.appendChild(renderer.domElement)

    // Scene
    const scene = new THREE.Scene()
    sceneRef.current = scene

    // Camera
    const camera = new THREE.PerspectiveCamera(60, mountRef.current.clientWidth / mountRef.current.clientHeight, 0.1, 2000)
    camera.position.set(gridSize.width * 0.9, gridSize.height * 1.2, gridSize.width * 1.4)
    cameraRef.current = camera

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(gridSize.width / 2, 0, gridSize.height / 2)
    controls.update()
    controlsRef.current = controls

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.7))
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0)
    dirLight.position.set(gridSize.width, gridSize.height * 2, gridSize.width)
    scene.add(dirLight)

    // Data texture for contour plot
    const canvas = document.createElement('canvas')
    canvas.width = gridSize.width;
    canvas.height = gridSize.height;
    const ctx = canvas.getContext('2d')!;
    
    const imgData = ctx.createImageData(gridSize.width, gridSize.height);
    for (let y = 0; y < gridSize.height; y++) {
      for (let x = 0; x < gridSize.width; x++) {
        const point = dataMapRef.current.get(`${x},${y}`);
        const color = getColor(point?.percentage ?? null);
        const i = (y * gridSize.width + x) * 4;
        imgData.data[i] = color.r * 255;
        imgData.data[i+1] = color.g * 255;
        imgData.data[i+2] = color.b * 255;
        imgData.data[i+3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);
    const dataTexture = new THREE.CanvasTexture(canvas);
    dataTexture.needsUpdate = true;


    // Bounding Box / Chart Axes
    const boxGeom = new THREE.BoxGeometry(gridSize.width, maxThickness * zScale, gridSize.height)
    const boxEdges = new THREE.EdgesGeometry(boxGeom)
    const boxLines = new THREE.LineSegments(boxEdges, new THREE.LineBasicMaterial({ color: 0xaaaaaa }))
    boxLines.position.set(gridSize.width/2, (maxThickness * zScale)/2, gridSize.height/2)
    scene.add(boxLines);

    const gridHelper = new THREE.GridHelper(Math.max(gridSize.width, gridSize.height), 10, 0x888888, 0x888888)
    gridHelper.position.set(gridSize.width / 2, 0, gridSize.height / 2)
    scene.add(gridHelper);

    // Contour plot on the floor
    const floorGeom = new THREE.PlaneGeometry(gridSize.width, gridSize.height)
    const floorMat = new THREE.MeshBasicMaterial({ map: dataTexture, side: THREE.DoubleSide })
    const floorPlane = new THREE.Mesh(floorGeom, floorMat);
    floorPlane.rotation.x = -Math.PI/2;
    floorPlane.position.set(gridSize.width/2, 0.1, gridSize.height/2);
    scene.add(floorPlane);


    // Main Asset Surface Geometry
    const geometry = new THREE.PlaneGeometry(gridSize.width, gridSize.height, gridSize.width - 1, gridSize.height - 1);
    const colors: number[] = [];

    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i) + gridSize.width / 2;
        const z_plane = positions.getZ(i) + gridSize.height / 2; // In plane geom, z is our y
        const point = dataMapRef.current.get(`${Math.round(x)},${Math.round(z_plane)}`);
        
        const thickness = point?.thickness ?? nominalThickness;
        const y_pos = thickness * zScale; // Height based on thickness
        positions.setY(i, y_pos);

        const color = getColor(point?.percentage ?? 100);
        colors.push(color.r, color.g, color.b);
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(gridSize.width / 2, 0, gridSize.height / 2);
    mesh.rotation.x = -Math.PI / 2;
    scene.add(mesh);
    meshRef.current = mesh;

    // Wireframe Overlay
    const wireframeMat = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 1, transparent: true, opacity: 0.2 });
    const wireframe = new THREE.LineSegments(new THREE.WireframeGeometry(geometry), wireframeMat);
    wireframe.rotation.x = -Math.PI / 2;
    wireframe.position.set(gridSize.width / 2, 0, gridSize.height / 2);
    scene.add(wireframe);

    // Reference Plane
    const refPlaneGeom = new THREE.PlaneGeometry(gridSize.width * 1.1, gridSize.height * 1.1);
    const refPlaneMat = new THREE.MeshStandardMaterial({ color: 0x1e90ff, transparent: true, opacity: 0.3, side: THREE.DoubleSide });
    const refPlane = new THREE.Mesh(refPlaneGeom, refPlaneMat);
    refPlane.rotation.x = -Math.PI / 2;
    refPlane.position.set(gridSize.width / 2, nominalThickness * zScale, gridSize.height / 2);
    refPlane.visible = showReference;
    scene.add(refPlane);
    
    // Min/Max Markers
    const minMaxGroup = new THREE.Group();
    const minPoint = processedData.find(p => p.thickness === minThickness)
    if(minPoint){
        const minMarker = new THREE.Mesh(new THREE.SphereGeometry(gridSize.width/100, 16, 16), new THREE.MeshBasicMaterial({color: 0xff0000}));
        minMarker.position.set(minPoint.x, minPoint.thickness * zScale, minPoint.y);
        minMaxGroup.add(minMarker);
    }
    const maxPoint = processedData.find(p => p.thickness === maxThickness)
    if(maxPoint){
        const maxMarker = new THREE.Mesh(new THREE.SphereGeometry(gridSize.width/100, 16, 16), new THREE.MeshBasicMaterial({color: 0x0000ff}));
        maxMarker.position.set(maxPoint.x, maxPoint.thickness * zScale, maxPoint.y);
        minMaxGroup.add(maxMarker);
    }
    minMaxGroup.visible = showMinMax;
    minMaxGroup.position.set(0, 0, 0);
    scene.add(minMaxGroup);
    
    // Selected Point Marker
    const selectedMarker = new THREE.Mesh(new THREE.SphereGeometry(gridSize.width/80, 16, 16), new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.9 }));
    selectedMarker.visible = false;
    scene.add(selectedMarker);
    
    const animate = () => {
      requestAnimationFrame(animate)
      controls.update()
      
      if (selectedPoint) {
          const pointData = dataMapRef.current.get(`${selectedPoint.x},${selectedPoint.y}`);
          if (pointData) {
              const thickness = pointData.thickness ?? nominalThickness;
              selectedMarker.position.set(selectedPoint.x, thickness * zScale, selectedPoint.y);
              selectedMarker.visible = true;
          }
      } else {
          selectedMarker.visible = false;
      }
      
      renderer.render(scene, camera)
    }
    animate()

    const handleResize = () => {
      if (mountRef.current) {
        camera.aspect = mountRef.current.clientWidth / mountRef.current.clientHeight
        camera.updateProjectionMatrix()
        renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight)
      }
    }
    window.addEventListener('resize', handleResize)

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onMouseMove = (event: MouseEvent) => {
        if (!mountRef.current) return;
        const rect = mountRef.current.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObject(meshRef.current!);
        
        if (intersects.length > 0) {
            const intersect = intersects[0];
            const worldPoint = intersect.point;
            
            const gridX = Math.round(worldPoint.x);
            const gridY = Math.round(worldPoint.z);
            
            const pointData = dataMapRef.current.get(`${gridX},${gridY}`);

            if (pointData) {
                 setHoveredPoint({ ...pointData, clientX: event.clientX, clientY: event.clientY });
            } else {
                 setHoveredPoint(null);
            }
        } else {
            setHoveredPoint(null);
        }
    };
    
    const onClick = (event: MouseEvent) => {
        if(hoveredPoint){
            setSelectedPoint({ x: hoveredPoint.x, y: hoveredPoint.y });
        }
    };

    mountRef.current.addEventListener('mousemove', onMouseMove);
    mountRef.current.addEventListener('click', onClick);


    return () => {
      window.removeEventListener('resize', handleResize)
      if (mountRef.current) {
        mountRef.current.removeEventListener('mousemove', onMouseMove);
        mountRef.current.removeEventListener('click', onClick);
        mountRef.current.innerHTML = ''
      }
    }
  }, [inspectionResult, zScale, showReference, showMinMax, selectedPoint, setSelectedPoint])
  
  const resetCamera = () => {
    if (cameraRef.current && controlsRef.current && inspectionResult) {
        const { gridSize } = inspectionResult.stats;
        cameraRef.current.position.set(gridSize.width * 0.9, gridSize.height * 1.2, gridSize.width * 1.4);
        controlsRef.current.target.set(gridSize.width / 2, 0, gridSize.height / 2);
        controlsRef.current.update();
    }
  }

  return (
    <div className="grid md:grid-cols-4 gap-6 h-full">
      <div className="md:col-span-3 h-full relative">
        <Card className="h-full flex flex-col">
          <CardHeader>
            <CardTitle className="font-headline">3D Surface Plot</CardTitle>
          </CardHeader>
          <CardContent className="flex-grow p-0">
            <div ref={mountRef} className="w-full h-full" />
          </CardContent>
        </Card>
        {hoveredPoint && (
          <div
            className="absolute p-2 text-xs rounded-md shadow-lg pointer-events-none bg-popover text-popover-foreground border"
            style={{
              left: `${hoveredPoint.clientX}px`,
              top: `${hoveredPoint.clientY}px`,
              transform: `translate(15px, -100%)`
            }}
          >
            <div className="font-bold">X: {hoveredPoint.x}, Y: {hoveredPoint.y}</div>
            <div>Thickness: {hoveredPoint.thickness?.toFixed(2) ?? 'ND'} mm</div>
            <div>Percentage: {hoveredPoint.percentage?.toFixed(1) ?? 'N/A'}%</div>
          </div>
        )}
      </div>
      <div className="md:col-span-1 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-headline">Controls</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <Label>Z-Axis Scale: {zScale.toFixed(1)}x</Label>
              <Slider value={[zScale]} onValueChange={([val]) => setZScale(val)} min={0.1} max={25} step={0.1} />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="ref-plane-switch" className="flex items-center gap-2"><Expand className="h-4 w-4" />Show Reference Plane</Label>
              <Switch id="ref-plane-switch" checked={showReference} onCheckedChange={setShowReference} />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="min-max-switch" className="flex items-center gap-2"><Pin className="h-4 w-4" />Show Min/Max Points</Label>
              <Switch id="min-max-switch" checked={showMinMax} onCheckedChange={setShowMinMax} />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-headline">Camera</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={resetCamera} className="col-span-2">
              <RefreshCw className="mr-2 h-4 w-4" /> Reset View
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

    