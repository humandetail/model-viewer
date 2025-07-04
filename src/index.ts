import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'
import { GUI } from 'three/addons/libs/lil-gui.module.min.js'
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js'
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js'

// 创建场景
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x1E3A5F)
scene.fog = new THREE.Fog(0x1A1A2E, 10, 100)

// 创建相机
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000)
camera.position.set(0, 2, 10)

// 创建渲染器
const renderer = new THREE.WebGLRenderer({
  antialias: true,
})
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setPixelRatio(window.devicePixelRatio)
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap

document.querySelector('#app')!.appendChild(renderer.domElement)

// 添加轨道控制器
const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true
controls.dampingFactor = 0.05

// 添加灯光
const ambientLight = new THREE.AmbientLight(0xFFFFFF, 0.6)
scene.add(ambientLight)

const directionalLight = new THREE.DirectionalLight(0xFFFFFF, 0.8)
directionalLight.position.set(5, 10, 7)
directionalLight.castShadow = true
directionalLight.shadow.mapSize.width = 1024
directionalLight.shadow.mapSize.height = 1024
scene.add(directionalLight)

const hemisphereLight = new THREE.HemisphereLight(0xFFFFBB, 0x080820, 0.5)
scene.add(hemisphereLight)

// 添加点光源
const pointLight = new THREE.PointLight(0xFF7F50, 1, 100)
pointLight.position.set(-5, 5, 5)
pointLight.castShadow = true
scene.add(pointLight)

// 添加网格地面
const gridHelper = new THREE.GridHelper(20, 20, 0x4ECDC4, 0x2A5A2A)
gridHelper.position.y = 0
scene.add(gridHelper)

// 添加坐标轴
const axesHelper = new THREE.AxesHelper(5)
scene.add(axesHelper)

// 加载器
const gltfLoader = new GLTFLoader()
const fbxLoader = new FBXLoader()
const objLoader = new OBJLoader()
const mtlLoader = new MTLLoader()

let loadedModel: THREE.Object3D | null = null
let gui: GUI | null = null
let pendingMTLFile: File | null = null
let mixer: THREE.AnimationMixer | null = null // 用于FBX动画

// 显示状态信息
const statusElement = document.getElementById('status')

function showStatus(message: string) {
  statusElement!.querySelector('span')!.textContent = message
  statusElement!.classList.remove('hidden')
}

function hideStatus() {
  statusElement!.classList.add('hidden')
}

function animate() {
  requestAnimationFrame(animate)

  // 更新动画混合器
  if (mixer) {
    mixer.update(0.0167) // 假设60FPS，每帧16.7ms
  }

  controls.update()
  renderer.render(scene, camera)
}
animate()

// 初始化GUI
function initGUI(name: string, material: THREE.Material) {
  if (!material || !('color' in material))
    return

  if (!gui) {
    gui = new GUI()
  }

  const colorConfig = {
    color: `#${(material.color as THREE.Color).getHexString()}`,
  }

  const folder = gui.addFolder(name)
  folder.addColor(colorConfig, 'color').name('颜色').onChange((value) => {
    (material.color as THREE.Color).set(value)
  })
  folder.open()
}

// 清理旧模型和GUI
function clearScene() {
  if (loadedModel) {
    scene.remove(loadedModel)
    loadedModel.traverse((obj: any) => {
      if (obj.isMesh) {
        if (obj.geometry)
          obj.geometry.dispose()
        if (obj.material) {
          if (Array.isArray(obj.material)) {
            obj.material.forEach((mat: any) => mat.dispose())
          }
          else {
            obj.material.dispose()
          }
        }
      }
    })
    loadedModel = null
  }

  if (gui) {
    gui.destroy()
    gui = null
  }

  if (mixer) {
    mixer.stopAllAction()
    mixer = null
  }

  THREE.Cache.clear()
}

// 加载OBJ模型（带MTL支持）
async function loadOBJWithMTL(objFile: File, mtlFile?: File | null) {
  return new Promise<THREE.Group>((resolve, reject) => {
    const objReader = new FileReader()

    objReader.onload = async () => {
      try {
        const objContent = objReader.result as string

        if (mtlFile) {
          const mtlReader = new FileReader()
          mtlReader.onload = () => {
            try {
              const mtlContent = mtlReader.result as string
              const materials = mtlLoader.parse(mtlContent, '')
              materials.preload()

              objLoader.setMaterials(materials)
              const object = objLoader.parse(objContent)
              resolve(object)
            }
            catch (error) {
              reject(error)
            }
          }
          mtlReader.readAsText(mtlFile)
        }
        else {
          const object = objLoader.parse(objContent)
          resolve(object)
        }
      }
      catch (error) {
        reject(error)
      }
    }

    objReader.readAsText(objFile)
  })
}

