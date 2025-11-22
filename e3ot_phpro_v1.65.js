(function(Scratch) {
  'use strict';

  class ThreeDExtension {
    constructor() {
      this.scene = null;
      this.camera = null;
      this.renderer = null;
      this.objects = new Map();
      this.nextObjectId = 1;
      this.isInitialized = false;
      this.container = null;
      this.positionUpdateInterval = null;
      this.stageElement = null;
      this.stageCanvas = null;
      this.compositeCanvas = null;
      this.compositeContext = null;
      this.renderOrder = 'overlay';
      this.currentBlendMode = 'source-over';
      this.current3DOpacity = 0.9;
      this.lights = new Map();
      this.nextLightId = 1;
      this.animationId = null;
      this.threeJSLoaded = false;
      this.gltfLoaderLoaded = false;
      this.GLTFLoader = null;
      this.initPromise = null;
      this.zIndexMode = 'auto';
      this.enable3D = true;
      this.resizeObserver = null;
      
      // 物理エンジン関連
      this.cannonLoaded = false;
      this.world = null;
      this.physicsBodies = new Map(); // objectId -> { body, mesh, _originalMass }
      this.physicsEnabled = false;
      this.timeStep = 1/60;
      this.debugMeshes = new Map();
      
      // 当たり判定関連
      this.collisionPairs = new Set();
      this.collisionHistory = new Map();
      this.lastCollisionPartner = new Map();
      
      // 3Dモデルアセット管理
      this.modelAssets = new Map();
      this.nextAssetId = 1;
      
      this.loadThreeJS();
      this.loadCannonJS();
    }

    async loadThreeJS() {
      if (typeof THREE !== 'undefined') {
        this.threeJSLoaded = true;
        return Promise.resolve();
      }
      
      return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
        script.onload = () => {
          console.log('Three.js loaded successfully');
          this.threeJSLoaded = true;
          resolve();
        };
        script.onerror = () => {
          console.error('Failed to load Three.js');
          reject(new Error('Three.js failed to load'));
        };
        document.head.appendChild(script);
      });
    }

    async loadCannonJS() {
      if (typeof CANNON !== 'undefined') {
        this.cannonLoaded = true;
        return Promise.resolve();
      }
      
      return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/cannon.js/0.6.2/cannon.min.js';
        script.onload = () => {
          console.log('Cannon.js loaded successfully');
          this.cannonLoaded = true;
          resolve();
        };
        script.onerror = () => {
          console.error('Failed to load Cannon.js');
          reject(new Error('Cannon.js failed to load'));
        };
        document.head.appendChild(script);
      });
    }

    async loadGLTFLoader() {
      if (this.gltfLoaderLoaded) return Promise.resolve();
      
      return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js';
        script.onload = () => {
          console.log('GLTFLoader loaded successfully');
          this.GLTFLoader = THREE.GLTFLoader;
          this.gltfLoaderLoaded = true;
          resolve();
        };
        script.onerror = () => {
          console.error('Failed to load GLTFLoader');
          reject(new Error('GLTFLoader failed to load'));
        };
        document.head.appendChild(script);
      });
    }

    async waitForThreeJS() {
      if (this.threeJSLoaded) return;
      
      let attempts = 0;
      while (!this.threeJSLoaded && attempts < 100) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
        if (typeof THREE !== 'undefined') {
          this.threeJSLoaded = true;
          break;
        }
      }
      
      if (!this.threeJSLoaded) {
        throw new Error('Three.js loading timeout');
      }
    }

    async waitForCannonJS() {
      if (this.cannonLoaded) return;
      
      let attempts = 0;
      while (!this.cannonLoaded && attempts < 100) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
        if (typeof CANNON !== 'undefined') {
          this.cannonLoaded = true;
          break;
        }
      }
      
      if (!this.cannonLoaded) {
        throw new Error('Cannon.js loading timeout');
      }
    }

    async waitForGLTFLoader() {
      if (this.gltfLoaderLoaded) return;
      
      let attempts = 0;
      while (!this.gltfLoaderLoaded && attempts < 100) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
        if (typeof THREE.GLTFLoader !== 'undefined') {
          this.gltfLoaderLoaded = true;
          break;
        }
      }
      
      if (!this.gltfLoaderLoaded) {
        throw new Error('GLTFLoader loading timeout');
      }
    }

    getInfo() {
      return {
        id: 'threedee',
        name: '3D表示+物理+衝突',
        color1: '#FF6B6B',
        color2: '#FF5252',
        blocks: [
          {
            opcode: 'init',
            blockType: Scratch.BlockType.COMMAND,
            text: '3Dを初期化する'
          },
          '---',
          {
            opcode: 'addCube',
            blockType: Scratch.BlockType.COMMAND,
            text: '立方体を追加 サイズ [SIZE] 色 [COLOR]',
            arguments: {
              SIZE: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1
              },
              COLOR: {
                type: Scratch.ArgumentType.COLOR,
                defaultValue: '#ff0000'
              }
            }
          },
          {
            opcode: 'addSphere',
            blockType: Scratch.BlockType.COMMAND,
            text: '球体を追加 半径 [RADIUS] 色 [COLOR]',
            arguments: {
              RADIUS: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1
              },
              COLOR: {
                type: Scratch.ArgumentType.COLOR,
                defaultValue: '#00ff00'
              }
            }
          },
          {
            opcode: 'addCylinder',
            blockType: Scratch.BlockType.COMMAND,
            text: '円柱を追加 半径 [RADIUS] 高さ [HEIGHT] 色 [COLOR]',
            arguments: {
              RADIUS: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1
              },
              HEIGHT: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 2
              },
              COLOR: {
                type: Scratch.ArgumentType.COLOR,
                defaultValue: '#0000ff'
              }
            }
          },
          {
            opcode: 'addPlane',
            blockType: Scratch.BlockType.COMMAND,
            text: '平面を追加 幅 [WIDTH] 高さ [HEIGHT] 色 [COLOR]',
            arguments: {
              WIDTH: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 2
              },
              HEIGHT: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 2
              },
              COLOR: {
                type: Scratch.ArgumentType.COLOR,
                defaultValue: '#ffff00'
              }
            }
          },
          '---',
          {
            opcode: 'loadModelFile',
            blockType: Scratch.BlockType.COMMAND,
            text: '3Dモデルファイルを読み込み 名前 [NAME]',
            arguments: {
              NAME: {
                type: Scratch.ArgumentType.STRING,
                defaultValue: 'mymodel'
              }
            }
          },
          {
            opcode: 'addModelFromAsset',
            blockType: Scratch.BlockType.COMMAND,
            text: 'アセット [ASSET_ID] からモデルを追加 スケール [SCALE] 色 [COLOR] 透明度 [OPACITY] 明るさ [BRIGHTNESS]',
            arguments: {
              // 変更: menu: 'modelAssets'を削除し、typeをNUMBERに変更
              ASSET_ID: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1
              },
              SCALE: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1
              },
              COLOR: {
                type: Scratch.ArgumentType.STRING,
                menu: 'colorOptions',
                defaultValue: 'default'
              },
              OPACITY: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1
              },
              BRIGHTNESS: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0
              }
            }
          },
          {
            opcode: 'addModel',
            blockType: Scratch.BlockType.COMMAND,
            text: 'URLからモデルを追加 URL [URL] スケール [SCALE] 色 [COLOR] 透明度 [OPACITY] 明るさ [BRIGHTNESS]',
            arguments: {
              URL: {
                type: Scratch.ArgumentType.STRING,
                defaultValue: 'https://example.com/model.gltf'
              },
              SCALE: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1
              },
              COLOR: {
                type: Scratch.ArgumentType.STRING,
                menu: 'colorOptions',
                defaultValue: 'default'
              },
              OPACITY: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1
              },
              BRIGHTNESS: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0
              }
            }
          },
          '---',
          {
            opcode: 'enablePhysics',
            blockType: Scratch.BlockType.COMMAND,
            text: '物理エンジンを [ENABLE] にする',
            arguments: {
              ENABLE: {
                type: Scratch.ArgumentType.STRING,
                menu: 'enableOptions',
                defaultValue: 'on'
              }
            }
          },
          {
            opcode: 'setGravity',
            blockType: Scratch.BlockType.COMMAND,
            text: '重力を x:[X] y:[Y] z:[Z] にする',
            arguments: {
              X: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0
              },
              Y: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: -9.82
              },
              Z: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0
              }
            }
          },
          {
            opcode: 'addPhysicsToObject',
            blockType: Scratch.BlockType.COMMAND,
            text: 'オブジェクト [ID] に物理を追加 種類 [TYPE] 質量 [MASS] 形状 [SHAPE]',
            arguments: {
              ID: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1
              },
              TYPE: {
                type: Scratch.ArgumentType.STRING,
                menu: 'physicsTypes',
                defaultValue: 'dynamic'
              },
              MASS: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1
              },
              SHAPE: {
                type: Scratch.ArgumentType.STRING,
                menu: 'physicsShapes',
                defaultValue: 'box'
              }
            }
          },
          {
            opcode: 'setObjectPhysicsType',
            blockType: Scratch.BlockType.COMMAND,
            text: 'オブジェクト [ID] の物理タイプを [TYPE] にする',
            arguments: {
              ID: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1
              },
              TYPE: {
                type: Scratch.ArgumentType.STRING,
                menu: 'physicsTypes',
                defaultValue: 'dynamic'
              }
            }
          },
          {
            opcode: 'removePhysicsFromObject',
            blockType: Scratch.BlockType.COMMAND,
            text: 'オブジェクト [ID] から物理を削除',
            arguments: {
              ID: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1
              }
            }
          },
          {
            opcode: 'setObjectVelocity',
            blockType: Scratch.BlockType.COMMAND,
            text: 'オブジェクト [ID] の速度を x:[X] y:[Y] z:[Z] にする',
            arguments: {
              ID: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1
              },
              X: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0
              },
              Y: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0
              },
              Z: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0
              }
            }
          },
          {
            opcode: 'applyForce',
            blockType: Scratch.BlockType.COMMAND,
            text: 'オブジェクト [ID] に力を加える x:[X] y:[Y] z:[Z]',
            arguments: {
              ID: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1
              },
              X: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0
              },
              Y: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 10
              },
              Z: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0
              }
            }
          },
          {
            opcode: 'applyImpulse',
            blockType: Scratch.BlockType.COMMAND,
            text: 'オブジェクト [ID] に衝撃を加える x:[X] y:[Y] z:[Z]',
            arguments: {
              ID: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1
              },
              X: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0
              },
              Y: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 5
              },
              Z: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0
              }
            }
          },
          {
            opcode: 'setObjectMass',
            blockType: Scratch.BlockType.COMMAND,
            text: 'オブジェクト [ID] の質量を [MASS] にする',
            arguments: {
              ID: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1
              },
              MASS: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1
              }
            }
          },
          {
            opcode: 'setObjectFriction',
            blockType: Scratch.BlockType.COMMAND,
            text: 'オブジェクト [ID] の摩擦を [FRICTION] にする',
            arguments: {
              ID: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1
              },
              FRICTION: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0.3
              }
            }
          },
          {
            opcode: 'setObjectRestitution',
            blockType: Scratch.BlockType.COMMAND,
            text: 'オブジェクト [ID] の反発係数を [RESTITUTION] にする',
            arguments: {
              ID: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1
              },
              RESTITUTION: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0.3
              }
            }
          },
          {
            opcode: 'setCollisionSize',
            blockType: Scratch.BlockType.COMMAND,
            text: 'オブジェクト [ID] の当たり判定サイズを x:[X] y:[Y] z:[Z] にする',
            arguments: {
              ID: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1
              },
              X: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1
              },
              Y: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1
              },
              Z: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1
              }
            }
          },
          {
            opcode: 'getCollisionSize',
            blockType: Scratch.BlockType.REPORTER,
            text: 'オブジェクト [ID] の当たり判定サイズ [AXIS]',
            arguments: {
              ID: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1
              },
              AXIS: {
                type: Scratch.ArgumentType.STRING,
                menu: 'axes',
                defaultValue: 'x'
              }
            }
          },
          {
            opcode: 'showCollisionBox',
            blockType: Scratch.BlockType.COMMAND,
            text: 'オブジェクト [ID] の当たり判定を表示 [SHOW]',
            arguments: {
              ID: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1
              },
              SHOW: {
                type: Scratch.ArgumentType.STRING,
                menu: 'enableOptions',
                defaultValue: 'on'
              }
            }
          },
          '---',
          {
            opcode: 'isColliding',
            blockType: Scratch.BlockType.BOOLEAN,
            text: 'オブジェクト [ID1] と [ID2] が衝突している',
            arguments: {
              ID1: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1
              },
              ID2: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 2
              }
            }
          },
          {
            opcode: 'isCollidingWithAny',
            blockType: Scratch.BlockType.BOOLEAN,
            text: 'オブジェクト [ID] が何かと衝突している',
            arguments: {
              ID: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1
              }
            }
          },
          {
            opcode: 'getLastCollisionPartner',
            blockType: Scratch.BlockType.REPORTER,
            text: 'オブジェクト [ID] が最後に衝突した相手のID',
            arguments: {
              ID: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1
              }
            }
          },
          {
            opcode: 'clearCollisionHistory',
            blockType: Scratch.BlockType.COMMAND,
            text: '衝突リストをクリア'
          },
          '---',
          {
            opcode: 'setObjectPosition',
            blockType: Scratch.BlockType.COMMAND,
            text: 'オブジェクト [ID] の位置を x:[X] y:[Y] z:[Z] にする',
            arguments: {
              ID: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1
              },
              X: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0
              },
              Y: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0
              },
              Z: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0
              }
            }
          },
          {
            opcode: 'moveObject',
            blockType: Scratch.BlockType.COMMAND,
            text: 'オブジェクト [ID] を x:[X] y:[Y] z:[Z] だけ移動',
            arguments: {
              ID: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1
              },
              X: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0
              },
              Y: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0
              },
              Z: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0
              }
            }
          },
          {
            opcode: 'setObjectRotation',
            blockType: Scratch.BlockType.COMMAND,
            text: 'オブジェクト [ID] の向きを x:[X] y:[Y] z:[Z] 度にする',
            arguments: {
              ID: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1
              },
              X: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0
              },
              Y: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0
              },
              Z: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0
              }
            }
          },
          {
            opcode: 'rotateObject',
            blockType: Scratch.BlockType.COMMAND,
            text: 'オブジェクト [ID] を x:[X] y:[Y] z:[Z] 度回転',
            arguments: {
              ID: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1
              },
              X: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0
              },
              Y: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0
              },
              Z: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0
              }
            }
          },
          {
            opcode: 'setObjectScale',
            blockType: Scratch.BlockType.COMMAND,
            text: 'オブジェクト [ID] の大きさを x:[X] y:[Y] z:[Z] 倍にする',
            arguments: {
              ID: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1
              },
              X: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1
              },
              Y: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1
              },
              Z: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1
              }
            }
          },
          {
            opcode: 'setObjectColor',
            blockType: Scratch.BlockType.COMMAND,
            text: 'オブジェクト [ID] の色を [COLOR] にする',
            arguments: {
              ID: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1
              },
              COLOR: {
                type: Scratch.ArgumentType.COLOR,
                defaultValue: '#ff0000'
              }
            }
          },
          {
            opcode: 'setObjectOpacity',
            blockType: Scratch.BlockType.COMMAND,
            text: 'オブジェクト [ID] の透明度を [OPACITY] にする',
            arguments: {
              ID: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1
              },
              OPACITY: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1
              }
            }
          },
          {
            opcode: 'setObjectBrightness',
            blockType: Scratch.BlockType.COMMAND,
            text: 'オブジェクト [ID] の明るさを [BRIGHTNESS] にする',
            arguments: {
              ID: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1
              },
              BRIGHTNESS: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0
              }
            }
          },
          {
            opcode: 'removeObject',
            blockType: Scratch.BlockType.COMMAND,
            text: 'オブジェクト [ID] を削除',
            arguments: {
              ID: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1
              }
            }
          },
          '---',
          {
            opcode: 'setCameraPosition',
            blockType: Scratch.BlockType.COMMAND,
            text: 'カメラの位置を x:[X] y:[Y] z:[Z] にする',
            arguments: {
              X: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0
              },
              Y: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0
              },
              Z: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 5
              }
            }
          },
          {
            opcode: 'moveCamera',
            blockType: Scratch.BlockType.COMMAND,
            text: 'カメラを x:[X] y:[Y] z:[Z] だけ移動',
            arguments: {
              X: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0
              },
              Y: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0
              },
              Z: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0
              }
            }
          },
          {
            opcode: 'setCameraRotation',
            blockType: Scratch.BlockType.COMMAND,
            text: 'カメラの向きを x:[X] y:[Y] z:[Z] 度にする',
            arguments: {
              X: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0
              },
              Y: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0
              },
              Z: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0
              }
            }
          },
          {
            opcode: 'lookAtObject',
            blockType: Scratch.BlockType.COMMAND,
            text: 'カメラでオブジェクト [ID] を見る',
            arguments: {
              ID: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1
              }
            }
          },
          {
            opcode: 'lookAtPosition',
            blockType: Scratch.BlockType.COMMAND,
            text: 'カメラで位置 x:[X] y:[Y] z:[Z] を見る',
            arguments: {
              X: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0
              },
              Y: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0
              },
              Z: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0
              }
            }
          },
          '---',
          {
            opcode: 'set3DDepth',
            blockType: Scratch.BlockType.COMMAND,
            text: '3Dの表示位置を [DEPTH] にする',
            arguments: {
              DEPTH: {
                type: Scratch.ArgumentType.STRING,
                menu: 'depthModes',
                defaultValue: 'front'
              }
            }
          },
          {
            opcode: 'set3DOpacity',
            blockType: Scratch.BlockType.COMMAND,
            text: '3Dの透明度を [OPACITY] にする',
            arguments: {
              OPACITY: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0.9
              }
            }
          },
          {
            opcode: 'setBlendMode',
            blockType: Scratch.BlockType.COMMAND,
            text: '3Dの合成モードを [MODE] にする',
            arguments: {
              MODE: {
                type: Scratch.ArgumentType.STRING,
                menu: 'blendModes',
                defaultValue: 'normal'
              }
            }
          },
          {
            opcode: 'enable3DRendering',
            blockType: Scratch.BlockType.COMMAND,
            text: '3D描画を [ENABLE] にする',
            arguments: {
              ENABLE: {
                type: Scratch.ArgumentType.STRING,
                menu: 'enableOptions',
                defaultValue: 'on'
              }
            }
          },
          '---',
          {
            opcode: 'addLight',
            blockType: Scratch.BlockType.COMMAND,
            text: '[TYPE] ライトを追加 色 [COLOR] 強度 [INTENSITY]',
            arguments: {
              TYPE: {
                type: Scratch.ArgumentType.STRING,
                menu: 'lightTypes',
                defaultValue: 'directional'
              },
              COLOR: {
                type: Scratch.ArgumentType.COLOR,
                defaultValue: '#ffffff'
              },
              INTENSITY: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1
              }
            }
          },
          {
            opcode: 'setLightPosition',
            blockType: Scratch.BlockType.COMMAND,
            text: 'ライト [ID] の位置を x:[X] y:[Y] z:[Z] にする',
            arguments: {
              ID: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 3
              },
              X: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1
              },
              Y: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1
              },
              Z: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1
              }
            }
          },
          '---',
          {
            opcode: 'removeModelAsset',
            blockType: Scratch.BlockType.COMMAND,
            text: 'アセット [ASSET_ID] を削除',
            arguments: {
              // 変更: menu: 'modelAssets'を削除し、typeをNUMBERに変更
              ASSET_ID: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1
              }
            }
          },
          {
            opcode: 'listModelAssets',
            blockType: Scratch.BlockType.REPORTER,
            text: 'モデルアセット一覧'
          },
          {
            opcode: 'getModelAssetName',
            blockType: Scratch.BlockType.REPORTER,
            text: 'アセット [ASSET_ID] の名前',
            arguments: {
              // 変更: menu: 'modelAssets'を削除し、typeをNUMBERに変更
              ASSET_ID: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1
              }
            }
          },
          {
            opcode: 'exportProjectData',
            blockType: Scratch.BlockType.REPORTER,
            text: 'プロジェクトデータを書き出し'
          },
          {
            opcode: 'importProjectData',
            blockType: Scratch.BlockType.COMMAND,
            text: 'プロジェクトデータを読み込み [DATA]',
            arguments: {
              DATA: {
                type: Scratch.ArgumentType.STRING,
                defaultValue: ''
              }
            }
          },
          '---',
          {
            opcode: 'getObjectCount',
            blockType: Scratch.BlockType.REPORTER,
            text: 'オブジェクト数'
          },
          {
            opcode: 'getLastObjectId',
            blockType: Scratch.BlockType.REPORTER,
            text: '最後に作成したオブジェクトのID'
          },
          {
            opcode: 'getObjectPosition',
            blockType: Scratch.BlockType.REPORTER,
            text: 'オブジェクト [ID] の [AXIS] 座標',
            arguments: {
              ID: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1
              },
              AXIS: {
                type: Scratch.ArgumentType.STRING,
                menu: 'axes',
                defaultValue: 'x'
              }
            }
          },
          {
            opcode: 'getObjectVelocity',
            blockType: Scratch.BlockType.REPORTER,
            text: 'オブジェクト [ID] の [AXIS] 速度',
            arguments: {
              ID: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1
              },
              AXIS: {
                type: Scratch.ArgumentType.STRING,
                menu: 'axes',
                defaultValue: 'x'
              }
            }
          },
          {
            opcode: 'getCameraPosition',
            blockType: Scratch.BlockType.REPORTER,
            text: 'カメラの [AXIS] 座標',
            arguments: {
              AXIS: {
                type: Scratch.ArgumentType.STRING,
                menu: 'axes',
                defaultValue: 'x'
              }
            }
          },
          '---',
          {
            opcode: 'clearScene',
            blockType: Scratch.BlockType.COMMAND,
            text: 'すべての3Dオブジェクトを削除'
          },
          {
            opcode: 'pause3D',
            blockType: Scratch.BlockType.COMMAND,
            text: '3D描画を一時停止'
          },
          {
            opcode: 'resume3D',
            blockType: Scratch.BlockType.COMMAND,
            text: '3D描画を再開'
          }
        ],
        menus: {
          depthModes: {
            acceptReporters: false,
            items: [
              { text: '最前面', value: 'front' },
              { text: '最背面', value: 'back' },
              { text: 'スプライトの後ろ', value: 'behind' }
            ]
          },
          blendModes: {
            acceptReporters: false,
            items: [
              { text: '通常', value: 'normal' },
              { text: '乗算', value: 'multiply' },
              { text: 'スクリーン', value: 'screen' },
              { text: 'オーバーレイ', value: 'overlay' },
              { text: 'ソフトライト', value: 'soft-light' },
              { text: 'ハードライト', value: 'hard-light' },
              { text: '差', value: 'difference' },
              { text: '除外', value: 'exclusion' }
            ]
          },
          enableOptions: {
            acceptReporters: false,
            items: [
              { text: 'オン', value: 'on' },
              { text: 'オフ', value: 'off' }
            ]
          },
          lightTypes: {
            acceptReporters: false,
            items: [
              { text: '平行光源', value: 'directional' },
              { text: '点光源', value: 'point' },
              { text: '環境光', value: 'ambient' }
            ]
          },
          axes: {
            acceptReporters: false,
            items: [
              { text: 'x', value: 'x' },
              { text: 'y', value: 'y' },
              { text: 'z', value: 'z' }
            ]
          },
          colorOptions: {
            acceptReporters: true,
            items: [
              { text: '元の色', value: 'default' },
              { text: 'カスタム', value: 'custom' }
            ]
          },
          physicsShapes: {
            acceptReporters: false,
            items: [
              { text: '箱型', value: 'box' },
              { text: '球型', value: 'sphere' },
              { text: '円柱型', value: 'cylinder' },
              { text: '平面型', value: 'plane' },
              { text: 'メッシュ (静的)', value: 'trimesh' }
            ]
          },
          physicsTypes: {
            acceptReporters: false,
            items: [
              { text: '動的', value: 'dynamic' },
              { text: '静的', value: 'static' }
            ]
          }
        }
      };
    }

    // 削除: _getModelAssetItems() メソッドは使用されなくなったため削除しました

    initPhysicsWorld() {
      if (this.world) return;
      
      this.world = new CANNON.World();
      this.world.gravity.set(0, -9.82, 0);
      this.world.broadphase = new CANNON.NaiveBroadphase();
      this.world.solver.iterations = 10;
      
      this.world.addEventListener('beginContact', (event) => {
        this.handleCollision(event);
      });
      
      this.world.addEventListener('endContact', (event) => {
        this.handleCollisionEnd(event);
      });
      
      console.log('Physics world initialized with collision detection');
    }

    handleCollision(event) {
      const bodyA = event.bodyA;
      const bodyB = event.bodyB;
      
      let idA = null;
      let idB = null;
      
      for (const [id, physicsData] of this.physicsBodies) {
        if (physicsData.body === bodyA) idA = id;
        if (physicsData.body === bodyB) idB = id;
      }
      
      if (idA !== null && idB !== null) {
        const pairKey = idA < idB ? `${idA}-${idB}` : `${idB}-${idA}`;
        this.collisionPairs.add(pairKey);
        
        if (!this.collisionHistory.has(idA)) {
          this.collisionHistory.set(idA, []);
        }
        if (!this.collisionHistory.has(idB)) {
          this.collisionHistory.set(idB, []);
        }
        
        if (!this.collisionHistory.get(idA).includes(idB)) {
          this.collisionHistory.get(idA).push(idB);
        }
        if (!this.collisionHistory.get(idB).includes(idA)) {
          this.collisionHistory.get(idB).push(idA);
        }
        
        this.lastCollisionPartner.set(idA, idB);
        this.lastCollisionPartner.set(idB, idA);
        
        console.log(`Collision detected: Object ${idA} <-> Object ${idB}`);
      }
    }

    handleCollisionEnd(event) {
      const bodyA = event.bodyA;
      const bodyB = event.bodyB;
      
      let idA = null;
      let idB = null;
      
      for (const [id, physicsData] of this.physicsBodies) {
        if (physicsData.body === bodyA) idA = id;
        if (physicsData.body === bodyB) idB = id;
      }
      
      if (idA !== null && idB !== null) {
        const pairKey = idA < idB ? `${idA}-${idB}` : `${idB}-${idA}`;
        this.collisionPairs.delete(pairKey);
        
        console.log(`Collision ended: Object ${idA} <-> Object ${idB}`);
      }
    }

    isColliding(args) {
      const id1 = Scratch.Cast.toNumber(args.ID1);
      const id2 = Scratch.Cast.toNumber(args.ID2);
      
      const pairKey = id1 < id2 ? `${id1}-${id2}` : `${id2}-${id1}`;
      return this.collisionPairs.has(pairKey);
    }

    isCollidingWithAny(args) {
      const id = Scratch.Cast.toNumber(args.ID);
      
      const history = this.collisionHistory.get(id);
      if (!history || history.length === 0) return false;
      
      for (const pairKey of this.collisionPairs) {
        const [id1, id2] = pairKey.split('-').map(Number);
        if (id1 === id || id2 === id) {
          return true;
        }
      }
      
      return false;
    }

    getLastCollisionPartner(args) {
      const id = Scratch.Cast.toNumber(args.ID);
      return this.lastCollisionPartner.get(id) || 0;
    }

    clearCollisionHistory() {
      this.collisionPairs.clear();
      this.collisionHistory.clear();
      this.lastCollisionPartner.clear();
      console.log('Collision history cleared');
    }

    enablePhysics(args) {
      const enable = args.ENABLE === 'on';
      this.physicsEnabled = enable;
      
      if (enable && !this.world) {
        this.initPhysicsWorld();
      }
      
      console.log('Physics engine:', enable ? 'ON' : 'OFF');
    }

    setGravity(args) {
      if (!this.world) {
        this.initPhysicsWorld();
      }
      
      this.world.gravity.set(
        Scratch.Cast.toNumber(args.X),
        Scratch.Cast.toNumber(args.Y),
        Scratch.Cast.toNumber(args.Z)
      );
      
      console.log('Gravity set to:', this.world.gravity);
    }

    // [MODIFIED] Function updated to handle shape offsets and improved trimesh
    addPhysicsToObject(args) {
        if (!this.isInitialized || !this.world) return;
    
        const id = Scratch.Cast.toNumber(args.ID);
        let type = args.TYPE;
        const userInputMass = Scratch.Cast.toNumber(args.MASS);
        const shapeType = args.SHAPE;
    
        const mesh = this.objects.get(id);
        if (!mesh) {
            console.warn('Object not found:', id);
            return;
        }
    
        if (this.physicsBodies.has(id)) {
            this.removePhysicsFromObject({ ID: id }); // 既存の物理を削除
        }
    
        // 質量を設定
        let mass = 0;
        if (type === 'static') {
            mass = 0;
            // Trimeshは静的ボディでのみサポート
            if (shapeType === 'trimesh' && type !== 'static') {
                console.warn('Trimesh shape is only supported for STATIC bodies. Forcing type to static.');
                type = 'static';
            }
        } else {
            mass = userInputMass > 0 ? userInputMass : 1; // Dynamic bodies must have mass > 0
        }
    
        // [MODIFIED] Calculate bounding box and its center offset
        const box = new THREE.Box3().setFromObject(mesh);
        const size = new THREE.Vector3();
        box.getSize(size);
        const sphereBounds = new THREE.Sphere();
        box.getBoundingSphere(sphereBounds);
        const boxCenter = new THREE.Vector3();
        box.getCenter(boxCenter);
    
        // Calculate the local offset from the object's origin (mesh.position)
        const localOffset = new THREE.Vector3().subVectors(boxCenter, mesh.position);
        const cannonOffset = new CANNON.Vec3(localOffset.x, localOffset.y, localOffset.z);
        let cannonQuat = null; // Store local rotation for trimesh
    
        let shape;
        if (shapeType === 'box') {
            shape = new CANNON.Box(new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2));
        } else if (shapeType === 'sphere') {
            const radius = sphereBounds.radius;
            shape = new CANNON.Sphere(radius);
        } else if (shapeType === 'cylinder') {
            const radius = Math.max(size.x, size.z) / 2;
            const height = size.y;
            shape = new CANNON.Cylinder(radius, radius, height, 16);
        } else if (shapeType === 'plane') {
            shape = new CANNON.Plane();
            cannonOffset.set(0, 0, 0); // Plane's offset is handled by rotation, not position
        } else if (shapeType === 'trimesh') {
            let targetMesh = mesh;
            let foundMesh = false;
            
            // モデルがGroupの場合、最初のMeshを探す
            if (mesh.isGroup) {
                mesh.traverse((child) => {
                    if (!foundMesh && child instanceof THREE.Mesh) {
                        targetMesh = child;
                        foundMesh = true;
                    }
                });
            }

            if (!targetMesh.geometry || !targetMesh.geometry.attributes.position) {
                console.warn('Trimesh requires a mesh with position geometry data.');
                shape = new CANNON.Box(new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2));
                type = 'static'; // ジオメトリがない場合は静的なBoxにフォールバック
            } else {
                const positions = targetMesh.geometry.attributes.position.array;
                const indices = targetMesh.geometry.index ? targetMesh.geometry.index.array : null;
                const vertices = [];
                for (let i = 0; i < positions.length; i += 3) {
                    vertices.push(positions[i], positions[i+1], positions[i+2]);
                }
                
                let indicesArray = [];
                if (indices) {
                    indicesArray = Array.from(indices);
                } else {
                    for (let i = 0; i < vertices.length / 3; i++) { indicesArray[i] = i; }
                }

                // Apply the target mesh's WORLD scale to the vertices
                const worldScale = new THREE.Vector3();
                targetMesh.getWorldScale(worldScale);
                const scaledVertices = new Float32Array(vertices.length);
                for(let i = 0; i < vertices.length; i += 3) {
                    scaledVertices[i] = vertices[i] * worldScale.x;
                    scaledVertices[i+1] = vertices[i+1] * worldScale.y;
                    scaledVertices[i+2] = vertices[i+2] * worldScale.z;
                }
    
                shape = new CANNON.Trimesh(scaledVertices, indicesArray);
    
                // Calculate the trimesh's local offset and rotation relative to the BODY (mesh)
                const meshWorldPos = new THREE.Vector3();
                mesh.getWorldPosition(meshWorldPos);
                const meshWorldQuat = new THREE.Quaternion();
                mesh.getWorldQuaternion(meshWorldQuat);
                const meshWorldQuatInv = meshWorldQuat.clone().invert();
    
                const targetWorldPos = new THREE.Vector3();
                targetMesh.getWorldPosition(targetWorldPos);
                const targetWorldQuat = new THREE.Quaternion();
                targetMesh.getWorldQuaternion(targetWorldQuat);
    
                // localPos = targetWorldPos - meshWorldPos, then rotate by meshInvQuat
                const localPosVec3 = new THREE.Vector3().subVectors(targetWorldPos, meshWorldPos);
                localPosVec3.applyQuaternion(meshWorldQuatInv);
                cannonOffset.set(localPosVec3.x, localPosVec3.y, localPosVec3.z);
    
                // localQuat = meshInvQuat * targetQuat
                const localQuatQuat = meshWorldQuatInv.clone().multiply(targetWorldQuat);
                cannonQuat = new CANNON.Quaternion(localQuatQuat.x, localQuatQuat.y, localQuatQuat.z, localQuatQuat.w);
            }
        } else {
            // 他の形状もフォールバックとしてBoxを使用
            shape = new CANNON.Box(new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2));
        }

        // [MODIFIED] Create body *without* shape
        const body = new CANNON.Body({
            mass: mass,
            position: new CANNON.Vec3(mesh.position.x, mesh.position.y, mesh.position.z),
            quaternion: new CANNON.Quaternion().setFromEuler(
                mesh.rotation.x,
                mesh.rotation.y,
                mesh.rotation.z
            ),
            type: type === 'dynamic' ? CANNON.Body.DYNAMIC : CANNON.Body.STATIC,
            material: new CANNON.Material(),
        });

        // Add shape with offset and local rotation
        body.addShape(shape, cannonOffset, cannonQuat);

        this.world.addBody(body);
        
        this.physicsBodies.set(id, {
            body: body,
            mesh: mesh,
            _originalMass: userInputMass
        });
        
        console.log(`Physics added to object ${id}. Type: ${type}, Mass: ${mass}, Shape: ${shapeType}`);
    }

    setObjectPhysicsType(args) {
        if (!this.isInitialized || !this.world) return;

        const id = Scratch.Cast.toNumber(args.ID);
        const type = args.TYPE;
        const physicsData = this.physicsBodies.get(id);

        if (!physicsData) {
            console.warn('No physics body found for object:', id);
            return;
        }

        const newType = type === 'dynamic' ? CANNON.Body.DYNAMIC : CANNON.Body.STATIC;
        physicsData.body.type = newType;

        // 質量を再設定
        if (newType === CANNON.Body.STATIC) {
            physicsData.body.mass = 0;
            physicsData.body.updateMassProperties();
        } else {
            // 以前設定された質量があればそれを使用、なければ1
            physicsData.body.mass = physicsData._originalMass > 0 ? physicsData._originalMass : 1;
            physicsData.body.updateMassProperties();
        }
        
        console.log(`Object ${id} physics type set to: ${type}`);
    }

    removePhysicsFromObject(args) {
        if (!this.isInitialized || !this.world) return;
        
        const id = Scratch.Cast.toNumber(args.ID);
        const physicsData = this.physicsBodies.get(id);
        
        if (!physicsData) {
            console.warn('No physics body found for object:', id);
            return;
        }
        
        this.world.removeBody(physicsData.body);
        this.physicsBodies.delete(id);
        this.collisionHistory.delete(id);
        this.lastCollisionPartner.delete(id);
        
        const pairsToDelete = [];
        for (const pairKey of this.collisionPairs) {
            const [id1, id2] = pairKey.split('-').map(Number);
            if (id1 === id || id2 === id) {
                pairsToDelete.push(pairKey);
            }
        }
        pairsToDelete.forEach(key => this.collisionPairs.delete(key));
        
        const debugMesh = this.debugMeshes.get(id);
        if (debugMesh) {
            this.scene.remove(debugMesh);
            this.debugMeshes.delete(id);
        }
        
        console.log(`Physics removed from object ${id}`);
    }

    setObjectVelocity(args) {
        const id = Scratch.Cast.toNumber(args.ID);
        const physicsData = this.physicsBodies.get(id);
        
        if (!physicsData) {
            console.warn('No physics body found for object:', id);
            return;
        }
        
        physicsData.body.velocity.set(
            Scratch.Cast.toNumber(args.X),
            Scratch.Cast.toNumber(args.Y),
            Scratch.Cast.toNumber(args.Z)
        );
    }

    applyForce(args) {
        const id = Scratch.Cast.toNumber(args.ID);
        const physicsData = this.physicsBodies.get(id);
        
        if (!physicsData) {
            console.warn('No physics body found for object:', id);
            return;
        }
        
        const force = new CANNON.Vec3(
            Scratch.Cast.toNumber(args.X),
            Scratch.Cast.toNumber(args.Y),
            Scratch.Cast.toNumber(args.Z)
        );
        physicsData.body.applyForce(force);
    }

    applyImpulse(args) {
        const id = Scratch.Cast.toNumber(args.ID);
        const physicsData = this.physicsBodies.get(id);
        
        if (!physicsData) {
            console.warn('No physics body found for object:', id);
            return;
        }
        
        const impulse = new CANNON.Vec3(
            Scratch.Cast.toNumber(args.X),
            Scratch.Cast.toNumber(args.Y),
            Scratch.Cast.toNumber(args.Z)
        );
        physicsData.body.applyImpulse(impulse);
    }

    setObjectMass(args) {
        const id = Scratch.Cast.toNumber(args.ID);
        const mass = Scratch.Cast.toNumber(args.MASS);
        const physicsData = this.physicsBodies.get(id);
        
        if (!physicsData) {
            console.warn('No physics body found for object:', id);
            return;
        }
        
        physicsData._originalMass = mass; // 元の質量を保存
        
        if (physicsData.body.type === CANNON.Body.STATIC) {
            console.warn('Cannot set mass for a static body. Change type to dynamic first.');
            return;
        }

        physicsData.body.mass = mass > 0 ? mass : 1;
        physicsData.body.updateMassProperties();
        
        console.log(`Object ${id} mass set to: ${physicsData.body.mass}`);
    }

    setObjectFriction(args) {
        const id = Scratch.Cast.toNumber(args.ID);
        const friction = Scratch.Cast.toNumber(args.FRICTION);
        const physicsData = this.physicsBodies.get(id);
        
        if (!physicsData) {
            console.warn('No physics body found for object:', id);
            return;
        }

        // 摩擦を設定 (デフォルトのマテリアルを使用)
        physicsData.body.material.friction = friction;

        console.log(`Object ${id} friction set to: ${friction}`);
    }

    setObjectRestitution(args) {
        const id = Scratch.Cast.toNumber(args.ID);
        const restitution = Scratch.Cast.toNumber(args.RESTITUTION);
        const physicsData = this.physicsBodies.get(id);
        
        if (!physicsData) {
            console.warn('No physics body found for object:', id);
            return;
        }

        // 反発係数を設定 (デフォルトのマテリアルを使用)
        physicsData.body.material.restitution = restitution;

        console.log(`Object ${id} restitution set to: ${restitution}`);
    }

    setCollisionSize(args) {
        const id = Scratch.Cast.toNumber(args.ID);
        const physicsData = this.physicsBodies.get(id);
        
        if (!physicsData) {
            console.warn('No physics body found for object:', id);
            return;
        }

        const shape = physicsData.body.shapes[0];
        if (!shape) {
            console.warn('No collision shape found for object:', id);
            return;
        }

        // 形状のサイズを変更
        if (shape instanceof CANNON.Box) {
            shape.halfExtents.set(
                Scratch.Cast.toNumber(args.X) / 2,
                Scratch.Cast.toNumber(args.Y) / 2,
                Scratch.Cast.toNumber(args.Z) / 2
            );
            shape.updateConvexPolyhedronRepresentation();
        } else if (shape instanceof CANNON.Sphere) {
            shape.radius = Math.max(
                Scratch.Cast.toNumber(args.X) / 2,
                Scratch.Cast.toNumber(args.Y) / 2,
                Scratch.Cast.toNumber(args.Z) / 2
            );
        } else if (shape instanceof CANNON.Cylinder) {
            // 円柱の場合、X/Zは半径、Yは高さ
            shape.radiusTop = Scratch.Cast.toNumber(args.X) / 2;
            shape.radiusBottom = Scratch.Cast.toNumber(args.X) / 2;
            shape.height = Scratch.Cast.toNumber(args.Y);
        } else if (shape instanceof CANNON.Trimesh) {
            console.warn("Cannot resize Trimesh shape at runtime. Remove and re-add physics.");
            return;
        }
        
        shape.updateBoundingSphereRadius();
        physicsData.body.updateBoundingRadius();
    }

    getCollisionSize(args) {
        const id = Scratch.Cast.toNumber(args.ID);
        const physicsData = this.physicsBodies.get(id);
        if (!physicsData) return 0;
        
        const shape = physicsData.body.shapes[0];
        if (!shape) return 0;
        
        const axis = args.AXIS;
        
        if (shape instanceof CANNON.Box) {
            switch (axis) {
                case 'x': return shape.halfExtents.x * 2;
                case 'y': return shape.halfExtents.y * 2;
                case 'z': return shape.halfExtents.z * 2;
                default: return 0;
            }
        } else if (shape instanceof CANNON.Sphere) {
            return shape.radius;
        } else if (shape instanceof CANNON.Cylinder) {
            switch (axis) {
                case 'x': return shape.radiusTop * 2;
                case 'y': return shape.height;
                case 'z': return shape.radiusTop * 2;
                default: return 0;
            }
        } else if (shape instanceof CANNON.Trimesh) {
            shape.updateAABB();
            const aabb = shape.aabb;
            switch (axis) {
                case 'x': return aabb.upperBound.x - aabb.lowerBound.x;
                case 'y': return aabb.upperBound.y - aabb.lowerBound.y;
                case 'z': return aabb.upperBound.z - aabb.lowerBound.z;
                default: return 0;
            }
        }
        
        return 0;
    }

    showCollisionBox(args) {
        const id = Scratch.Cast.toNumber(args.ID);
        const show = args.SHOW === 'on';
        const physicsData = this.physicsBodies.get(id);
        
        if (!physicsData) {
            console.warn('No physics body for object:', id);
            return;
        }
        
        let debugMesh = this.debugMeshes.get(id);
        
        if (show) {
            if (!debugMesh) {
                const shape = physicsData.body.shapes[0];
                if (!shape) return;

                let geometry;
                if (shape instanceof CANNON.Box) {
                    geometry = new THREE.BoxGeometry(
                        shape.halfExtents.x * 2,
                        shape.halfExtents.y * 2,
                        shape.halfExtents.z * 2
                    );
                } else if (shape instanceof CANNON.Sphere) {
                    geometry = new THREE.SphereGeometry(shape.radius, 16, 16);
                } else if (shape instanceof CANNON.Cylinder) {
                    geometry = new THREE.CylinderGeometry(shape.radiusTop, shape.radiusBottom, shape.height, 16);
                } else if (shape instanceof CANNON.Plane) {
                    geometry = new THREE.PlaneGeometry(100, 100); // 視覚化のため大きなサイズ
                } else if (shape instanceof CANNON.Trimesh) {
                    const vertices = shape.vertices;
                    const indices = shape.indices;
                    geometry = new THREE.BufferGeometry();
                    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
                    geometry.setIndex(new THREE.BufferAttribute(new Uint16Array(indices), 1));
                    geometry.computeBoundingBox();
                } else {
                    return;
                }

                const material = new THREE.MeshBasicMaterial({
                    color: 0x00ff00,
                    wireframe: true,
                    transparent: true,
                    opacity: 0.5,
                    depthTest: false
                });
                
                debugMesh = new THREE.Mesh(geometry, material);
                this.scene.add(debugMesh);
                this.debugMeshes.set(id, debugMesh);
                console.log(`Collision box shown for object ${id}`);
            }
            debugMesh.visible = true;
        } else {
            if (debugMesh) {
                debugMesh.visible = false;
                console.log(`Collision box hidden for object ${id}`);
            }
        }
    }

    getObjectCount() {
      return this.objects.size;
    }

    getLastObjectId() {
      return this.nextObjectId - 1;
    }

    getObjectPosition(args) {
      if (!this.isInitialized) return 0;
      const id = Scratch.Cast.toNumber(args.ID);
      const obj = this.objects.get(id);
      if (!obj) return 0;
      
      const axis = args.AXIS;
      switch (axis) {
        case 'x': return obj.position.x;
        case 'y': return obj.position.y;
        case 'z': return obj.position.z;
        default: return 0;
      }
    }

    getObjectVelocity(args) {
      if (!this.world) return 0;
      const id = Scratch.Cast.toNumber(args.ID);
      const physicsData = this.physicsBodies.get(id);
      if (!physicsData) return 0;

      const axis = args.AXIS;
      switch (axis) {
        case 'x': return physicsData.body.velocity.x;
        case 'y': return physicsData.body.velocity.y;
        case 'z': return physicsData.body.velocity.z;
        default: return 0;
      }
    }

    getCameraPosition(args) {
      if (!this.isInitialized) return 0;
      const axis = args.AXIS;
      switch (axis) {
        case 'x': return this.camera.position.x;
        case 'y': return this.camera.position.y;
        case 'z': return this.camera.position.z;
        default: return 0;
      }
    }

    // [MODIFIED] Update physics debug mesh to account for offset
    updatePhysics() {
        if (!this.physicsEnabled || !this.world) return;
        
        this.world.step(this.timeStep);
        
        for (const [id, physicsData] of this.physicsBodies) {
            const { body, mesh } = physicsData;
            mesh.position.copy(body.position);
            mesh.quaternion.copy(body.quaternion);

            const debugMesh = this.debugMeshes.get(id);
            if (debugMesh && debugMesh.visible) {
                // [FIX] Apply the shape's local offset and rotation to the debug mesh
                const shapeOffset = body.shapeOffsets[0];
                const shapeQuat = body.shapeOrientations[0];
                
                if (shapeOffset) {
                    // Convert CANNON.Vec3 offset to THREE.Vector3 and apply body's rotation to it
                    const offset = new THREE.Vector3(shapeOffset.x, shapeOffset.y, shapeOffset.z);
                    offset.applyQuaternion(mesh.quaternion); // mesh.quaternion is body.quaternion
                    debugMesh.position.copy(mesh.position).add(offset);
                } else {
                    debugMesh.position.copy(mesh.position);
                }

                if (shapeQuat) {
                    // Combine body's rotation with shape's local rotation
                    const quat = new THREE.Quaternion(shapeQuat.x, shapeQuat.y, shapeQuat.z, shapeQuat.w);
                    debugMesh.quaternion.copy(mesh.quaternion).multiply(quat);
                } else {
                    debugMesh.quaternion.copy(mesh.quaternion);
                }
            }
        }
    }

    async loadModelFile(args) {
      await this.waitForThreeJS();
      await this.waitForGLTFLoader();
      
      const name = Scratch.Cast.toString(args.NAME) || 'model';
      
      try {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.gltf,.glb';

        input.onchange = async (event) => {
          const file = event.target.files[0];
          if (!file) {
            console.warn('ファイルが選択されていません');
            return;
          }

          try {
            const reader = new FileReader();
            const fileData = await new Promise((resolve, reject) => {
              reader.onload = () => resolve(reader.result);
              reader.onerror = () => reject(new Error('ファイル読み込みエラー'));
              reader.readAsArrayBuffer(file);
            });

            const assetId = this.nextAssetId++;
            const asset = {
              name: name,
              data: fileData,
              type: file.name.endsWith('.glb') ? 'glb' : 'gltf',
              originalName: file.name
            };
            this.modelAssets.set(assetId, asset);
            
            // this._updateModelAssetMenu(); // 削除したため不要
            console.log(`3Dモデルファイル ${file.name} をアセット ${assetId}: ${name} として読み込みました`);

          } catch (error) {
            console.error('ファイルの読み込み中にエラーが発生しました:', error);
          }
        };

        input.click();

      } catch (error) {
        console.error('モデルファイル読み込みブロックでエラーが発生しました:', error);
      }
    }

    async addModelFromAsset(args) {
      await this.init();
      if (!this.isInitialized || typeof THREE === 'undefined' || !this.GLTFLoader) return;

      const assetId = parseInt(Scratch.Cast.toString(args.ASSET_ID)) || 0;
      const asset = this.modelAssets.get(assetId);

      if (!asset) {
        console.warn(`アセットID ${assetId} が見つかりません`);
        return;
      }
      
      const scale = Scratch.Cast.toNumber(args.SCALE);
      const colorOption = Scratch.Cast.toString(args.COLOR);
      const opacity = Scratch.Cast.toNumber(args.OPACITY);
      const brightness = Scratch.Cast.toNumber(args.BRIGHTNESS);

      try {
        const loader = new this.GLTFLoader();
        const arrayBuffer = asset.data;
        
        // ArrayBufferをBlobに変換し、URLを作成して読み込む
        const blob = new Blob([arrayBuffer], { type: asset.type === 'glb' ? 'model/gltf-binary' : 'model/gltf+json' });
        const url = URL.createObjectURL(blob);

        loader.parse(arrayBuffer, url, (gltf) => {
          const model = gltf.scene;
          model.scale.set(scale, scale, scale);
          
          model.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.castShadow = true;
              child.receiveShadow = true;
              
              if (child.material) {
                // マテリアルをクローンして、オブジェクトごとに個別の設定を可能にする
                const originalMaterial = child.material;
                child.material = originalMaterial.clone();
                
                child.material.transparent = opacity < 1;
                child.material.opacity = opacity;
                
                // 明るさ (Emissive) の設定
                if (child.material.emissive) {
                  child.material.emissive.setRGB(brightness, brightness, brightness);
                } else if (child.material.color) {
                   // Emissiveがない場合はAmbientLightとColorの調整で代用 (簡易的)
                   const newColor = child.material.color.clone().multiplyScalar(1 + brightness);
                   child.material.color.set(newColor);
                }
                
                // カスタム色の設定
                if (colorOption === 'custom' && child.material.color) {
                  const color = '#ff0000'; // Fallback color
                  child.material.color.set(color);
                }
              }
            }
          });

          this.scene.add(model);
          const id = this.nextObjectId++;
          this.objects.set(id, model);
          console.log(`アセット ${asset.name} からモデルを追加しました (ID: ${id})`);
          URL.revokeObjectURL(url); // オブジェクトURLを解放
        }, undefined, (error) => {
          console.error(`GLTF/GLB parse error for asset: ${asset.name}`, error);
          URL.revokeObjectURL(url);
        });

      } catch (error) {
        console.error(`アセット読み込みエラー: ${asset.name}`, error);
      }
    }

    async addModel(args, util) {
      await this.init();
      if (!this.isInitialized || typeof THREE === 'undefined' || !this.GLTFLoader) return;

      const url = Scratch.Cast.toString(args.URL);
      const scale = Scratch.Cast.toNumber(args.SCALE);
      const colorOption = Scratch.Cast.toString(args.COLOR);
      const opacity = Scratch.Cast.toNumber(args.OPACITY);
      const brightness = Scratch.Cast.toNumber(args.BRIGHTNESS);

      try {
        const loader = new this.GLTFLoader();

        loader.load(url, (gltf) => {
          const model = gltf.scene;
          model.scale.set(scale, scale, scale);
          
          model.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.castShadow = true;
              child.receiveShadow = true;
              
              if (child.material) {
                // マテリアルをクローンして、オブジェクトごとに個別の設定を可能にする
                const originalMaterial = child.material;
                child.material = originalMaterial.clone();
                
                child.material.transparent = opacity < 1;
                child.material.opacity = opacity;
                
                // 明るさ (Emissive) の設定
                if (child.material.emissive) {
                  child.material.emissive.setRGB(brightness, brightness, brightness);
                } else if (child.material.color) {
                   // Emissiveがない場合はAmbientLightとColorの調整で代用 (簡易的)
                   const newColor = child.material.color.clone().multiplyScalar(1 + brightness);
                   child.material.color.set(newColor);
                }

                // カスタム色の設定
                if (colorOption === 'custom' && child.material.color) {
                  const color = util.colorHelper.inputToHexColor(args.COLOR);
                  child.material.color.set(color);
                }
              }
            }
          });
          
          this.scene.add(model);
          const id = this.nextObjectId++;
          this.objects.set(id, model);
          console.log(`URLからモデルを追加しました (ID: ${id})`);
        }, undefined, (error) => {
          console.error('GLTF/GLB load error:', error);
        });

      } catch (error) {
        console.error('モデル追加ブロックでエラーが発生しました:', error);
      }
    }

    removeModelAsset(args) {
      const assetId = parseInt(Scratch.Cast.toString(args.ASSET_ID)) || 0;
      if (this.modelAssets.has(assetId)) {
        const asset = this.modelAssets.get(assetId);
        this.modelAssets.delete(assetId);
        console.log(`アセット ${asset.name} (ID: ${assetId}) を削除しました`);
        // this._updateModelAssetMenu(); // 削除したため不要
      } else {
        console.warn(`アセットID ${assetId} が見つかりません`);
      }
    }

    listModelAssets() {
      const assetList = [];
      for (const [id, asset] of this.modelAssets) {
        assetList.push(`${id}: ${asset.name}`);
      }
      return assetList.join(', ') || 'アセットなし';
    }

    getModelAssetName(args) {
      const assetId = parseInt(Scratch.Cast.toString(args.ASSET_ID)) || 0;
      const asset = this.modelAssets.get(assetId);
      return asset ? asset.name : '';
    }

    exportProjectData() {
        const projectData = {
            version: '1.0',
            modelAssets: {},
            nextAssetId: this.nextAssetId
        };

        for (const [id, asset] of this.modelAssets) {
            const uint8Array = new Uint8Array(asset.data);
            const base64Data = this._arrayBufferToBase64(uint8Array);
            
            projectData.modelAssets[id] = {
                name: asset.name,
                data: base64Data,
                type: asset.type,
                originalName: asset.originalName
            };
        }

        return JSON.stringify(projectData);
    }

    importProjectData(args) {
        const dataStr = Scratch.Cast.toString(args.DATA);
        if (!dataStr) {
            console.warn('データが空です');
            return;
        }

        try {
            const projectData = JSON.parse(dataStr);
            if (!projectData.version || !projectData.modelAssets) {
                throw new Error('無効なデータ形式です');
            }

            // 既存のアセットをクリア (オプション)
            this.modelAssets.clear();
            
            for (const idStr in projectData.modelAssets) {
                const id = parseInt(idStr);
                const assetData = projectData.modelAssets[idStr];
                
                const uint8Array = this._base64ToArrayBuffer(assetData.data);
                
                this.modelAssets.set(id, {
                    name: assetData.name,
                    data: uint8Array,
                    type: assetData.type,
                    originalName: assetData.originalName
                });
            }

            this.nextAssetId = projectData.nextAssetId || 1;
            // this._updateModelAssetMenu(); // 削除したため不要
            console.log('プロジェクトデータを正常に読み込みました');

        } catch (error) {
            console.error('プロジェクトデータの読み込み中にエラーが発生しました:', error);
        }
    }

    _arrayBufferToBase64(buffer) {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    _base64ToArrayBuffer(base64) {
        const binary_string = atob(base64);
        const len = binary_string.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binary_string.charCodeAt(i);
        }
        return bytes.buffer;
    }

    async init() {
      if (this.initPromise) return this.initPromise;
      
      this.initPromise = (async () => {
        await this.waitForThreeJS();
        await this.waitForCannonJS();
        await this.loadGLTFLoader();

        if (this.isInitialized) return;

        try {
          this.scene = new THREE.Scene();
          this.camera = new THREE.PerspectiveCamera(75, 480 / 360, 0.1, 1000);
          this.camera.position.z = 5;

          this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
          this.renderer.setSize(480, 360);
          this.renderer.setClearColor(0x000000, 0);
          this.renderer.shadowMap.enabled = true;
          this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

          // デフォルトのライトを追加
          const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
          directionalLight.position.set(1, 1, 1);
          directionalLight.castShadow = true;
          this.scene.add(directionalLight);
          this.lights.set(1, directionalLight);

          const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
          this.scene.add(ambientLight);
          this.lights.set(2, ambientLight);
          this.nextLightId = 3;
          
          this.initPhysicsWorld();

          this.isInitialized = true;
          this.setupImprovedOverlay();
          this.animate();

          console.log('3D extension with physics and collision detection initialized successfully');
        } catch (error) {
          console.error('3D initialization error:', error);
          this.initPromise = null;
          throw error;
        }
      })();
      
      return this.initPromise;
    }

    setupImprovedOverlay() {
      this.findAndSetupStageElement();

      this.container = document.createElement('div');
      this.container.style.position = 'absolute';
      this.container.style.top = '0';
      this.container.style.left = '0';
      this.container.style.width = '100%';
      this.container.style.height = '100%';
      this.container.style.pointerEvents = 'none';
      this.container.style.zIndex = '10';
      this.container.style.overflow = 'hidden';

      this.renderer.domElement.style.width = '100%';
      this.renderer.domElement.style.height = '100%';
      this.renderer.domElement.style.display = 'block';

      this.container.appendChild(this.renderer.domElement);

      if (this.stageElement) {
        const parent = this.stageElement.parentElement || this.stageElement.parentNode;
        if (parent) {
          parent.style.position = 'relative';
          parent.appendChild(this.container);
        } else {
          document.body.appendChild(this.container);
        }
      } else {
        document.body.appendChild(this.container);
      }
      
      this.startImprovedSizeMonitoring();
      console.log('Improved overlay setup complete');
    }

    findAndSetupStageElement() {
      const selectors = [
        '.stage-wrapper_stage-wrapper_stage-wrapper', // Scratch 3.0
        '.stage-header_stage-menu-wrapper_stage-menu-wrapper + div > canvas' // ScratchJr or similar
      ];
      
      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element) {
          this.stageElement = element.closest('div');
          this.stageCanvas = element;
          return;
        }
      }
      
      // Fallback to find canvas if other elements fail (less reliable)
      const canvasElements = document.querySelectorAll('canvas');
      if (canvasElements.length > 0) {
        this.stageCanvas = canvasElements[0];
        this.stageElement = this.stageCanvas.parentElement;
      }

      if (!this.stageCanvas) {
        console.warn('Could not find Scratch stage canvas. 3D overlay positioning may be incorrect.');
      }
    }

    startImprovedSizeMonitoring() {
      // 既存の監視をクリア
      if (this.resizeObserver) {
        this.resizeObserver.disconnect();
        this.resizeObserver = null;
      }
      if (this.positionUpdateInterval) {
        clearInterval(this.positionUpdateInterval);
        this.positionUpdateInterval = null;
      }
      window.removeEventListener('resize', () => { setTimeout(() => this.updateSizeAndPosition(), 50); });

      if (this.stageCanvas && window.ResizeObserver) {
        this.resizeObserver = new ResizeObserver(() => {
          this.updateSizeAndPosition();
        });
        this.resizeObserver.observe(this.stageCanvas);
        if (this.stageCanvas.parentElement) {
            this.resizeObserver.observe(this.stageCanvas.parentElement);
        }
      }

      this.positionUpdateInterval = setInterval(() => {
        this.updateSizeAndPosition();
      }, 100);

      window.addEventListener('resize', () => {
        setTimeout(() => this.updateSizeAndPosition(), 50);
      });

      if (window.MutationObserver) {
          const observer = new MutationObserver((mutations) => {
              let shouldUpdate = false;
              for (const mutation of mutations) {
                  if (mutation.type === 'attributes' && (mutation.attributeName === 'style' || mutation.attributeName === 'class')) {
                      shouldUpdate = true;
                      break;
                  }
              }
              if (shouldUpdate) {
                  setTimeout(() => this.updateSizeAndPosition(), 10);
              }
          });

          if (this.stageCanvas) {
              observer.observe(this.stageCanvas, { attributes: true, attributeFilter: ['style', 'class'] });
              if (this.stageCanvas.parentElement) {
                  observer.observe(this.stageCanvas.parentElement, { attributes: true, attributeFilter: ['style', 'class'] });
              }
          }
      }
      
      setTimeout(() => this.updateSizeAndPosition(), 100);
    }

    updateSizeAndPosition() {
      if (!this.renderer || !this.camera || !this.container) return;
      
      let width = 480;
      let height = 360;
      let rect = null;

      if (this.stageCanvas) {
        rect = this.stageCanvas.getBoundingClientRect();
        width = rect.width;
        height = rect.height;
        
        width = Math.max(width, 100);
        height = Math.max(height, 100);

        const devicePixelRatio = window.devicePixelRatio || 1;
        const internalWidth = Math.floor(width * devicePixelRatio);
        const internalHeight = Math.floor(height * devicePixelRatio);

        this.renderer.setSize(internalWidth, internalHeight, false);
        this.renderer.domElement.style.width = width + 'px';
        this.renderer.domElement.style.height = height + 'px';
      } else {
        this.renderer.setSize(width, height);
        this.renderer.domElement.style.width = width + 'px';
        this.renderer.domElement.style.height = height + 'px';
      }

      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();

      this.container.style.width = width + 'px';
      this.container.style.height = height + 'px';
      
      if (rect && this.stageElement) {
        const stageRect = this.stageElement.getBoundingClientRect();
        this.container.style.transform = `translate(${rect.left - stageRect.left}px, ${rect.top - stageRect.top}px)`;
        
        // zIndexの調整
        if (this.zIndexMode === 'auto') {
            const zIndex = parseInt(this.stageCanvas.style.zIndex) || 0;
            if (this.renderOrder === 'overlay') {
                this.container.style.zIndex = Math.max(10, zIndex + 1);
            } else if (this.renderOrder === 'behind') {
                this.container.style.zIndex = Math.max(0, zIndex - 1);
            } else { // back
                this.container.style.zIndex = '0';
            }
        }
      }
    }

    animate() {
      if (!this.isInitialized || !this.enable3D) return;
      
      this.animationId = requestAnimationFrame(this.animate.bind(this));
      
      this.updatePhysics();
      this.renderer.render(this.scene, this.camera);
    }

    async addCube(args) {
      await this.init();
      if (!this.isInitialized || typeof THREE === 'undefined') return;

      const size = Scratch.Cast.toNumber(args.SIZE);
      const color = args.COLOR;

      const geometry = new THREE.BoxGeometry(size, size, size);
      const material = new THREE.MeshPhongMaterial({ 
        color: parseInt(color.slice(1), 16), 
        transparent: true, 
        opacity: 1 
      });
      
      const cube = new THREE.Mesh(geometry, material);
      cube.castShadow = true;
      cube.receiveShadow = true;
      this.scene.add(cube);
      
      const id = this.nextObjectId++;
      this.objects.set(id, cube);
      console.log(`立方体を追加しました (ID: ${id})`);
    }

    async addSphere(args) {
      await this.init();
      if (!this.isInitialized || typeof THREE === 'undefined') return;

      const radius = Scratch.Cast.toNumber(args.RADIUS);
      const color = args.COLOR;

      const geometry = new THREE.SphereGeometry(radius, 32, 32);
      const material = new THREE.MeshPhongMaterial({ 
        color: parseInt(color.slice(1), 16), 
        transparent: true, 
        opacity: 1 
      });
      
      const sphere = new THREE.Mesh(geometry, material);
      sphere.castShadow = true;
      sphere.receiveShadow = true;
      this.scene.add(sphere);
      
      const id = this.nextObjectId++;
      this.objects.set(id, sphere);
      console.log(`球体を追加しました (ID: ${id})`);
    }

    async addCylinder(args) {
      await this.init();
      if (!this.isInitialized || typeof THREE === 'undefined') return;

      const radius = Scratch.Cast.toNumber(args.RADIUS);
      const height = Scratch.Cast.toNumber(args.HEIGHT);
      const color = args.COLOR;

      const geometry = new THREE.CylinderGeometry(radius, radius, height, 32);
      const material = new THREE.MeshPhongMaterial({ 
        color: parseInt(color.slice(1), 16), 
        transparent: true, 
        opacity: 1 
      });
      
      const cylinder = new THREE.Mesh(geometry, material);
      cylinder.castShadow = true;
      cylinder.receiveShadow = true;
      this.scene.add(cylinder);
      
      const id = this.nextObjectId++;
      this.objects.set(id, cylinder);
      console.log(`円柱を追加しました (ID: ${id})`);
    }

    async addPlane(args) {
      await this.init();
      if (!this.isInitialized || typeof THREE === 'undefined') return;

      const width = Scratch.Cast.toNumber(args.WIDTH);
      const height = Scratch.Cast.toNumber(args.HEIGHT);
      const color = args.COLOR;

      const geometry = new THREE.PlaneGeometry(width, height);
      const material = new THREE.MeshPhongMaterial({ 
        color: parseInt(color.slice(1), 16), 
        transparent: true, 
        opacity: 1, 
        side: THREE.DoubleSide 
      });
      
      const plane = new THREE.Mesh(geometry, material);
      plane.castShadow = true;
      plane.receiveShadow = true;
      this.scene.add(plane);
      
      const id = this.nextObjectId++;
      this.objects.set(id, plane);
      console.log(`平面を追加しました (ID: ${id})`);
    }

    setObjectPosition(args) {
      if (!this.isInitialized) return;
      const id = Scratch.Cast.toNumber(args.ID);
      const obj = this.objects.get(id);
      if (!obj) return;

      const x = Scratch.Cast.toNumber(args.X);
      const y = Scratch.Cast.toNumber(args.Y);
      const z = Scratch.Cast.toNumber(args.Z);

      obj.position.set(x, y, z);
      
      const physicsData = this.physicsBodies.get(id);
      if (physicsData) {
        physicsData.body.position.set(x, y, z);
        physicsData.body.velocity.set(0, 0, 0);
        physicsData.body.angularVelocity.set(0, 0, 0);
      }
    }

    moveObject(args) {
      if (!this.isInitialized) return;
      const id = Scratch.Cast.toNumber(args.ID);
      const obj = this.objects.get(id);
      if (!obj) return;

      obj.position.x += Scratch.Cast.toNumber(args.X);
      obj.position.y += Scratch.Cast.toNumber(args.Y);
      obj.position.z += Scratch.Cast.toNumber(args.Z);
      
      const physicsData = this.physicsBodies.get(id);
      if (physicsData) {
        physicsData.body.position.copy(obj.position);
      }
    }

    setObjectRotation(args) {
      if (!this.isInitialized) return;
      const id = Scratch.Cast.toNumber(args.ID);
      const obj = this.objects.get(id);
      if (!obj) return;

      obj.rotation.x = Scratch.Cast.toNumber(args.X) * (Math.PI/180);
      obj.rotation.y = Scratch.Cast.toNumber(args.Y) * (Math.PI/180);
      obj.rotation.z = Scratch.Cast.toNumber(args.Z) * (Math.PI/180);
      
      const physicsData = this.physicsBodies.get(id);
      if (physicsData) {
        physicsData.body.quaternion.setFromEuler(
          obj.rotation.x,
          obj.rotation.y,
          obj.rotation.z
        );
      }
    }

    rotateObject(args) {
      if (!this.isInitialized) return;
      const id = Scratch.Cast.toNumber(args.ID);
      const obj = this.objects.get(id);
      if (!obj) return;

      obj.rotation.x += Scratch.Cast.toNumber(args.X) * (Math.PI/180);
      obj.rotation.y += Scratch.Cast.toNumber(args.Y) * (Math.PI/180);
      obj.rotation.z += Scratch.Cast.toNumber(args.Z) * (Math.PI/180);
      
      const physicsData = this.physicsBodies.get(id);
      if (physicsData) {
        physicsData.body.quaternion.setFromEuler(
          obj.rotation.x,
          obj.rotation.y,
          obj.rotation.z
        );
      }
    }

    setObjectScale(args) {
      if (!this.isInitialized) return;
      const id = Scratch.Cast.toNumber(args.ID);
      const obj = this.objects.get(id);
      if (!obj) return;

      const x = Scratch.Cast.toNumber(args.X);
      const y = Scratch.Cast.toNumber(args.Y);
      const z = Scratch.Cast.toNumber(args.Z);

      obj.scale.set(x, y, z);
    }

    setObjectColor(args) {
      if (!this.isInitialized) return;
      const id = Scratch.Cast.toNumber(args.ID);
      const obj = this.objects.get(id);
      if (!obj) return;

      const color = parseInt(args.COLOR.slice(1), 16);
      
      obj.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material) {
            // マテリアルがクローンされていなければクローン
            if (!child.material.isMaterial || (child.material.uuid === obj.material.uuid)) {
                child.material = child.material.clone();
            }

            if (child.material.color) {
                child.material.color.set(color);
            }
        }
      });
    }

    setObjectOpacity(args) {
      if (!this.isInitialized) return;
      const id = Scratch.Cast.toNumber(args.ID);
      const obj = this.objects.get(id);
      if (!obj) return;

      const opacity = Scratch.Cast.toNumber(args.OPACITY);
      
      obj.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material) {
            // マテリアルがクローンされていなければクローン
            if (!child.material.isMaterial || (child.material.uuid === obj.material.uuid)) {
                child.material = child.material.clone();
            }

            child.material.transparent = opacity < 1;
            child.material.opacity = opacity;
        }
      });
    }

    setObjectBrightness(args) {
      if (!this.isInitialized) return;
      const id = Scratch.Cast.toNumber(args.ID);
      const obj = this.objects.get(id);
      if (!obj) return;

      const brightness = Scratch.Cast.toNumber(args.BRIGHTNESS);
      
      obj.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material) {
            // マテリアルがクローンされていなければクローン
            if (!child.material.isMaterial || (child.material.uuid === obj.material.uuid)) {
                child.material = child.material.clone();
            }

            if (child.material.emissive) {
                child.material.emissive.setRGB(brightness, brightness, brightness);
            } else if (child.material.color) {
               // Emissiveがない場合はAmbientLightとColorの調整で代用 (簡易的)
               const newColor = child.material.color.clone().multiplyScalar(1 + brightness);
               child.material.color.set(newColor);
            }
        }
      });
    }

    removeObject(args) {
      if (!this.isInitialized) return;
      const id = Scratch.Cast.toNumber(args.ID);
      const obj = this.objects.get(id);
      if (!obj) return;

      // 物理エンジンから削除
      this.removePhysicsFromObject(args); 

      // シーンから削除し、ジオメトリとマテリアルをクリーンアップ
      this.scene.remove(obj);
      obj.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          if (child.geometry) {
            child.geometry.dispose();
          }
          if (Array.isArray(child.material)) {
            child.material.forEach(material => material.dispose());
          } else if (child.material) {
            child.material.dispose();
          }
        }
      });
      this.objects.delete(id);
      
      console.log(`オブジェクト ${id} を削除しました`);
    }

    setCameraPosition(args) {
      if (!this.isInitialized) return;
      this.camera.position.set(
        Scratch.Cast.toNumber(args.X),
        Scratch.Cast.toNumber(args.Y),
        Scratch.Cast.toNumber(args.Z)
      );
    }

    moveCamera(args) {
      if (!this.isInitialized) return;
      this.camera.position.x += Scratch.Cast.toNumber(args.X);
      this.camera.position.y += Scratch.Cast.toNumber(args.Y);
      this.camera.position.z += Scratch.Cast.toNumber(args.Z);
    }

    setCameraRotation(args) {
      if (!this.isInitialized) return;
      this.camera.rotation.x = Scratch.Cast.toNumber(args.X) * (Math.PI/180);
      this.camera.rotation.y = Scratch.Cast.toNumber(args.Y) * (Math.PI/180);
      this.camera.rotation.z = Scratch.Cast.toNumber(args.Z) * (Math.PI/180);
    }

    lookAtObject(args) {
      if (!this.isInitialized) return;
      const id = Scratch.Cast.toNumber(args.ID);
      const obj = this.objects.get(id);
      if (!obj) return;
      
      this.camera.lookAt(obj.position);
    }

    lookAtPosition(args) {
      if (!this.isInitialized) return;
      this.camera.lookAt(
        new THREE.Vector3(
          Scratch.Cast.toNumber(args.X),
          Scratch.Cast.toNumber(args.Y),
          Scratch.Cast.toNumber(args.Z)
        )
      );
    }

    set3DDepth(args) {
      const depth = args.DEPTH;
      this.renderOrder = (depth === 'front' ? 'overlay' : (depth === 'behind' ? 'behind' : 'back'));
      this.zIndexMode = (depth === 'front' || depth === 'behind') ? 'auto' : 'manual';
      
      if (this.container) {
          if (depth === 'front') {
              this.container.style.zIndex = '100'; // Scratch Stageの上
              this.zIndexMode = 'auto';
          } else if (depth === 'behind') {
              this.container.style.zIndex = '0'; // Scratch Stageの下
              this.zIndexMode = 'auto';
          } else { // back
              this.container.style.zIndex = '0'; // Scratch Stageの下
              this.zIndexMode = 'manual';
          }
      }
      this.updateSizeAndPosition(); // zIndexの更新をトリガー
      console.log('3D depth set to:', depth);
    }

    set3DOpacity(args) {
      const opacity = Scratch.Cast.toNumber(args.OPACITY);
      this.current3DOpacity = Math.max(0, Math.min(1, opacity));
      if (this.renderer) {
        this.renderer.domElement.style.opacity = this.current3DOpacity;
      }
    }

    setBlendMode(args) {
      const mode = args.MODE;
      const blendModeMap = {
        'normal': 'source-over',
        'multiply': 'multiply',
        'screen': 'screen',
        'overlay': 'overlay',
        'soft-light': 'soft-light',
        'hard-light': 'hard-light',
        'difference': 'difference',
        'exclusion': 'exclusion'
      };
      
      this.currentBlendMode = blendModeMap[mode] || 'source-over';
      if (this.renderer) {
        this.renderer.domElement.style.mixBlendMode = this.currentBlendMode;
      }
    }

    enable3DRendering(args) {
      const enable = args.ENABLE === 'on';
      this.enable3D = enable;
      
      if (this.container) {
          this.container.style.display = enable ? 'block' : 'none';
      }

      if (enable) {
          this.resume3D();
      } else {
          this.pause3D();
      }
      
      console.log('3D rendering:', enable ? 'ON' : 'OFF');
    }

    addLight(args) {
      if (!this.isInitialized) return;
      
      const type = args.TYPE;
      const color = parseInt(args.COLOR.slice(1), 16);
      const intensity = Scratch.Cast.toNumber(args.INTENSITY);
      
      let light;
      let lightId = this.nextLightId++;

      if (type === 'directional') {
        light = new THREE.DirectionalLight(color, intensity);
        light.position.set(1, 1, 1);
        light.castShadow = true;
      } else if (type === 'point') {
        light = new THREE.PointLight(color, intensity, 100);
        light.position.set(0, 10, 0);
        light.castShadow = true;
      } else if (type === 'ambient') {
        light = new THREE.AmbientLight(color, intensity);
      } else {
        console.warn('Unknown light type:', type);
        this.nextLightId--;
        return;
      }

      this.scene.add(light);
      this.lights.set(lightId, light);
      console.log(`${type} light added (ID: ${lightId})`);
    }

    setLightPosition(args) {
      if (!this.isInitialized) return;
      
      const id = Scratch.Cast.toNumber(args.ID);
      const light = this.lights.get(id);
      
      if (!light || !(light instanceof THREE.PointLight || light instanceof THREE.DirectionalLight)) {
        console.warn(`Light ID ${id} not found or is not a positional light.`);
        return;
      }
      
      light.position.set(
        Scratch.Cast.toNumber(args.X),
        Scratch.Cast.toNumber(args.Y),
        Scratch.Cast.toNumber(args.Z)
      );
    }

    clearScene() {
      if (!this.isInitialized) return;
      
      // オブジェクトを削除
      const idsToDelete = Array.from(this.objects.keys());
      for (const id of idsToDelete) {
        this.removeObject({ ID: id });
      }
      this.nextObjectId = 1;
      
      // ライトを削除 (デフォルトライト1, 2は残す)
      const lightsToDelete = Array.from(this.lights.keys());
      for (const id of lightsToDelete) {
        const light = this.lights.get(id);
        if (id > 2) { // Keep default lights
          this.scene.remove(light);
          this.lights.delete(id);
        }
      }
      
      // 物理エンジン関連をクリア
      if (this.world) {
          this.world = null;
          this.physicsBodies.clear();
          this.collisionPairs.clear();
          this.collisionHistory.clear();
          this.lastCollisionPartner.clear();
      }
      this.initPhysicsWorld(); // 物理ワールドを再初期化
      
      // デバッグメッシュをクリア
      const debugMeshesToDelete = Array.from(this.debugMeshes.keys());
      for (const id of debugMeshesToDelete) {
          const debugMesh = this.debugMeshes.get(id);
          this.scene.remove(debugMesh);
          this.debugMeshes.delete(id);
      }

      const defaultLights = new Map();
      if (this.lights.has(1)) defaultLights.set(1, this.lights.get(1));
      if (this.lights.has(2)) defaultLights.set(2, this.lights.get(2));
      this.lights = defaultLights;
      this.nextLightId = 3;
      
      console.log('3D scene cleared');
    }

    pause3D() {
      if (this.animationId) {
        cancelAnimationFrame(this.animationId);
        this.animationId = null;
      }
    }

    resume3D() {
      if (!this.animationId && this.isInitialized && this.enable3D) {
        this.animate();
      }
    }

    dispose() {
      this.pause3D();
      
      if (this.resizeObserver) {
        this.resizeObserver.disconnect();
        this.resizeObserver = null;
      }
      
      if (this.positionUpdateInterval) {
        clearInterval(this.positionUpdateInterval);
        this.positionUpdateInterval = null;
      }
      
      this.clearScene();
      
      if (this.renderer) {
        this.renderer.dispose();
      }
      
      if (this.container && this.container.parentNode) {
        this.container.parentNode.removeChild(this.container);
      }
      
      this.modelAssets.clear();
      this.world = null;
    }
  }

  Scratch.extensions.register(new ThreeDExtension());
})(Scratch);
