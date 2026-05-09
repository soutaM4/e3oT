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
      
      // liteから移植: 最終表示用2Dキャンバス
      this.replacementCanvas = null;
      this.replacementContext = null;

      // 「後ろ」モード時に3Dの背面に敷くレイヤー
      this.whiteLayerCanvas = null;

      // 空（グラデーション背景）設定
      this.skyEnabled = false;
      this.skyColor = '#87CEEB';
      this.skyGradientStrength = 1.0;
      this.skyGradientSize = 1.0;

      // Scratch WebGL背景透明化パッチ用
      this._clearColorPatched = null;
      this._origClearColorFn = null;
      this._origClearFn = null;
      this._origBgColor4f = null;
      this._origBgColor3b = null;
      this._origCanvasBg = undefined;
      this._origCanvasStyle = undefined;
      this._origPosition = undefined;
      this._origZIndex = undefined;
      
      // liteから移植: ルミナンスマスク設定
      this.luminanceMaskEnabled = false;
      this.luminanceMaskThreshold = 0.8;
      this.luminanceMaskFeather = 0.1;
      this.luminanceMaskUpdateIntervalMs = 50;
      this.luminanceMaskLastUpdate = 0;
      this.luminanceMaskCanvas = null;
      this.luminanceMaskContext = null;
      this.threeMaskedCanvas = null;
      this.threeMaskedContext = null;
      this.luminanceSourceCanvas = null;
      this.lastMaskData = null;
      this.maskDebugEnabled = false;
      this.lights = new Map();
      this.nextLightId = 1;
      this.animationId = null;
      this._boundAnimate = this.animate.bind(this);
      this._cameraFollow = null;
      this._shadowFollowLights = undefined; // 旧追従方式は廃止
      // CSM関連
      this.csm = null;
      this.csmLoaded = false;
      this.csmEnabled = false;
      this.CSMClass = null;
      this.threeJSLoaded = false;
      this.gltfLoaderLoaded = false;
      this.GLTFLoader = null;
      this.initPromise = null;
      this.zIndexMode = 'auto';
      this.enable3D = true;
      this.resizeObserver = null;
      
      // 物理エンジン関連 (Rapier)
      this.rapierLoaded = false;
      this.RAPIER = null;           // Rapier モジュール参照
      this.world = null;
      // objectId -> { rigidBody, collider, mesh, _originalMass }
      this.physicsBodies = new Map();
      this.physicsEnabled = false;
      this.timeStep = 1/60;
      this.debugMeshes = new Map();
      // コリジョンイベント用ハンドル→objectId マップ
      this.colliderHandleToId = new Map();
      
      // 当たり判定関連
      this.collisionPairs = new Set();
      this.collisionHistory = new Map();
      this.lastCollisionPartner = new Map();
      
      // 3Dモデルアセット管理
      this.modelAssets = new Map();
      this.nextAssetId = 1;
      
      this.loadThreeJS();
      this.loadRapier();
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

    async loadRapier() {
      if (this.rapierLoaded) return;
      try {
        // rapier3d-compat: WASM base64 インライン済み ESM パッケージ
        const RAPIER = await import('https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat@0.12.0/rapier.es.js');
        await RAPIER.init();
        this.RAPIER = RAPIER;
        this.rapierLoaded = true;
        console.log('Rapier loaded successfully');
      } catch (err) {
        console.error('Failed to load Rapier:', err);
        throw err;
      }
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

    async waitForRapier() {
      if (this.rapierLoaded) return;
      let attempts = 0;
      while (!this.rapierLoaded && attempts < 100) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }
      if (!this.rapierLoaded) throw new Error('Rapier loading timeout');
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
            opcode: 'setObjectRotationY',
            blockType: Scratch.BlockType.COMMAND,
            text: 'オブジェクト [ID] のY向きを [Y] 度にする',
            arguments: {
              ID: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1
              },
              Y: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0
              }
            }
          },
          {
            opcode: 'lockRotation',
            blockType: Scratch.BlockType.COMMAND,
            text: 'オブジェクト [ID] の向きの慣性を [ENABLE] にする',
            arguments: {
              ID: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1
              },
              ENABLE: {
                type: Scratch.ArgumentType.STRING,
                menu: 'enableOptions',
                defaultValue: 'off'
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
            opcode: 'setObjectPositionXZ',
            blockType: Scratch.BlockType.COMMAND,
            text: 'オブジェクト [ID] のXZ位置を x:[X] z:[Z] にする (Y位置を維持)',
            arguments: {
              ID: { type: Scratch.ArgumentType.NUMBER, defaultValue: 1 },
              X:  { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
              Z:  { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 }
            }
          },
          {
            opcode: 'setObjectVelocityXZ',
            blockType: Scratch.BlockType.COMMAND,
            text: 'オブジェクト [ID] のXZ速度を x:[X] z:[Z] にする (Y速度を維持)',
            arguments: {
              ID: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1
              },
              X: {
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
            opcode: 'setColliderOffset',
            blockType: Scratch.BlockType.COMMAND,
            text: 'オブジェクト [ID] の当たり判定位置オフセットを x:[X] y:[Y] z:[Z] にする',
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
            opcode: 'getColliderOffset',
            blockType: Scratch.BlockType.REPORTER,
            text: 'オブジェクト [ID] の当たり判定オフセット [AXIS]',
            arguments: {
              ID: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1
              },
              AXIS: {
                type: Scratch.ArgumentType.STRING,
                menu: 'axes',
                defaultValue: 'y'
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
            opcode: 'followObjectWithCamera',
            blockType: Scratch.BlockType.COMMAND,
            text: 'カメラでオブジェクト [ID] を 向きオフセット +x [ANGLE] 度で x:[X] y:[Y] z:[Z] のオフセットで追尾',
            arguments: {
              ID: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1
              },
              ANGLE: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0
              },
              X: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0
              },
              Y: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 3
              },
              Z: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 5
              }
            }
          },
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
            opcode: 'setSkyColor',
            blockType: Scratch.BlockType.COMMAND,
            text: '空の色を [COLOR] グラデーション強さ [STRENGTH] 範囲 [SIZE] にする',
            arguments: {
              COLOR: {
                type: Scratch.ArgumentType.COLOR,
                defaultValue: '#87CEEB'
              },
              STRENGTH: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1.0
              },
              SIZE: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1.0
              }
            }
          },
          {
            opcode: 'setSkyEnabled',
            blockType: Scratch.BlockType.COMMAND,
            text: '空の表示を [STATE] にする',
            arguments: {
              STATE: {
                type: Scratch.ArgumentType.STRING,
                menu: 'enableOptions',
                defaultValue: 'on'
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
          {
            opcode: 'enableLuminanceMask',
            blockType: Scratch.BlockType.COMMAND,
            text: '白(輝度)マスクで3Dを表示 [ENABLE]',
            arguments: {
              ENABLE: { type: Scratch.ArgumentType.STRING, menu: 'enableOptions', defaultValue: 'off' }
            }
          },
          {
            opcode: 'setLuminanceMaskThreshold',
            blockType: Scratch.BlockType.COMMAND,
            text: '白判定のしきい値(0~1)を [THRESHOLD] にする',
            arguments: {
              THRESHOLD: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0.8 }
            }
          },
          {
            opcode: 'setLuminanceMaskFeather',
            blockType: Scratch.BlockType.COMMAND,
            text: '境界のやわらかさ(0~1)を [FEATHER] にする',
            arguments: {
              FEATHER: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0.1 }
            }
          },
          {
            opcode: 'setLuminanceMaskUpdateInterval',
            blockType: Scratch.BlockType.COMMAND,
            text: '白判定の更新間隔(ms)を [INTERVAL] にする',
            arguments: {
              INTERVAL: { type: Scratch.ArgumentType.NUMBER, defaultValue: 50 }
            }
          },
          {
            opcode: 'debugMask',
            blockType: Scratch.BlockType.COMMAND,
            text: 'マスクデバッグ表示 [ENABLE]',
            arguments: {
              ENABLE: { type: Scratch.ArgumentType.STRING, menu: 'enableOptions', defaultValue: 'off' }
            }
          },
          {
            opcode: 'checkWhitePixels',
            blockType: Scratch.BlockType.REPORTER,
            text: '白ピクセルの割合(%) しきい値:[THRESHOLD]',
            arguments: {
              THRESHOLD: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0.7 }
            }
          },
          {
            opcode: 'debugSourceCanvas',
            blockType: Scratch.BlockType.COMMAND,
            text: '入力元キャンバスの情報をデバッグ表示'
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
          {
            opcode: 'setupCSM',
            blockType: Scratch.BlockType.COMMAND,
            text: 'CSM影を設定する カスケード数:[CASCADES] 最大距離:[DISTANCE] 解像度:[MAPSIZE]',
            arguments: {
              CASCADES: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 3
              },
              DISTANCE: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 100
              },
              MAPSIZE: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1024
              }
            }
          },
          {
            opcode: 'enableCSM',
            blockType: Scratch.BlockType.COMMAND,
            text: 'CSM影を [ENABLE] にする',
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
      const RAPIER = this.RAPIER;

      const gravity = { x: 0.0, y: -9.82, z: 0.0 };
      this.world = new RAPIER.World(gravity);

      // Rapier のイベントキューで衝突開始・終了を検出
      this.eventQueue = new RAPIER.EventQueue(true);

      console.log('Physics world initialized with Rapier');
    }

    // Rapier のコリジョンイベントは updatePhysics() 内の drainCollisionEvents で処理
    _processCollisionEvent(handle1, handle2, started) {
      const idA = this.colliderHandleToId.get(handle1);
      const idB = this.colliderHandleToId.get(handle2);
      if (idA == null || idB == null) return;

      const pairKey = idA < idB ? `${idA}-${idB}` : `${idB}-${idA}`;
      if (started) {
        this.collisionPairs.add(pairKey);
        if (!this.collisionHistory.has(idA)) this.collisionHistory.set(idA, []);
        if (!this.collisionHistory.has(idB)) this.collisionHistory.set(idB, []);
        if (!this.collisionHistory.get(idA).includes(idB)) this.collisionHistory.get(idA).push(idB);
        if (!this.collisionHistory.get(idB).includes(idA)) this.collisionHistory.get(idB).push(idA);
        this.lastCollisionPartner.set(idA, idB);
        this.lastCollisionPartner.set(idB, idA);
        console.log(`Collision started: Object ${idA} <-> Object ${idB}`);
      } else {
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
      if (!this.world) this.initPhysicsWorld();
      this.world.gravity = {
        x: Scratch.Cast.toNumber(args.X),
        y: Scratch.Cast.toNumber(args.Y),
        z: Scratch.Cast.toNumber(args.Z)
      };
      console.log('Gravity set to:', this.world.gravity);
    }

    // Rapier 対応版
    addPhysicsToObject(args) {
        if (!this.isInitialized || !this.world) return;
        const RAPIER = this.RAPIER;

        const id    = Scratch.Cast.toNumber(args.ID);
        const type  = args.TYPE;          // 'dynamic' | 'static'
        const mass  = type === 'static' ? 0 : Math.max(Scratch.Cast.toNumber(args.MASS), 1);
        const shapeType = args.SHAPE;

        const mesh = this.objects.get(id);
        if (!mesh) { console.warn('Object not found:', id); return; }

        // 既存の物理を削除してから再登録
        if (this.physicsBodies.has(id)) this.removePhysicsFromObject({ ID: id });

        // THREE.js のバウンディングボックスからサイズを取得
        const box3 = new THREE.Box3().setFromObject(mesh);
        const size = new THREE.Vector3(); box3.getSize(size);
        const sphereBounds = new THREE.Sphere(); box3.getBoundingSphere(sphereBounds);

        // --- Rapier コライダー記述子を形状に応じて生成 ---
        let colliderDesc;
        if (shapeType === 'box') {
            colliderDesc = RAPIER.ColliderDesc.cuboid(size.x/2, size.y/2, size.z/2);

        } else if (shapeType === 'sphere') {
            colliderDesc = RAPIER.ColliderDesc.ball(sphereBounds.radius);

        } else if (shapeType === 'cylinder') {
            const radius = Math.max(size.x, size.z) / 2;
            colliderDesc = RAPIER.ColliderDesc.cylinder(size.y/2, radius);

        } else if (shapeType === 'plane') {
            // Rapier の halfspace（無限平面）は静的のみ
            colliderDesc = RAPIER.ColliderDesc.halfspace({ x:0, y:1, z:0 });

        } else if (shapeType === 'trimesh') {
            // ★ Rapier は Box/Sphere vs Trimesh(静的) を完全サポート
            // 静的Trimeshは頂点をワールド座標で渡し、RigidBodyは原点に置く
            // こうすることでボディのtranslation/rotationによる二重オフセットを防ぐ
            const { verts, indices } = this._collectMeshGeometryWorld(mesh);
            if (verts && indices) {
                colliderDesc = RAPIER.ColliderDesc.trimesh(verts, indices);
            } else {
                console.warn('Trimesh geometry not found, falling back to Box');
                colliderDesc = RAPIER.ColliderDesc.cuboid(size.x/2, size.y/2, size.z/2);
            }

        } else {
            colliderDesc = RAPIER.ColliderDesc.cuboid(size.x/2, size.y/2, size.z/2);
        }

        // コリジョンイベントを有効化
        colliderDesc.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);

        // --- RigidBody 記述子 ---
        const rbDesc = type === 'static'
            ? RAPIER.RigidBodyDesc.fixed()
            : RAPIER.RigidBodyDesc.dynamic();

        if (type === 'static' && shapeType === 'trimesh') {
            // Trimeshの頂点がワールド座標なのでRigidBodyは原点に固定
            rbDesc.setTranslation(0, 0, 0);
            rbDesc.setRotation({ x: 0, y: 0, z: 0, w: 1 });
        } else {
            rbDesc.setTranslation(mesh.position.x, mesh.position.y, mesh.position.z);
            rbDesc.setRotation({
                x: mesh.quaternion.x, y: mesh.quaternion.y,
                z: mesh.quaternion.z, w: mesh.quaternion.w
            });
        }

        if (type === 'dynamic') {
            rbDesc.setAngularDamping(0.9);
            rbDesc.setLinearDamping(0.01);
        }

        const rigidBody = this.world.createRigidBody(rbDesc);
        const collider  = this.world.createCollider(colliderDesc, rigidBody);

        // handle → objectId マッピング（衝突イベント解決用）
        this.colliderHandleToId.set(collider.handle, id);

        this.physicsBodies.set(id, {
            rigidBody, collider, mesh,
            _originalMass: mass,
            _offset: { x: 0, y: 0, z: 0 },
            _isTrimeshStatic: (shapeType === 'trimesh' && type === 'static')
        });

        console.log(`Physics added (Rapier) to object ${id}. Type: ${type}, Shape: ${shapeType}`);
    }

    // GLB の全子メッシュ頂点・インデックスをボディローカル座標で統合する
    _collectMeshGeometry(mesh) {
        const allVerts   = [];
        const allIndices = [];
        let vertOffset   = 0;

        const meshWorldPos  = new THREE.Vector3();  mesh.getWorldPosition(meshWorldPos);
        const meshWorldQuat = new THREE.Quaternion(); mesh.getWorldQuaternion(meshWorldQuat);
        const meshWorldQuatInv = meshWorldQuat.clone().invert();

        const collect = (tm) => {
            const geo = tm.geometry;
            if (!geo || !geo.attributes.position) return;

            const worldScale = new THREE.Vector3(); tm.getWorldScale(worldScale);
            const tmPos  = new THREE.Vector3();  tm.getWorldPosition(tmPos);
            const tmQuat = new THREE.Quaternion(); tm.getWorldQuaternion(tmQuat);

            const relPos  = new THREE.Vector3().subVectors(tmPos, meshWorldPos).applyQuaternion(meshWorldQuatInv);
            const relQuat = meshWorldQuatInv.clone().multiply(tmQuat);

            const pos = geo.attributes.position.array;
            const vCount = pos.length / 3;

            for (let i = 0; i < pos.length; i += 3) {
                const v = new THREE.Vector3(
                    pos[i]   * worldScale.x,
                    pos[i+1] * worldScale.y,
                    pos[i+2] * worldScale.z
                ).applyQuaternion(relQuat).add(relPos);
                allVerts.push(v.x, v.y, v.z);
            }

            if (geo.index) {
                for (const idx of geo.index.array) allIndices.push(idx + vertOffset);
            } else {
                for (let i = 0; i < vCount; i++) allIndices.push(i + vertOffset);
            }
            vertOffset += vCount;
        };

        if (mesh instanceof THREE.Mesh) {
            collect(mesh);
        } else {
            mesh.traverse(child => { if (child instanceof THREE.Mesh) collect(child); });
        }

        if (allVerts.length < 9) return { verts: null, indices: null };
        return {
            verts:   new Float32Array(allVerts),
            indices: new Uint32Array(allIndices)
        };
    }

    // 静的Trimesh用：頂点をワールド座標で収集する
    // RigidBodyを原点に置き、頂点座標にワールド変換を焼き込むことで
    // translation/rotationの二重適用を防ぐ
    _collectMeshGeometryWorld(mesh) {
        const allVerts   = [];
        const allIndices = [];
        let vertOffset   = 0;

        const collect = (tm) => {
            const geo = tm.geometry;
            if (!geo || !geo.attributes.position) return;

            // 頂点をワールド座標に変換するマトリクス
            tm.updateWorldMatrix(true, false);
            const mat = tm.matrixWorld;

            const pos = geo.attributes.position.array;
            const vCount = pos.length / 3;

            for (let i = 0; i < pos.length; i += 3) {
                const v = new THREE.Vector3(pos[i], pos[i+1], pos[i+2]).applyMatrix4(mat);
                allVerts.push(v.x, v.y, v.z);
            }

            if (geo.index) {
                for (const idx of geo.index.array) allIndices.push(idx + vertOffset);
            } else {
                for (let i = 0; i < vCount; i++) allIndices.push(i + vertOffset);
            }
            vertOffset += vCount;
        };

        if (mesh instanceof THREE.Mesh) {
            collect(mesh);
        } else {
            mesh.traverse(child => { if (child instanceof THREE.Mesh) collect(child); });
        }

        if (allVerts.length < 9) return { verts: null, indices: null };
        return {
            verts:   new Float32Array(allVerts),
            indices: new Uint32Array(allIndices)
        };
    }

    setObjectPhysicsType(args) {
        if (!this.isInitialized || !this.world) return;
        const id = Scratch.Cast.toNumber(args.ID);
        const type = args.TYPE;
        const physicsData = this.physicsBodies.get(id);
        if (!physicsData) { console.warn('No physics body found for object:', id); return; }

        // Rapier では RigidBody の種別変更は remove → re-create が確実
        // ここでは簡易的に bodyType を切り替える
        if (type === 'static') {
            physicsData.rigidBody.setBodyType(this.RAPIER.RigidBodyType.Fixed);
        } else {
            physicsData.rigidBody.setBodyType(this.RAPIER.RigidBodyType.Dynamic);
        }
        console.log(`Object ${id} physics type set to: ${type}`);
    }

    removePhysicsFromObject(args) {
        if (!this.isInitialized || !this.world) return;
        const id = Scratch.Cast.toNumber(args.ID);
        const physicsData = this.physicsBodies.get(id);
        if (!physicsData) { console.warn('No physics body found for object:', id); return; }

        // colliderHandleToId からも削除
        this.colliderHandleToId.delete(physicsData.collider.handle);
        this.world.removeRigidBody(physicsData.rigidBody); // collider も同時に解放される
        this.physicsBodies.delete(id);
        this.collisionHistory.delete(id);
        this.lastCollisionPartner.delete(id);

        const pairsToDelete = [];
        for (const pairKey of this.collisionPairs) {
            const [id1, id2] = pairKey.split('-').map(Number);
            if (id1 === id || id2 === id) pairsToDelete.push(pairKey);
        }
        pairsToDelete.forEach(key => this.collisionPairs.delete(key));

        const debugMesh = this.debugMeshes.get(id);
        if (debugMesh) { this.scene.remove(debugMesh); this.debugMeshes.delete(id); }

        console.log(`Physics removed from object ${id}`);
    }

    lockRotation(args) {
        const id = Scratch.Cast.toNumber(args.ID);
        const physicsData = this.physicsBodies.get(id);
        if (!physicsData) { console.warn('No physics body found for object:', id); return; }

        // off = 慣性なし（Scratchが向きを完全管理）、on = 通常の物理慣性あり
        const enable = args.ENABLE === 'on';
        physicsData._scratchControlledRot = !enable;
        if (!enable) {
            // 即座に角速度もリセット
            physicsData.rigidBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
        }
        console.log(`Object ${id} rotation inertia: ${enable ? 'ON' : 'OFF'}`);
    }

    setObjectVelocity(args) {
        const id = Scratch.Cast.toNumber(args.ID);
        const physicsData = this.physicsBodies.get(id);
        if (!physicsData) { console.warn('No physics body found for object:', id); return; }
        physicsData.rigidBody.setLinvel(
            { x: Scratch.Cast.toNumber(args.X),
              y: Scratch.Cast.toNumber(args.Y),
              z: Scratch.Cast.toNumber(args.Z) }, true);
    }

    setObjectPositionXZ(args) {
        const id = Scratch.Cast.toNumber(args.ID);
        const obj = this.objects.get(id);
        if (!obj) return;
        const x = Scratch.Cast.toNumber(args.X);
        const z = Scratch.Cast.toNumber(args.Z);
        obj.position.x = x;
        obj.position.z = z;
        const physicsData = this.physicsBodies.get(id);
        if (physicsData) {
            const rb = physicsData.rigidBody;
            const cur = rb.translation();
            rb.setTranslation({ x, y: cur.y, z }, true);
        }
    }

    setObjectVelocityXZ(args) {
        const id = Scratch.Cast.toNumber(args.ID);
        const physicsData = this.physicsBodies.get(id);
        if (!physicsData) { console.warn('No physics body found for object:', id); return; }
        // 現在のY速度を取得して維持する
        const currentVel = physicsData.rigidBody.linvel();
        physicsData.rigidBody.setLinvel({
            x: Scratch.Cast.toNumber(args.X),
            y: currentVel.y,
            z: Scratch.Cast.toNumber(args.Z)
        }, true);
    }

    applyForce(args) {
        const id = Scratch.Cast.toNumber(args.ID);
        const physicsData = this.physicsBodies.get(id);
        if (!physicsData) { console.warn('No physics body found for object:', id); return; }
        physicsData.rigidBody.addForce(
            { x: Scratch.Cast.toNumber(args.X),
              y: Scratch.Cast.toNumber(args.Y),
              z: Scratch.Cast.toNumber(args.Z) }, true);
    }

    applyImpulse(args) {
        const id = Scratch.Cast.toNumber(args.ID);
        const physicsData = this.physicsBodies.get(id);
        if (!physicsData) { console.warn('No physics body found for object:', id); return; }
        physicsData.rigidBody.applyImpulse(
            { x: Scratch.Cast.toNumber(args.X),
              y: Scratch.Cast.toNumber(args.Y),
              z: Scratch.Cast.toNumber(args.Z) }, true);
    }

    setObjectMass(args) {
        const id = Scratch.Cast.toNumber(args.ID);
        const mass = Scratch.Cast.toNumber(args.MASS);
        const physicsData = this.physicsBodies.get(id);
        if (!physicsData) { console.warn('No physics body found for object:', id); return; }

        physicsData._originalMass = mass;
        const rb = physicsData.rigidBody;
        if (rb.isFixed()) {
            console.warn('Cannot set mass for a static body.');
            return;
        }
        // Rapier は MassProperties で質量を上書きできる
        rb.setAdditionalMass(Math.max(mass, 0.01), true);
        console.log(`Object ${id} mass set to: ${mass}`);
    }

    setObjectFriction(args) {
        const id = Scratch.Cast.toNumber(args.ID);
        const friction = Scratch.Cast.toNumber(args.FRICTION);
        const physicsData = this.physicsBodies.get(id);
        
        if (!physicsData) {
            console.warn('No physics body found for object:', id);
            return;
        }

        physicsData.collider.setFriction(friction);
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

        physicsData.collider.setRestitution(restitution);
        console.log(`Object ${id} restitution set to: ${restitution}`);
    }

    setColliderOffset(args) {
        const id = Scratch.Cast.toNumber(args.ID);
        const physicsData = this.physicsBodies.get(id);
        if (!physicsData) { console.warn('No physics body found for object:', id); return; }

        const ox = Scratch.Cast.toNumber(args.X);
        const oy = Scratch.Cast.toNumber(args.Y);
        const oz = Scratch.Cast.toNumber(args.Z);

        // Rapier ではコライダーの translation を rigidBody ローカル座標で設定できる
        physicsData.collider.setTranslationWrtParent({ x: ox, y: oy, z: oz });
        physicsData._offset = { x: ox, y: oy, z: oz };

        console.log(`Object ${id} collider offset set to (${ox}, ${oy}, ${oz})`);
    }

    getColliderOffset(args) {
        const id = Scratch.Cast.toNumber(args.ID);
        const physicsData = this.physicsBodies.get(id);
        if (!physicsData) return 0;
        const offset = physicsData._offset || { x: 0, y: 0, z: 0 };
        switch (args.AXIS) {
            case 'x': return offset.x;
            case 'y': return offset.y;
            case 'z': return offset.z;
            default:  return 0;
        }
    }

        setCollisionSize(args) {
        const id = Scratch.Cast.toNumber(args.ID);
        const physicsData = this.physicsBodies.get(id);
        if (!physicsData) { console.warn('No physics body found for object:', id); return; }

        const x = Scratch.Cast.toNumber(args.X);
        const y = Scratch.Cast.toNumber(args.Y);
        const z = Scratch.Cast.toNumber(args.Z);
        const RAPIER = this.RAPIER;
        const rb = physicsData.rigidBody;

        // Rapier ではコライダーを削除して新しいサイズで再作成する
        const oldCollider = physicsData.collider;
        const shapeType = oldCollider.shapeType();

        this.colliderHandleToId.delete(oldCollider.handle);
        this.world.removeCollider(oldCollider, false);

        let newDesc;
        if (shapeType === RAPIER.ShapeType.Cuboid) {
            newDesc = RAPIER.ColliderDesc.cuboid(x/2, y/2, z/2);
        } else if (shapeType === RAPIER.ShapeType.Ball) {
            newDesc = RAPIER.ColliderDesc.ball(Math.max(x,y,z)/2);
        } else if (shapeType === RAPIER.ShapeType.Cylinder) {
            newDesc = RAPIER.ColliderDesc.cylinder(y/2, Math.max(x,z)/2);
        } else {
            console.warn('Cannot resize this shape type at runtime. Remove and re-add physics.');
            return;
        }
        newDesc.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
        const newCollider = this.world.createCollider(newDesc, rb);
        physicsData.collider = newCollider;
        this.colliderHandleToId.set(newCollider.handle, id);
        console.log(`Object ${id} collision size updated`);
    }

    getCollisionSize(args) {
        const id = Scratch.Cast.toNumber(args.ID);
        const physicsData = this.physicsBodies.get(id);
        if (!physicsData) return 0;

        const collider = physicsData.collider;
        const RAPIER = this.RAPIER;
        const axis = args.AXIS;
        const st = collider.shapeType();

        if (st === RAPIER.ShapeType.Cuboid) {
            const he = collider.halfExtents();
            switch (axis) {
                case 'x': return he.x * 2;
                case 'y': return he.y * 2;
                case 'z': return he.z * 2;
            }
        } else if (st === RAPIER.ShapeType.Ball) {
            return collider.radius();
        } else if (st === RAPIER.ShapeType.Cylinder) {
            switch (axis) {
                case 'x': return collider.radius() * 2;
                case 'y': return collider.halfHeight() * 2;
                case 'z': return collider.radius() * 2;
            }
        }
        return 0;
    }

    showCollisionBox(args) {
        const id = Scratch.Cast.toNumber(args.ID);
        const show = args.SHOW === 'on';
        const physicsData = this.physicsBodies.get(id);
        if (!physicsData) { console.warn('No physics body for object:', id); return; }

        let debugMesh = this.debugMeshes.get(id);

        if (show) {
            if (!debugMesh) {
                const collider = physicsData.collider;
                const RAPIER = this.RAPIER;
                const st = collider.shapeType();
                let geometry;

                if (st === RAPIER.ShapeType.Cuboid) {
                    const he = collider.halfExtents();
                    geometry = new THREE.BoxGeometry(he.x*2, he.y*2, he.z*2);
                } else if (st === RAPIER.ShapeType.Ball) {
                    geometry = new THREE.SphereGeometry(collider.radius(), 16, 16);
                } else if (st === RAPIER.ShapeType.Cylinder) {
                    geometry = new THREE.CylinderGeometry(
                        collider.radius(), collider.radius(), collider.halfHeight()*2, 16);
                } else if (st === RAPIER.ShapeType.TriMesh) {
                    // Trimesh のワイヤーフレーム表示
                    const verts   = collider.vertices();
                    const indices = collider.indices();
                    geometry = new THREE.BufferGeometry();
                    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
                    geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
                } else {
                    // HalfSpace など
                    geometry = new THREE.PlaneGeometry(100, 100);
                }

                const mat = new THREE.MeshBasicMaterial({
                    color: 0x00ff00, wireframe: true,
                    transparent: true, opacity: 0.5, depthTest: false
                });
                debugMesh = new THREE.Mesh(geometry, mat);
                this.scene.add(debugMesh);
                this.debugMeshes.set(id, debugMesh);
                console.log(`Collision debug shown for object ${id}`);
            }
            debugMesh.visible = true;
        } else {
            if (debugMesh) { debugMesh.visible = false; }
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

      const vel = physicsData.rigidBody.linvel();
      const axis = args.AXIS;
      switch (axis) {
        case 'x': return vel.x;
        case 'y': return vel.y;
        case 'z': return vel.z;
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

    // Rapier 対応版
    updatePhysics() {
        if (!this.physicsEnabled || !this.world) return;

        // ステップ前に static ボディ（trimesh以外）の位置を THREE → Rapier へ同期
        // （Scratchブロックでメッシュを動かしたとき、コライダーも追従させる）
        // trimeshはワールド座標で頂点が焼き込まれているため同期しない
        for (const [id, physicsData] of this.physicsBodies) {
            const { rigidBody, mesh, _isTrimeshStatic } = physicsData;
            if (!rigidBody.isFixed() || _isTrimeshStatic) continue;
            rigidBody.setTranslation(
                { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z }, false
            );
            rigidBody.setRotation(
                { x: mesh.quaternion.x, y: mesh.quaternion.y,
                  z: mesh.quaternion.z, w: mesh.quaternion.w }, false
            );
        }

        // Scratchから向きを直接制御されているオブジェクトは
        // ステップ前に向きを書き戻し角速度をゼロにする（Rapierの慣性と戦わせない）
        for (const [id, physicsData] of this.physicsBodies) {
            if (!physicsData._scratchControlledRot) continue;
            const { rigidBody, mesh } = physicsData;
            rigidBody.setRotation(
                { x: mesh.quaternion.x, y: mesh.quaternion.y,
                  z: mesh.quaternion.z, w: mesh.quaternion.w }, false
            );
            rigidBody.setAngvel({ x: 0, y: 0, z: 0 }, false);
        }

        this.world.step(this.eventQueue);

        // 衝突イベントをドレインして collisionPairs を更新
        this.eventQueue.drainCollisionEvents((handle1, handle2, started) => {
            this._processCollisionEvent(handle1, handle2, started);
        });

        // dynamic ボディの位置・回転を Rapier → THREE へ同期
        for (const [id, physicsData] of this.physicsBodies) {
            const { rigidBody, mesh } = physicsData;
            if (rigidBody.isFixed()) continue;

            const pos  = rigidBody.translation();
            const quat = rigidBody.rotation();
            mesh.position.set(pos.x, pos.y, pos.z);
            mesh.quaternion.set(quat.x, quat.y, quat.z, quat.w);

            const debugMesh = this.debugMeshes.get(id);
            if (debugMesh && debugMesh.visible) {
                debugMesh.position.copy(mesh.position);
                debugMesh.quaternion.copy(mesh.quaternion);
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
          // CSMが有効なら新しいマテリアルにシェーダーチャンクを適用
          if (this.csm && this.csmEnabled) {
            model.traverse(child => {
              if (child.isMesh && child.material) {
                const mats = Array.isArray(child.material) ? child.material : [child.material];
                mats.forEach(m => this.csm.setupMaterial(m));
              }
            });
          }
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
          // CSMが有効なら新しいマテリアルにシェーダーチャンクを適用
          if (this.csm && this.csmEnabled) {
            model.traverse(child => {
              if (child.isMesh && child.material) {
                const mats = Array.isArray(child.material) ? child.material : [child.material];
                mats.forEach(m => this.csm.setupMaterial(m));
              }
            });
          }
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
        await this.waitForRapier();
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

    _patchScratchClearColor() {
      const scratchRenderer = Scratch?.vm?.runtime?.renderer;
      const gl = scratchRenderer?._gl;
      if (!gl) { console.warn('[e3ot] Scratch _gl not found'); return; }
      if (this._clearColorPatched) return;

      this._origClearColorFn = gl.clearColor.bind(gl);
      gl.clearColor = (r, g, b, a) => { this._origClearColorFn(0, 0, 0, 0); };
      this._origClearFn = gl.clear.bind(gl);
      gl.clear = (mask) => { this._origClearColorFn(0, 0, 0, 0); this._origClearFn(mask); };
      gl.clearColor(0, 0, 0, 0);
      this._clearColorPatched = gl;

      if (scratchRenderer.setBackgroundColor) {
        if (scratchRenderer._backgroundColor4f) {
          this._origBgColor4f = Array.from(scratchRenderer._backgroundColor4f);
        }
        if (scratchRenderer._backgroundColor3b) {
          this._origBgColor3b = Array.from(scratchRenderer._backgroundColor3b);
        }
        scratchRenderer.setBackgroundColor(0, 0, 0, 0);
      } else {
        if (scratchRenderer._backgroundColor4f) {
          this._origBgColor4f = Array.from(scratchRenderer._backgroundColor4f);
          scratchRenderer._backgroundColor4f[0] = 0;
          scratchRenderer._backgroundColor4f[1] = 0;
          scratchRenderer._backgroundColor4f[2] = 0;
          scratchRenderer._backgroundColor4f[3] = 0;
        }
        if (scratchRenderer._backgroundColor3b) {
          this._origBgColor3b = Array.from(scratchRenderer._backgroundColor3b);
          scratchRenderer._backgroundColor3b[0] = 0;
          scratchRenderer._backgroundColor3b[1] = 0;
          scratchRenderer._backgroundColor3b[2] = 0;
        }
      }

      const c = scratchRenderer.canvas;
      if (c) {
        this._origCanvasBg = c.style.background;
        c.style.background = 'transparent';
        this._origCanvasStyle = c.style.cssText;
        c.style.setProperty('background-color', 'transparent', 'important');
        this._origPosition = c.style.position;
        this._origZIndex = c.style.zIndex;
        c.style.position = 'relative';
        c.style.zIndex = '10';
      }
      console.log('[e3ot] bg patched: clearColor + setBackgroundColor + zIndex');
    }

    _restoreScratchClearColor() {
      const scratchRenderer = Scratch?.vm?.runtime?.renderer;
      const gl = scratchRenderer?._gl;
      if (this._clearColorPatched && gl) {
        if (this._origClearColorFn) {
          gl.clearColor = this._origClearColorFn;
          gl.clearColor(1, 1, 1, 1);
          this._origClearColorFn = null;
        }
        if (this._origClearFn) {
          gl.clear = this._origClearFn;
          this._origClearFn = null;
        }
        this._clearColorPatched = null;
      }

      if (this._origBgColor4f && scratchRenderer._backgroundColor4f) {
        if (scratchRenderer.setBackgroundColor) {
          const o = this._origBgColor4f[3] || 1;
          scratchRenderer.setBackgroundColor(
            this._origBgColor4f[0] / o,
            this._origBgColor4f[1] / o,
            this._origBgColor4f[2] / o,
            o
          );
        } else {
          this._origBgColor4f.forEach((v, i) => scratchRenderer._backgroundColor4f[i] = v);
        }
        this._origBgColor4f = null;
      }
      if (this._origBgColor3b && scratchRenderer._backgroundColor3b) {
        this._origBgColor3b.forEach((v, i) => scratchRenderer._backgroundColor3b[i] = v);
        this._origBgColor3b = null;
      }

      const c = scratchRenderer?.canvas;
      if (c) {
        if (this._origCanvasStyle !== undefined) {
          c.style.cssText = this._origCanvasStyle;
          this._origCanvasStyle = undefined;
        } else if (this._origCanvasBg !== undefined) {
          c.style.background = this._origCanvasBg;
          this._origCanvasBg = undefined;
        }
        if (this._origPosition !== undefined) {
          c.style.position = this._origPosition;
          this._origPosition = undefined;
        }
        if (this._origZIndex !== undefined) {
          c.style.zIndex = this._origZIndex;
          this._origZIndex = undefined;
        }
      }
      console.log('[e3ot] bg restored');
    }

    // フルスクリーン切り替え時に container を正しい親に移動し直す
    _reattachContainer() {
      if (!this.container) return;
      const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
      let newParent = null;
      if (fsEl) {
        if (fsEl.contains(this.stageCanvas)) {
          newParent = this.stageCanvas?.parentElement || fsEl;
        } else {
          newParent = fsEl.parentElement || document.body;
        }
      } else {
        newParent = this.stageCanvas?.parentElement || null;
      }
      if (!newParent) return;
      if (this.container.parentNode === newParent) {
        this.updateSizeAndPosition();
        if (this.renderOrder === 'behind') this._repatchZIndex();
        return;
      }
      newParent.style.position = newParent.style.position || 'relative';
      newParent.appendChild(this.container);
      this.updateSizeAndPosition();
      if (this.renderOrder === 'behind') this._repatchZIndex();
      console.log('[e3ot] container reattached for fullscreen change');
    }

    // Scratch canvas の z-index を behind モード用に再設定する
    _repatchZIndex() {
      const scratchRenderer = Scratch?.vm?.runtime?.renderer;
      const c = scratchRenderer?.canvas;
      if (c) {
        c.style.position = 'relative';
        c.style.zIndex   = '10';
      }
      if (this.container) this.container.style.zIndex = '0';
    }

    setupImprovedOverlay() {
      this.findAndSetupStageElement();

      this.container = document.createElement('div');
      this.container.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:10;overflow:hidden;';

      // 「後ろ」モード時に3Dの背面に敷くレイヤー（z-index:0 で最背面）
      this.whiteLayerCanvas = document.createElement('canvas');
      this.whiteLayerCanvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;display:none;z-index:0;pointer-events:none;';
      this.container.appendChild(this.whiteLayerCanvas);

      // 最終表示用2Dキャンバス（liteから移植）
      this.replacementCanvas = document.createElement('canvas');
      this.replacementCanvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;display:block;z-index:1;';
      this.replacementContext = this.replacementCanvas.getContext('2d', { willReadFrequently: true, alpha: true });
      this.container.appendChild(this.replacementCanvas);

      // Three.jsレンダラー（非表示だが有効 - replacementCanvasに転写するため）
      this.renderer.domElement.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;opacity:0;pointer-events:none;z-index:0;';
      this.container.appendChild(this.renderer.domElement);

      // マスク用オフスクリーンキャンバス
      this.luminanceMaskCanvas = document.createElement('canvas');
      this.luminanceMaskContext = this.luminanceMaskCanvas.getContext('2d', { willReadFrequently: true });

      // 一時合成用キャンバス
      this.threeMaskedCanvas = document.createElement('canvas');
      this.threeMaskedContext = this.threeMaskedCanvas.getContext('2d');

      if (this.stageElement?.parentElement) {
        this.stageElement.parentElement.style.position = 'relative';
        this.stageElement.parentElement.appendChild(this.container);
      } else if (this.stageElement) {
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

      // 即時入力元検索（旗連打対策）
      setTimeout(() => {
        this.findLuminanceSource();
        this.updateSizeAndPosition();
      }, 100);

      console.log('Improved overlay setup complete (with replacement canvas)');
    }

    findAndSetupStageElement() {
      // TurboWarp固有のセレクタを優先（liteから移植）
      const selectors = [
        '[class*="stage-wrapper"] canvas',
        '[class*="Stage"] canvas',
        '.stage canvas',
        '#stage canvas',
        'canvas'
      ];
      
      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        for (const el of elements) {
          if (el.tagName === 'CANVAS') {
            const rect = el.getBoundingClientRect();
            const gl = el.getContext('webgl') || el.getContext('webgl2');
            if (rect.width > 200 && rect.height > 150 && gl) {
              this.stageCanvas = el;
              this.stageElement = el;
              console.log('Stage found:', rect.width, 'x', rect.height);
              return;
            }
          }
        }
      }
      
      // フォールバック
      const canvases = document.querySelectorAll('canvas');
      for (const c of canvases) {
        const rect = c.getBoundingClientRect();
        if (rect.width > 200 && rect.height > 150) {
          this.stageCanvas = c;
          this.stageElement = c;
          console.log('Stage fallback:', rect.width, 'x', rect.height);
          return;
        }
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
        this.refreshLuminanceSource(); // 入力元も再検索（liteから移植）
      }, 500);

      window.addEventListener('resize', () => {
        setTimeout(() => this.updateSizeAndPosition(), 50);
      });

      // フルスクリーン切り替え時にcontainerを正しい親に付け直す
      if (!this._boundFullscreenHandler) {
        this._boundFullscreenHandler = () => {
          setTimeout(() => this._reattachContainer(), 100);
          setTimeout(() => this._reattachContainer(), 400);
        };
      }
      document.removeEventListener('fullscreenchange',       this._boundFullscreenHandler);
      document.removeEventListener('webkitfullscreenchange', this._boundFullscreenHandler);
      document.addEventListener('fullscreenchange',          this._boundFullscreenHandler);
      document.addEventListener('webkitfullscreenchange',    this._boundFullscreenHandler);

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

        // replacementCanvas / mask canvases のサイズ同期（liteから移植）
        [this.replacementCanvas, this.luminanceMaskCanvas, this.threeMaskedCanvas, this.whiteLayerCanvas].forEach(c => {
          if (c) {
            c.width = internalWidth;
            c.height = internalHeight;
            c.style.width = width + 'px';
            c.style.height = height + 'px';
          }
        });
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
        const parentRect = this.container.parentElement
          ? this.container.parentElement.getBoundingClientRect()
          : { left: 0, top: 0 };
        const offsetLeft = rect.left - parentRect.left;
        const offsetTop  = rect.top  - parentRect.top;
        this.container.style.transform = `translate(${offsetLeft}px, ${offsetTop}px)`;
        
        // zIndexの調整
        if (this.zIndexMode === 'auto') {
            const zIndex = parseInt(this.stageCanvas.style.zIndex) || 0;
            if (this.renderOrder === 'overlay') {
                this.container.style.zIndex = Math.max(10, zIndex + 1);
            } else if (this.renderOrder === 'behind') {
                this.container.style.zIndex = '0';
                this._repatchZIndex();
            } else { // back
                this.container.style.zIndex = '0';
            }
        }
      }
    }

    // ============================================
    // liteから移植: ルミナンスソース検索・デバッグ系
    // ============================================

    findLuminanceSource() {
      if (this.stageCanvas) {
        this.luminanceSourceCanvas = this.stageCanvas;
        console.log('Luminance source: stage canvas');
        return;
      }
      
      const canvases = Array.from(document.querySelectorAll('canvas')).filter(c => {
        return c !== this.replacementCanvas && c !== this.renderer?.domElement;
      });
      
      let webglCanvases = [];
      let otherCanvases = [];
      
      for (const c of canvases) {
        const rect = c.getBoundingClientRect();
        if (rect.width < 100 || rect.height < 100) continue;
        
        const gl = c.getContext('webgl') || c.getContext('webgl2');
        if (gl) {
          webglCanvases.push({ canvas: c, area: rect.width * rect.height, info: 'WebGL' });
        } else {
          otherCanvases.push({ canvas: c, area: rect.width * rect.height, info: '2D' });
        }
      }
      
      webglCanvases.sort((a, b) => b.area - a.area);
      otherCanvases.sort((a, b) => b.area - a.area);
      
      const candidates = [...webglCanvases, ...otherCanvases];
      
      if (candidates.length > 0) {
        this.luminanceSourceCanvas = candidates[0].canvas;
        console.log('Luminance source found:', candidates[0].info, 'area:', candidates[0].area);
        this.debugCanvasInfo(candidates[0].canvas);
      } else {
        console.warn('No suitable canvas found');
      }
    }

    refreshLuminanceSource() {
      if (!this.luminanceSourceCanvas || !this.luminanceSourceCanvas.parentElement) {
        this.findLuminanceSource();
      }
    }

    debugCanvasInfo(canvas) {
      try {
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const width = canvas.width;
        const height = canvas.height;
        const sampleSize = 10;
        const imgData = ctx.getImageData(0, 0, sampleSize, sampleSize);
        const data = imgData.data;
        console.log('=== Canvas Debug Info ===');
        console.log('Canvas size:', width, 'x', height);
        let whiteCount = 0, blackCount = 0, grayCount = 0;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i+1], b = data[i+2];
          if (r > 240 && g > 240 && b > 240) whiteCount++;
          else if (r < 20 && g < 20 && b < 20) blackCount++;
          else grayCount++;
        }
        let totalBrightness = 0;
        for (let i = 0; i < data.length; i += 4) {
          totalBrightness += (data[i] + data[i+1] + data[i+2]) / 3;
        }
        console.log('White:', whiteCount, 'Black:', blackCount, 'Gray:', grayCount);
        console.log('Average brightness:', (totalBrightness / (data.length / 4)).toFixed(2));
      } catch (e) {
        console.error('Canvas debug error:', e);
      }
    }

    debugSourceCanvas() {
      if (!this.luminanceSourceCanvas) this.findLuminanceSource();
      if (this.luminanceSourceCanvas) {
        this.debugCanvasInfo(this.luminanceSourceCanvas);
      } else {
        console.warn('No source canvas found for debugging');
      }
    }

    // ============================================
    // liteから移植: ルミナンスマスク制御ブロック
    // ============================================

    enableLuminanceMask(args) {
      this.luminanceMaskEnabled = args.ENABLE === 'on';
      this.lastMaskData = null;
      this.luminanceMaskLastUpdate = 0;
      
      if (this.luminanceMaskEnabled) {
        this.findLuminanceSource();
        console.log('Luminance mask enabled, source:', this.luminanceSourceCanvas ? 'found' : 'not found');
        if (this.luminanceSourceCanvas) this.debugCanvasInfo(this.luminanceSourceCanvas);
      }
      
      if (this.container) {
        if (this.luminanceMaskEnabled) {
          this.container.style.filter = 'contrast(1.2) brightness(1.1)';
          this.container.style.mixBlendMode = 'normal';
          this.container.style.opacity = '1';
        } else {
          this.container.style.filter = 'none';
          this.container.style.mixBlendMode = this.currentBlendMode;
        }
      }
    }

    setLuminanceMaskThreshold(args) {
      this.luminanceMaskThreshold = Math.max(0, Math.min(1, Scratch.Cast.toNumber(args.THRESHOLD)));
      this.luminanceMaskLastUpdate = 0;
    }

    setLuminanceMaskFeather(args) {
      this.luminanceMaskFeather = Math.max(0, Math.min(1, Scratch.Cast.toNumber(args.FEATHER)));
      this.luminanceMaskLastUpdate = 0;
    }

    setLuminanceMaskUpdateInterval(args) {
      this.luminanceMaskUpdateIntervalMs = Math.max(10, Math.min(1000, Scratch.Cast.toNumber(args.INTERVAL)));
      console.log('Mask update interval set to:', this.luminanceMaskUpdateIntervalMs, 'ms');
    }

    debugMask(args) {
      this.maskDebugEnabled = args.ENABLE === 'on';
      console.log('Mask debug:', this.maskDebugEnabled ? 'ON' : 'OFF');
    }

    // ============================================
    // liteから移植: ルミナンスマスク処理
    // ============================================

    updateMask(width, height) {
      if (!this.luminanceSourceCanvas) {
        this.findLuminanceSource();
        if (!this.luminanceSourceCanvas) return false;
      }

      const now = performance.now();
      if (now - this.luminanceMaskLastUpdate < this.luminanceMaskUpdateIntervalMs) {
        return !!this.lastMaskData;
      }
      
      try {
        if (this.luminanceMaskCanvas.width !== width || this.luminanceMaskCanvas.height !== height) {
          this.luminanceMaskCanvas.width = width;
          this.luminanceMaskCanvas.height = height;
        }
        
        const ctx = this.luminanceMaskContext;
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(this.luminanceSourceCanvas, 0, 0, width, height);
        
        const imgData = ctx.getImageData(0, 0, width, height);
        const data = imgData.data;
        
        const threshold = Math.max(0.1, Math.min(1, this.luminanceMaskThreshold));
        const feather = Math.max(0.01, Math.min(0.5, this.luminanceMaskFeather));
        
        let maxLuminance = 0, sampleCount = 0, totalLuminance = 0;
        const step = Math.max(1, Math.floor(Math.sqrt(data.length / 4 / 5000)));
        
        for (let i = 0; i < data.length; i += step * 4) {
          const r = data[i], g = data[i+1], b = data[i+2];
          const stdLum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          const maxLum = Math.max(r, g, b);
          const lum = (stdLum * 0.7 + maxLum * 0.3) / 255;
          if (lum > maxLuminance) maxLuminance = lum;
          totalLuminance += lum;
          sampleCount++;
        }
        
        const avgLuminance = totalLuminance / sampleCount;
        const adaptiveThreshold = Math.min(threshold, Math.max(0.15, avgLuminance * 1.2));
        const t0 = Math.max(0, adaptiveThreshold - feather);
        const t1 = Math.min(1, adaptiveThreshold + feather);
        
        let whitePixelCount = 0, visiblePixelCount = 0;
        
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i+1], b = data[i+2];
          const stdLum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          const maxLum = Math.max(r, g, b);
          let lum = (stdLum * 0.6 + maxLum * 0.4) / 255;
          lum = Math.pow(lum, 0.9);
          
          let alpha = 0;
          if (lum >= t1) {
            alpha = 1;
          } else if (lum > t0) {
            const t = (lum - t0) / (t1 - t0);
            alpha = t * t * (3 - 2 * t);
          }
          if (alpha < 0.05) alpha = 0;
          if (alpha > 0.95) alpha = 1;
          
          if (alpha > 0) visiblePixelCount++;
          if (lum > 0.7) whitePixelCount++;
          
          data[i] = 255; data[i+1] = 255; data[i+2] = 255;
          data[i+3] = Math.round(alpha * 255);
        }
        
        const visibilityRatio = visiblePixelCount / (data.length / 4);
        if (this.maskDebugEnabled) {
          console.log('Mask stats:', {
            threshold: adaptiveThreshold.toFixed(2), t0: t0.toFixed(2), t1: t1.toFixed(2),
            maxLum: maxLuminance.toFixed(2), avgLum: avgLuminance.toFixed(2),
            whitePixels: whitePixelCount, visibleRatio: (visibilityRatio * 100).toFixed(1) + '%'
          });
        }
        
        if (visibilityRatio < 0.005) {
          if (this.maskDebugEnabled) console.warn('Mask is empty! Showing all.');
          for (let i = 3; i < data.length; i += 4) data[i] = 255;
        }
        
        ctx.putImageData(imgData, 0, 0);
        this.lastMaskData = imgData;
        this.luminanceMaskLastUpdate = now;
        return true;
        
      } catch (e) {
        console.error('Mask update error:', e);
        return false;
      }
    }

    checkWhitePixels(args) {
      if (!this.luminanceSourceCanvas) {
        this.findLuminanceSource();
        if (!this.luminanceSourceCanvas) return 0;
      }
      
      try {
        const ctx = this.luminanceMaskContext;
        const width = this.luminanceSourceCanvas.width;
        const height = this.luminanceSourceCanvas.height;
        
        if (this.luminanceMaskCanvas.width !== width || this.luminanceMaskCanvas.height !== height) {
          this.luminanceMaskCanvas.width = width;
          this.luminanceMaskCanvas.height = height;
        }
        
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(this.luminanceSourceCanvas, 0, 0, width, height);
        
        const imgData = ctx.getImageData(0, 0, width, height);
        const data = imgData.data;
        const threshold = Math.max(0.1, Math.min(1, Scratch.Cast.toNumber(args.THRESHOLD || 0.7)));
        
        let whitePixelCount = 0;
        const totalPixels = data.length / 4;
        for (let i = 0; i < data.length; i += 4) {
          const brightness = (data[i] + data[i+1] + data[i+2]) / 3;
          if (brightness > (threshold * 255)) whitePixelCount++;
        }
        return Math.round((whitePixelCount / totalPixels) * 100);
        
      } catch (e) {
        console.error('White pixel check error:', e);
        return 0;
      }
    }

    renderMasked() {
      if (!this.replacementContext || !this.replacementCanvas) return;
      
      const w = this.replacementCanvas.width;
      const h = this.replacementCanvas.height;
      if (!w || !h) return;

      const threeCanvas = this.renderer.domElement;
      const maskOk = this.updateMask(w, h);
      
      if (!maskOk || !this.luminanceMaskCanvas) {
        this.replacementContext.clearRect(0, 0, w, h);
        this.replacementContext.drawImage(threeCanvas, 0, 0, w, h);
        return;
      }
      
      if (!this.threeMaskedCanvas || this.threeMaskedCanvas.width !== w || this.threeMaskedCanvas.height !== h) {
        this.threeMaskedCanvas.width = w;
        this.threeMaskedCanvas.height = h;
        this.threeMaskedContext = this.threeMaskedCanvas.getContext('2d');
      }
      
      const tempCtx = this.threeMaskedContext;
      tempCtx.clearRect(0, 0, w, h);
      tempCtx.drawImage(threeCanvas, 0, 0, w, h);
      tempCtx.globalCompositeOperation = 'destination-in';
      tempCtx.drawImage(this.luminanceMaskCanvas, 0, 0, w, h);
      tempCtx.globalCompositeOperation = 'source-over';
      
      this.replacementContext.clearRect(0, 0, w, h);
      
      if (this.maskDebugEnabled) {
        this.replacementContext.drawImage(this.threeMaskedCanvas, 0, 0, w, h);
        this.replacementContext.fillStyle = 'rgba(255, 0, 0, 0.1)';
        this.replacementContext.fillRect(0, 0, w, h);
        this.replacementContext.strokeStyle = 'yellow';
        this.replacementContext.lineWidth = 1;
        this.replacementContext.strokeRect(w - w/4, 0, w/4, h/4);
        this.replacementContext.drawImage(this.luminanceMaskCanvas, w - w/4, 0, w/4, h/4);
      } else {
        this.replacementContext.drawImage(this.threeMaskedCanvas, 0, 0, w, h);
      }
    }

    animate(now) {
      if (!this.isInitialized || !this.enable3D) return;

      this.animationId = requestAnimationFrame(this._boundAnimate);

      // デルタタイム計算（初回・復帰後はスパイクしないようリセット）
      if (this._lastFrameTime === undefined) this._lastFrameTime = now;
      const rawDelta = (now - this._lastFrameTime) / 1000;
      this._lastFrameTime = now;
      const clampedDelta = Math.min(rawDelta, this.timeStep * 3);

      // 固定タイムステップ物理（accumulatorパターン）
      if (this.physicsEnabled && this.world) {
        this._physicsAccumulator = (this._physicsAccumulator || 0) + clampedDelta;
        while (this._physicsAccumulator >= this.timeStep) {
          this.updatePhysics();
          this._physicsAccumulator -= this.timeStep;
        }
      }

      // カメラフォロー：毎フレーム適用（Scratchティックと非同期でもガクつかない）
      if (this._cameraFollow) {
        const cf  = this._cameraFollow;
        const obj = this.objects.get(cf.id);
        if (obj) {
          // オブジェクトのY軸回転に角度オフセットを加えたQuaternionを計算
          const angleRad  = (cf.angle || 0) * (Math.PI / 180);
          const yawOffset = new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(0, 1, 0), angleRad
          );
          const followQuat = obj.quaternion.clone().multiply(yawOffset);

          const offset = new THREE.Vector3(cf.ox, cf.oy, cf.oz);
          offset.applyQuaternion(followQuat);
          this.camera.position.copy(obj.position).add(offset);
          this.camera.quaternion.copy(followQuat);
        }
      }


      // CSM: カメラ移動に合わせてシャドウ分割を毎フレーム更新
      if (this.csm && this.csmEnabled) {
        this.csm.update();
      }


      this.renderer.render(this.scene, this.camera);

      // replacementCanvasに転写（liteから移植: blend modeとルミナンスマスクに対応）
      if (this.replacementContext && this.replacementCanvas) {
        if (this.luminanceMaskEnabled) {
          this.renderMasked();
        } else {
          const w = this.replacementCanvas.width;
          const h = this.replacementCanvas.height;
          this.replacementContext.clearRect(0, 0, w, h);
          this.replacementContext.drawImage(this.renderer.domElement, 0, 0, w, h);
        }
      }

      // 「後ろ」モード時: whiteLayerCanvas に空グラデーション or 白を描画
      if (this.renderOrder === 'behind' && this.whiteLayerCanvas) {
        const wlCtx = this.whiteLayerCanvas.getContext('2d');
        if (wlCtx) {
          const w = this.whiteLayerCanvas.width || this.replacementCanvas?.width || 480;
          const h = this.whiteLayerCanvas.height || this.replacementCanvas?.height || 360;
          if (this.skyEnabled) {
            const gradH    = Math.min(1.0, Math.max(0.0, this.skyGradientSize));
            const stopY    = h * gradH;
            const hex      = this.skyColor.replace('#', '');
            const sr       = parseInt(hex.substring(0, 2), 16);
            const sg       = parseInt(hex.substring(2, 4), 16);
            const sb       = parseInt(hex.substring(4, 6), 16);
            const strength = Math.min(1.0, Math.max(0.0, this.skyGradientStrength));
            const grad     = wlCtx.createLinearGradient(0, 0, 0, stopY > 0 ? stopY : h);
            grad.addColorStop(0, `rgba(${sr},${sg},${sb},1)`);
            grad.addColorStop(1, `rgba(255,255,255,${1 - strength})`);
            wlCtx.fillStyle = '#ffffff';
            wlCtx.fillRect(0, 0, w, h);
            wlCtx.fillStyle = grad;
            wlCtx.fillRect(0, 0, w, stopY > 0 ? stopY : h);
          } else {
            wlCtx.fillStyle = '#ffffff';
            wlCtx.fillRect(0, 0, w, h);
          }
        }
      }
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
      // CSMが有効なら新しいマテリアルにシェーダーチャンクを適用
      if (this.csm && this.csmEnabled) {
        const mats = Array.isArray(cube.material) ? cube.material : [cube.material];
        mats.forEach(m => this.csm.setupMaterial(m));
      }
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
      // CSMが有効なら新しいマテリアルにシェーダーチャンクを適用
      if (this.csm && this.csmEnabled) {
        const mats = Array.isArray(sphere.material) ? sphere.material : [sphere.material];
        mats.forEach(m => this.csm.setupMaterial(m));
      }
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
      // CSMが有効なら新しいマテリアルにシェーダーチャンクを適用
      if (this.csm && this.csmEnabled) {
        const mats = Array.isArray(cylinder.material) ? cylinder.material : [cylinder.material];
        mats.forEach(m => this.csm.setupMaterial(m));
      }
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
      // CSMが有効なら新しいマテリアルにシェーダーチャンクを適用
      if (this.csm && this.csmEnabled) {
        const mats = Array.isArray(plane.material) ? plane.material : [plane.material];
        mats.forEach(m => this.csm.setupMaterial(m));
      }
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
        const rb = physicsData.rigidBody;
        rb.setTranslation({ x, y, z }, true);
        rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
        rb.setAngvel({ x: 0, y: 0, z: 0 }, true);
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
        const p = obj.position;
        physicsData.rigidBody.setTranslation({ x: p.x, y: p.y, z: p.z }, true);
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
        const q = obj.quaternion;
        physicsData.rigidBody.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
        physicsData.rigidBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
        physicsData._scratchControlledRot = true;
      }
    }

    setObjectRotationY(args) {
      if (!this.isInitialized) return;
      const id = Scratch.Cast.toNumber(args.ID);
      const obj = this.objects.get(id);
      if (!obj) return;

      const yRad = Scratch.Cast.toNumber(args.Y) * (Math.PI / 180);

      // Rapierの現在quaternionを取得してYのみ差し替え
      // YXZ順で分解：Y成分だけ指定値に、X/Z（地形傾き等）はそのまま維持
      const physicsData = this.physicsBodies.get(id);
      if (physicsData) {
        const rq = physicsData.rigidBody.rotation();
        const currentQuat = new THREE.Quaternion(rq.x, rq.y, rq.z, rq.w);
        const euler = new THREE.Euler().setFromQuaternion(currentQuat, 'YXZ');
        euler.y = yRad;
        obj.quaternion.setFromEuler(euler);

        const q = obj.quaternion;
        physicsData.rigidBody.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
        physicsData.rigidBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
        physicsData._scratchControlledRot = true;
      } else {
        // 物理なしの場合も同様にYXZ分解でY差し替え
        const euler = new THREE.Euler().setFromQuaternion(obj.quaternion, 'YXZ');
        euler.y = yRad;
        obj.quaternion.setFromEuler(euler);
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
        const q = obj.quaternion;
        physicsData.rigidBody.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
        physicsData.rigidBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
        physicsData._scratchControlledRot = true;
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

    followObjectWithCamera(args) {
      if (!this.camera) return;
      const id  = Scratch.Cast.toNumber(args.ID);
      const obj = this.objects.get(id);
      if (!obj) return;
      // 追尾先を登録するだけ。実際のカメラ移動はanimate()で毎フレーム行う
      this._cameraFollow = {
        id,
        angle: Scratch.Cast.toNumber(args.ANGLE),
        ox: Scratch.Cast.toNumber(args.X),
        oy: Scratch.Cast.toNumber(args.Y),
        oz: Scratch.Cast.toNumber(args.Z),
      };
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
              this.container.style.zIndex = '100';
              this.zIndexMode = 'auto';
              this._restoreScratchClearColor();
              if (this.whiteLayerCanvas) this.whiteLayerCanvas.style.display = 'none';
          } else if (depth === 'behind') {
              this.container.style.zIndex = '0';
              this.zIndexMode = 'auto';
              this._patchScratchClearColor();
              if (this.whiteLayerCanvas) this.whiteLayerCanvas.style.display = 'block';
          } else { // back
              this.container.style.zIndex = '0';
              this.zIndexMode = 'manual';
              this._restoreScratchClearColor();
              if (this.whiteLayerCanvas) this.whiteLayerCanvas.style.display = 'none';
          }
      }
      this.updateSizeAndPosition(); // zIndexの更新をトリガー
      console.log('3D depth set to:', depth);
    }

    setSkyColor(args) {
      this.skyColor            = args.COLOR || '#87CEEB';
      this.skyGradientStrength = Math.min(1.0, Math.max(0.0, Scratch.Cast.toNumber(args.STRENGTH)));
      this.skyGradientSize     = Math.min(1.0, Math.max(0.0, Scratch.Cast.toNumber(args.SIZE)));
      this.skyEnabled = true;
      if (this.whiteLayerCanvas) this.whiteLayerCanvas.style.display = 'block';
      console.log(`[sky] color=${this.skyColor} strength=${this.skyGradientStrength} size=${this.skyGradientSize}`);
    }

    setSkyEnabled(args) {
      this.skyEnabled = (args.STATE === 'on');
      if (this.whiteLayerCanvas && this.renderOrder === 'behind') {
        this.whiteLayerCanvas.style.display = this.skyEnabled ? 'block' : 'none';
      }
      console.log(`[sky] enabled=${this.skyEnabled}`);
    }

    set3DOpacity(args) {
      const opacity = Scratch.Cast.toNumber(args.OPACITY);
      this.current3DOpacity = Math.max(0, Math.min(1, opacity));
      // liteから移植: containerに適用
      if (this.container) {
        this.container.style.opacity = this.current3DOpacity;
      }
    }

    setBlendMode(args) {
      const mode = args.MODE;
      const blendModeMap = {
        'normal': 'normal',
        'multiply': 'multiply',
        'screen': 'screen',
        'overlay': 'overlay',
        'soft-light': 'soft-light',
        'hard-light': 'hard-light',
        'difference': 'difference',
        'exclusion': 'exclusion'
      };
      
      this.currentBlendMode = blendModeMap[mode] || 'normal';
      // liteから移植: luminanceMaskが有効な場合はnormalを維持
      if (this.container) {
        this.container.style.mixBlendMode = this.luminanceMaskEnabled ? 'normal' : this.currentBlendMode;
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

    async loadCSM() {
      if (this.csmLoaded) return;
      // three-csm は Three.js r128 と互換性があるバージョンを試みる
      // 失敗した場合は自前の FallbackCSM を使用
      try {
        const mod = await import('https://cdn.jsdelivr.net/npm/three-csm@1.1.2/build/three-csm.module.min.js');
        const Cls = mod.CSM || mod.default;
        if (typeof Cls === 'function') {
          this.CSMClass = Cls;
          this.csmLoaded = true;
          console.log('three-csm (library) loaded');
          return;
        }
      } catch (_) { /* fallthrough */ }
      // ライブラリが使えない環境向け：純粋な自前実装
      this.CSMClass = this._buildFallbackCSM();
      this.csmLoaded = true;
      console.log('three-csm (fallback) loaded');
    }

    /**
     * three-csm が利用できない環境向けの軽量フォールバック実装。
     * DirectionalLight を cascades 個生成し、各カスケードの near/far と
     * シャドウカメラ範囲をカメラの視錐台から毎フレーム計算する。
     */
    _buildFallbackCSM() {
      class FallbackCSM {
        constructor({ camera, parent, cascades, maxFar, shadowMapSize, lightDirection }) {
          this.camera        = camera;
          this.parent        = parent;
          this.cascades      = Math.max(1, Math.min(cascades, 4));
          this.maxFar        = maxFar;
          this.shadowMapSize = shadowMapSize;
          this.lightDir      = lightDirection
            ? lightDirection.clone().normalize()
            : new THREE.Vector3(-1, -2, -1).normalize();
          this.lights        = [];

          for (let i = 0; i < this.cascades; i++) {
            const light = new THREE.DirectionalLight(0xffffff, 1.2);
            light.castShadow = true;
            light.shadow.mapSize.set(this.shadowMapSize, this.shadowMapSize);
            light.shadow.bias = -0.0005;
            parent.add(light);
            parent.add(light.target);
            this.lights.push(light);
          }
          this.update();
        }

        // 毎フレーム呼ぶ：視錐台からカスケード分割を計算してシャドウカメラを更新
        update() {
          const cam    = this.camera;
          const near   = cam.near;
          const far    = Math.min(cam.far, this.maxFar);
          const lambda = 0.85; // 対数分割と均等分割の混合係数

          const splits = [];
          for (let i = 0; i <= this.cascades; i++) {
            const p   = i / this.cascades;
            const log = near * Math.pow(far / near, p);
            const uni = near + (far - near) * p;
            splits.push(lambda * log + (1 - lambda) * uni);
          }

          const getFrustumCorners = (nearD, farD) => {
            const tanHalfFov = Math.tan((cam.fov * Math.PI / 180) / 2);
            const aspect     = cam.aspect;
            const corners    = [];
            for (const z of [nearD, farD]) {
              const h = tanHalfFov * z;
              const w = h * aspect;
              for (const [sx, sy] of [[-1,-1],[1,-1],[-1,1],[1,1]]) {
                const v = new THREE.Vector3(sx * w, sy * h, -z);
                v.applyMatrix4(cam.matrixWorld);
                corners.push(v);
              }
            }
            return corners;
          };

          for (let i = 0; i < this.cascades; i++) {
            const corners = getFrustumCorners(splits[i], splits[i + 1]);
            const center  = new THREE.Vector3();
            corners.forEach(c => center.add(c));
            center.divideScalar(corners.length);

            // テクセルスナッピング（影のちらつき防止）
            let radius = 0;
            corners.forEach(c => { radius = Math.max(radius, center.distanceTo(c)); });
            const texelSize = (radius * 2) / this.shadowMapSize;
            center.x = Math.round(center.x / texelSize) * texelSize;
            center.y = Math.round(center.y / texelSize) * texelSize;
            center.z = Math.round(center.z / texelSize) * texelSize;

            const light = this.lights[i];
            light.position.copy(center).addScaledVector(this.lightDir, -radius * 2);
            light.target.position.copy(center);
            light.target.updateMatrixWorld();

            const sc = light.shadow.camera;
            sc.left = sc.bottom = -radius;
            sc.right = sc.top   =  radius;
            sc.near  = 0.1;
            sc.far   = radius * 6;
            sc.updateProjectionMatrix();
          }
        }

        // setupMaterial は不要（通常のshadow mapで動作）
        setupMaterial(_m) {}

        dispose() {
          this.lights.forEach(l => {
            this.parent.remove(l.target);
            this.parent.remove(l);
            if (l.shadow.map) l.shadow.map.dispose();
          });
          this.lights = [];
        }
      }
      return FallbackCSM;
    }

    async setupCSM(args) {
      await this.init();
      if (!this.isInitialized) return;

      if (!this.csmLoaded) {
        try { await this.loadCSM(); } catch(e) {
          console.error('CSM load failed:', e);
          return;
        }
      }

      const cascades = Math.max(1, Math.min(4, Math.round(Scratch.Cast.toNumber(args.CASCADES))));
      const maxFar   = Scratch.Cast.toNumber(args.DISTANCE);
      const mapSize  = Math.min(4096, Math.max(64,
                         Math.pow(2, Math.round(Math.log2(Scratch.Cast.toNumber(args.MAPSIZE))))));

      // 既存のCSMを破棄
      if (this.csm) {
        this.csm.dispose();
        this.csm = null;
      }

      // デフォルトDirectionalLight(ID:1)のシャドウを無効化（CSMが代替するため）
      const defaultLight = this.lights.get(1);
      if (defaultLight) {
        defaultLight.castShadow = false;
        defaultLight.visible    = false;
      }

      this.csm = new this.CSMClass({
        maxFar,
        cascades,
        shadowMapSize: mapSize,
        lightDirection: new THREE.Vector3(1, -1, 1).normalize(),
        camera:  this.camera,
        parent:  this.scene,
        mode:    'practical',
        shadowBias: 0.0001,
      });

      // 全メッシュにCSMマテリアル設定（ライブラリ版のみ必要、fallbackはno-op）
      this.scene.traverse(obj => {
        if (obj.isMesh && obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach(m => this.csm.setupMaterial(m));
          obj.castShadow    = true;
          obj.receiveShadow = true;
        }
      });

      this.csmEnabled = true;
      console.log(`CSM initialized: cascades=${cascades}, maxFar=${maxFar}, mapSize=${mapSize}`);
    }

    enableCSM(args) {
      const enable = args.ENABLE === 'on';
      this.csmEnabled = enable;
      if (this.csm) {
        this.csm.lights.forEach(l => { l.visible = enable; });
      }
      // デフォルトDirectionalLight(ID:1)との切り替え
      const defaultLight = this.lights.get(1);
      if (defaultLight) {
        defaultLight.castShadow = !enable;
        defaultLight.visible    = !enable;
      }
      console.log(`CSM ${enable ? 'enabled' : 'disabled'}`);
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
        this._lastFrameTime = undefined;
        this._physicsAccumulator = 0;
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