// 加载模型统一入口
async function loadModelFromFile(file: File) {
  showStatus(`正在加载 ${file.name}...`)
  clearScene()

  const ext = file.name.toLowerCase().split('.').pop()

  try {
    if (ext === 'mtl') {
      pendingMTLFile = file
      hideStatus()
      // eslint-disable-next-line no-alert
      alert('请接着上传对应的 .obj 文件')
      return
    }

    if (ext === 'obj') {
      const mtlFile = pendingMTLFile
      pendingMTLFile = null

      const object = await loadOBJWithMTL(file, mtlFile)
      loadedModel = object
      scene.add(object)
      setupModel(object)
      hideStatus()
      return
    }

    const reader = new FileReader()

    if (ext === 'glb' || ext === 'gltf') {
      reader.onload = (e) => {
        const arrayBuffer = e.target!.result!
        gltfLoader.parse(arrayBuffer, '', (gltf) => {
          loadedModel = gltf.scene
          scene.add(loadedModel)

          // 处理GLTF动画
          if (gltf.animations && gltf.animations.length > 0) {
            mixer = new THREE.AnimationMixer(loadedModel)
            const action = mixer.clipAction(gltf.animations[0])
            action.play()
          }

          setupModel(loadedModel)
          hideStatus()
        }, (error) => {
          console.error('GLTF加载错误:', error)
          hideStatus()
          // eslint-disable-next-line no-alert
          alert(`GLTF加载错误: ${error.message}`)
        })
      }
      reader.readAsArrayBuffer(file)
    }
    else if (ext === 'fbx') {
      reader.onload = (e) => {
        const buffer = e.target!.result!

        try {
          const model = fbxLoader.parse(buffer, '')
          loadedModel = model
          scene.add(model)

          // 处理FBX动画
          if (model.animations && model.animations.length > 0) {
            mixer = new THREE.AnimationMixer(model)
            const action = mixer.clipAction(model.animations[0])
            action.play()
          }

          setupModel(model)
          hideStatus()
        }
        catch (parseError: any) {
          console.error('FBX解析错误:', parseError)
          hideStatus()
          // eslint-disable-next-line no-alert
          alert(`FBX解析错误: ${parseError?.message ?? ''}`)
        }
      }
      reader.readAsArrayBuffer(file)
    }
    else {
      hideStatus()
      // eslint-disable-next-line no-alert
      alert('暂不支持该文件类型')
    }
  }
  catch (error: any) {
    console.error('模型加载失败:', error)
    hideStatus()
    // eslint-disable-next-line no-alert
    alert(`模型加载失败: ${error?.message ?? ''}`)
  }
}

// 设置模型
function setupModel(object: THREE.Object3D) {
  // 计算包围盒
  const bbox = new THREE.Box3().setFromObject(object)
  const size = new THREE.Vector3()
  bbox.getSize(size)

  // 计算合适的缩放比例
  const maxSize = Math.max(size.x, size.y, size.z)
  const scaleFactor = maxSize > 0 ? 2 / maxSize : 1

  object.scale.set(scaleFactor, scaleFactor, scaleFactor)

  // 居中模型
  const center = new THREE.Vector3()
  bbox.getCenter(center)
  object.position.sub(center.multiplyScalar(scaleFactor))

  // 调整相机位置
  camera.position.set(0, size.y * scaleFactor, size.z * scaleFactor * 1.5)
  camera.lookAt(object.position)
  controls.target.copy(object.position)
  controls.update()

  // eslint-disable-next-line no-console
  console.log(`模型加载成功: ${object.constructor.name}`)
  // eslint-disable-next-line no-console
  console.log(`原始尺寸: x=${size.x.toFixed(2)}, y=${size.y.toFixed(2)}, z=${size.z.toFixed(2)}`)
  // eslint-disable-next-line no-console
  console.log(`应用缩放: ${scaleFactor.toFixed(4)}`)

  // 遍历设置材质和阴影
  object.traverse((child: any) => {
    if (child.isMesh) {
      child.castShadow = true
      child.receiveShadow = true

      // 添加默认材质（如果没有材质）
      if (!child.material || (Array.isArray(child.material) && child.material.length === 0)) {
        console.warn('模型缺少材质，添加默认材质')
        child.material = new THREE.MeshStandardMaterial({
          color: 0x8888FF,
          roughness: 0.8,
          metalness: 0.2,
        })
      }

      // 初始化材质GUI
      const material = child.material
      if (Array.isArray(material)) {
        material.forEach((m, i) => {
          if (m && 'color' in m)
            initGUI(`${child.name || '材质'}-${i}`, m)
        })
      }
      else if (material && 'color' in material) {
        initGUI(child.name || '材质', material)
      }
    }
  })
}

// 导出GLB
function exportGLB() {
  if (!loadedModel) {
    // eslint-disable-next-line no-alert
    alert('模型还没加载完成！')
    return
  }

  showStatus('正在导出模型...')

  const exporter = new GLTFExporter()
  exporter.parse(loadedModel, (result) => {
    if (!(result instanceof ArrayBuffer)) {
      console.error('导出失败，结果不是ArrayBuffer')
      hideStatus()
      return
    }

    const blob = new Blob([result], { type: 'application/octet-stream' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'exported_model.glb'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    setTimeout(() => {
      URL.revokeObjectURL(url)
      hideStatus()
    }, 1000)
  }, (err) => {
    console.error('导出失败', err)
    hideStatus()
    // eslint-disable-next-line no-alert
    alert(`导出失败: ${err.message}`)
  }, { binary: true })
}

// 文件上传事件
const fileInput = document.getElementById('fileInput')
fileInput!.addEventListener('change', (e) => {
  const file = (e.target as HTMLInputElement).files![0]
  if (file) {
    loadModelFromFile(file)
  }
})

// 导出按钮事件
const exportBtn = document.getElementById('exportBtn')
exportBtn!.addEventListener('click', exportGLB)

// 窗口大小调整
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})
