(function(Scratch) {
  'use strict';

  class ThreeDExtension {
    constructor() {
      this.scene = null;
      this.camera = null;
      this.renderer = null;
      this.objects = [];
      this.isInitialized = false;
      this.container = null;
      this.positionUpdateInterval = null;
      this.stageElement = null;
      this.stageCanvas = null;
      this.spriteLayer = null;
      this.compositeCanvas = null;
      this.compositeContext = null;
      this.adjustmentX = 1;
      this.adjustmentY = 1;
      this.isFullscreen = false;
      this.spriteDepthMode = 'front';
      this.renderOrder = 'background-3d-sprites';
      this.currentBlendMode = 'source-over';
      this.current3DOpacity = 0.9;
      this.lights = [];
      this.animationId = null;
      
      this.loadThreeJS();
    }

    loadThreeJS() {
      if (typeof THREE !== 'undefined') {
        return;
      }
      
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
      script.onload = () => {
        console.log('Three.js loaded successfully');
      };
      script.onerror = () => {
        console.error('Failed to load Three.js');
      };
      document.head.appendChild(script);
    }

    getInfo() {
      return {
        id: 'threedee',
        name: '3D表示',
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
            opcode: 'setRenderOrder',
            blockType: Scratch.BlockType.COMMAND,
            text: '描画順序を [ORDER] にする',
            arguments: {
              ORDER: {
                type: Scratch.ArgumentType.STRING,
                menu: 'renderOrders',
                defaultValue: 'background-3d-sprites'
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
            text: '合成モードを [MODE] にする',
            arguments: {
              MODE: {
                type: Scratch.ArgumentType.STRING,
                menu: 'blendModes',
                defaultValue: 'normal'
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
          '---',
          {
            opcode: 'getObjectCount',
            blockType: Scratch.BlockType.REPORTER,
            text: 'オブジェクト数'
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
          renderOrders: {
            acceptReporters: false,
            items: [
              { text: '背景→3D→スプライト', value: 'background-3d-sprites' },
              { text: '背景→スプライト→3D', value: 'background-sprites-3d' },
              { text: 'スプライト→背景→3D', value: 'sprites-background-3d' },
              { text: 'スプライト→3D→背景', value: 'sprites-3d-background' }
            ]
          },
          blendModes: {
            acceptReporters: false,
            items: [
              { text: '通常', value: 'source-over' },
              { text: '乗算', value: 'multiply' },
              { text: 'スクリーン', value: 'screen' },
              { text: 'オーバーレイ', value: 'overlay' },
              { text: 'ソフトライト', value: 'soft-light' },
              { text: 'ハードライト', value: 'hard-light' },
              { text: '差', value: 'difference' },
              { text: '除外', value: 'exclusion' }
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
          }
        }
      };
    }

    init() {
      if (this.isInitialized) {
        return;
      }
      
      if (typeof THREE === 'undefined') {
        console.error('Three.js is not loaded yet');
        setTimeout(() => this.init(), 100);
        return;
      }
      
      try {
        // シーン作成
        this.scene = new THREE.Scene();
        
        // カメラ設定
        this.camera = new THREE.PerspectiveCamera(75, 480/360, 0.1, 1000);
        this.camera.position.set(0, 0, 5);
        this.camera.lookAt(0, 0, 0);
        
        // レンダラー設定
        this.renderer = new THREE.WebGLRenderer({ 
          antialias: true,
          alpha: true,
          preserveDrawingBuffer: true
        });
        this.renderer.setSize(480, 360);
        this.renderer.setClearColor(0x000000, 0);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        
        // デフォルトライト追加
        const light = new THREE.DirectionalLight(0xffffff, 1);
        light.position.set(1, 1, 1);
        light.castShadow = true;
        this.scene.add(light);
        this.lights.push(light);
        
        const ambientLight = new THREE.AmbientLight(0x404040, 0.4);
        this.scene.add(ambientLight);
        this.lights.push(ambientLight);
        
        this.isInitialized = true;
        
        // ステージ監視を開始
        this.startStageMonitoring();
        this.setupCompositing();
        this.animate();
        
        console.log('3D extension initialized successfully');
      } catch (error) {
        console.error('3D initialization error:', error);
      }
    }

    setupCompositing() {
      setTimeout(() => {
        this.findStageCanvas();
        if (this.stageCanvas) {
          this.setupCanvasComposition();
        } else {
          this.setupOverlayMode();
        }
      }, 1000);
    }

    findStageCanvas() {
      const selectors = [
        'canvas',
        '.stage canvas',
        'div[class*="stage"] canvas',
        'div[class*="Stage"] canvas'
      ];
      
      for (const selector of selectors) {
        const canvas = document.querySelector(selector);
        if (canvas && canvas.width >= 300 && canvas.height >= 200) {
          this.stageCanvas = canvas;
          this.stageElement = canvas.parentElement;
          console.log('Stage canvas found');
          return true;
        }
      }
      return false;
    }

    setupCanvasComposition() {
      if (!this.stageCanvas) return;
      
      try {
        // 合成用キャンバス作成
        this.compositeCanvas = document.createElement('canvas');
        this.compositeContext = this.compositeCanvas.getContext('2d');
        
        // スタイルコピー
        this.compositeCanvas.style.cssText = this.stageCanvas.style.cssText;
        this.compositeCanvas.className = this.stageCanvas.className;
        
        // 置き換え
        this.stageCanvas.parentNode.insertBefore(this.compositeCanvas, this.stageCanvas);
        this.stageCanvas.style.display = 'none';
        this.renderer.domElement.style.display = 'none';
        
        console.log('Canvas composition setup complete');
      } catch (error) {
        console.error('Canvas composition error:', error);
        this.setupOverlayMode();
      }
    }

    setupOverlayMode() {
      this.container = document.createElement('div');
      this.container.style.position = 'fixed';
      this.container.style.zIndex = '9999';
      this.container.style.pointerEvents = 'none';
      this.container.appendChild(this.renderer.domElement);
      document.body.appendChild(this.container);
      console.log('Overlay mode setup complete');
    }

    startStageMonitoring() {
      this.positionUpdateInterval = setInterval(() => {
        this.updateSizeAndPosition();
      }, 100);
      
      window.addEventListener('resize', () => this.updateSizeAndPosition());
    }

    updateSizeAndPosition() {
      if (!this.renderer || !this.camera) return;
      
      if (this.compositeCanvas && this.stageCanvas) {
        const width = this.stageCanvas.width;
        const height = this.stageCanvas.height;
        
        this.compositeCanvas.width = width;
        this.compositeCanvas.height = height;
        this.renderer.setSize(width, height);
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        
      } else if (this.container && this.stageElement) {
        const rect = this.stageElement.getBoundingClientRect();
        const width = rect.width;
        const height = rect.height;
        
        this.container.style.width = width + 'px';
        this.container.style.height = height + 'px';
        this.renderer.setSize(width, height);
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        
        this.container.style.left = (rect.left + window.scrollX) + 'px';
        this.container.style.top = (rect.top + window.scrollY) + 'px';
      }
    }

    animate() {
      if (!this.isInitialized) return;
      
      this.animationId = requestAnimationFrame(() => this.animate());
      
      if (this.compositeCanvas && this.stageCanvas) {
        this.compositeStageAnd3D();
      }
      
      this.renderer.render(this.scene, this.camera);
    }

    compositeStageAnd3D() {
      if (!this.compositeContext || !this.stageCanvas) return;
      
      try {
        const width = this.compositeCanvas.width;
        const height = this.compositeCanvas.height;
        
        this.compositeContext.clearRect(0, 0, width, height);
        
        // 描画順序に応じた合成
        switch (this.renderOrder) {
          case 'background-3d-sprites':
            this.compositeContext.drawImage(this.stageCanvas, 0, 0, width, height);
            this.draw3D();
            break;
          case 'background-sprites-3d':
            this.compositeContext.drawImage(this.stageCanvas, 0, 0, width, height);
            this.draw3D();
            break;
          case 'sprites-background-3d':
            this.draw3D();
            this.compositeContext.globalCompositeOperation = 'source-over';
            this.compositeContext.drawImage(this.stageCanvas, 0, 0, width, height);
            break;
          case 'sprites-3d-background':
            this.draw3D();
            this.compositeContext.globalCompositeOperation = 'source-over';
            this.compositeContext.drawImage(this.stageCanvas, 0, 0, width, height);
            break;
          default:
            this.compositeContext.drawImage(this.stageCanvas, 0, 0, width, height);
            this.draw3D();
        }
      } catch (error) {
        // エラーは無視
      }
    }

    draw3D() {
      if (this.renderer && this.renderer.domElement) {
        this.compositeContext.globalCompositeOperation = this.currentBlendMode;
        this.compositeContext.globalAlpha = this.current3DOpacity;
        this.compositeContext.drawImage(
          this.renderer.domElement, 
          0, 0, 
          this.compositeCanvas.width, 
          this.compositeCanvas.height
        );
        this.compositeContext.globalCompositeOperation = 'source-over';
        this.compositeContext.globalAlpha = 1.0;
      }
    }

    addCube(args) {
      if (!this.isInitialized) this.init();
      if (!this.isInitialized || typeof THREE === 'undefined') return;
      
      const size = Scratch.Cast.toNumber(args.SIZE);
      const color = args.COLOR;
      
      const geometry = new THREE.BoxGeometry(size, size, size);
      const material = new THREE.MeshPhongMaterial({ 
        color: parseInt(color.slice(1), 16),
        transparent: true,
        opacity: 0.9
      });
      const cube = new THREE.Mesh(geometry, material);
      cube.castShadow = true;
      cube.receiveShadow = true;
      
      this.scene.add(cube);
      this.objects.push(cube);
    }

    addSphere(args) {
      if (!this.isInitialized) this.init();
      if (!this.isInitialized || typeof THREE === 'undefined') return;
      
      const radius = Scratch.Cast.toNumber(args.RADIUS);
      const color = args.COLOR;
      
      const geometry = new THREE.SphereGeometry(radius, 32, 32);
      const material = new THREE.MeshPhongMaterial({ 
        color: parseInt(color.slice(1), 16),
        transparent: true,
        opacity: 0.9
      });
      const sphere = new THREE.Mesh(geometry, material);
      sphere.castShadow = true;
      sphere.receiveShadow = true;
      
      this.scene.add(sphere);
      this.objects.push(sphere);
    }

    addCylinder(args) {
      if (!this.isInitialized) this.init();
      if (!this.isInitialized || typeof THREE === 'undefined') return;
      
      const radius = Scratch.Cast.toNumber(args.RADIUS);
      const height = Scratch.Cast.toNumber(args.HEIGHT);
      const color = args.COLOR;
      
      const geometry = new THREE.CylinderGeometry(radius, radius, height, 32);
      const material = new THREE.MeshPhongMaterial({ 
        color: parseInt(color.slice(1), 16),
        transparent: true,
        opacity: 0.9
      });
      const cylinder = new THREE.Mesh(geometry, material);
      cylinder.castShadow = true;
      cylinder.receiveShadow = true;
      
      this.scene.add(cylinder);
      this.objects.push(cylinder);
    }

    addPlane(args) {
      if (!this.isInitialized) this.init();
      if (!this.isInitialized || typeof THREE === 'undefined') return;
      
      const width = Scratch.Cast.toNumber(args.WIDTH);
      const height = Scratch.Cast.toNumber(args.HEIGHT);
      const color = args.COLOR;
      
      const geometry = new THREE.PlaneGeometry(width, height);
      const material = new THREE.MeshPhongMaterial({ 
        color: parseInt(color.slice(1), 16),
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide
      });
      const plane = new THREE.Mesh(geometry, material);
      plane.castShadow = true;
      plane.receiveShadow = true;
      
      this.scene.add(plane);
      this.objects.push(plane);
    }

    setObjectPosition(args) {
      if (!this.isInitialized) return;
      
      const id = Scratch.Cast.toNumber(args.ID) - 1;
      if (!this.objects[id]) return;
      
      const obj = this.objects[id];
      obj.position.set(
        Scratch.Cast.toNumber(args.X),
        Scratch.Cast.toNumber(args.Y),
        Scratch.Cast.toNumber(args.Z)
      );
    }

    moveObject(args) {
      if (!this.isInitialized) return;
      
      const id = Scratch.Cast.toNumber(args.ID) - 1;
      if (!this.objects[id]) return;
      
      const obj = this.objects[id];
      obj.position.x += Scratch.Cast.toNumber(args.X);
      obj.position.y += Scratch.Cast.toNumber(args.Y);
      obj.position.z += Scratch.Cast.toNumber(args.Z);
    }

    setObjectRotation(args) {
      if (!this.isInitialized) return;
      
      const id = Scratch.Cast.toNumber(args.ID) - 1;
      if (!this.objects[id]) return;
      
      const obj = this.objects[id];
      obj.rotation.x = Scratch.Cast.toNumber(args.X) * (Math.PI/180);
      obj.rotation.y = Scratch.Cast.toNumber(args.Y) * (Math.PI/180);
      obj.rotation.z = Scratch.Cast.toNumber(args.Z) * (Math.PI/180);
    }

    rotateObject(args) {
      if (!this.isInitialized) return;
      
      const id = Scratch.Cast.toNumber(args.ID) - 1;
      if (!this.objects[id]) return;
      
      const obj = this.objects[id];
      obj.rotation.x += Scratch.Cast.toNumber(args.X) * (Math.PI/180);
      obj.rotation.y += Scratch.Cast.toNumber(args.Y) * (Math.PI/180);
      obj.rotation.z += Scratch.Cast.toNumber(args.Z) * (Math.PI/180);
    }

    setObjectScale(args) {
      if (!this.isInitialized) return;
      
      const id = Scratch.Cast.toNumber(args.ID) - 1;
      if (!this.objects[id]) return;
      
      const obj = this.objects[id];
      obj.scale.set(
        Scratch.Cast.toNumber(args.X),
        Scratch.Cast.toNumber(args.Y),
        Scratch.Cast.toNumber(args.Z)
      );
    }

    setObjectColor(args) {
      if (!this.isInitialized) return;
      
      const id = Scratch.Cast.toNumber(args.ID) - 1;
      if (!this.objects[id]) return;
      
      const obj = this.objects[id];
      const color = args.COLOR;
      obj.material.color.setHex(parseInt(color.slice(1), 16));
    }

    setObjectOpacity(args) {
      if (!this.isInitialized) return;
      
      const id = Scratch.Cast.toNumber(args.ID) - 1;
      if (!this.objects[id]) return;
      
      const obj = this.objects[id];
      const opacity = Math.max(0, Math.min(1, Scratch.Cast.toNumber(args.OPACITY)));
      obj.material.opacity = opacity;
      obj.material.transparent = opacity < 1;
    }

    removeObject(args) {
      if (!this.isInitialized) return;
      
      const id = Scratch.Cast.toNumber(args.ID) - 1;
      if (!this.objects[id]) return;
      
      const obj = this.objects[id];
      this.scene.remove(obj);
      
      // ジオメトリとマテリアルを削除
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
      
      // 配列から削除
      this.objects.splice(id, 1);
    }

    setCameraPosition(args) {
      if (!this.isInitialized) return;
      
      this.camera.position.set(
        Scratch.Cast.toNumber(args.X),
        Scratch.Cast.toNumber(args.Y),
        Scratch.Cast.toNumber(args.Z)
      );
      this.camera.lookAt(0, 0, 0);
    }

    moveCamera(args) {
      if (!this.isInitialized) return;
      
      this.camera.position.x += Scratch.Cast.toNumber(args.X);
      this.camera.position.y += Scratch.Cast.toNumber(args.Y);
      this.camera.position.z += Scratch.Cast.toNumber(args.Z);
      this.camera.lookAt(0, 0, 0);
    }

    setCameraRotation(args) {
      if (!this.isInitialized) return;
      
      this.camera.rotation.x = Scratch.Cast.toNumber(args.X) * (Math.PI/180);
      this.camera.rotation.y = Scratch.Cast.toNumber(args.Y) * (Math.PI/180);
      this.camera.rotation.z = Scratch.Cast.toNumber(args.Z) * (Math.PI/180);
    }

    lookAtObject(args) {
      if (!this.isInitialized) return;
      
      const id = Scratch.Cast.toNumber(args.ID) - 1;
      if (!this.objects[id]) return;
      
      const obj = this.objects[id];
      this.camera.lookAt(obj.position);
    }

    lookAtPosition(args) {
      if (!this.isInitialized) return;
      
      this.camera.lookAt(
        Scratch.Cast.toNumber(args.X),
        Scratch.Cast.toNumber(args.Y),
        Scratch.Cast.toNumber(args.Z)
      );
    }

    setRenderOrder(args) {
      this.renderOrder = args.ORDER;
    }

    set3DOpacity(args) {
      this.current3DOpacity = Math.max(0, Math.min(1, Scratch.Cast.toNumber(args.OPACITY)));
    }

    setBlendMode(args) {
      const modeMap = {
        'normal': 'source-over',
        'multiply': 'multiply',
        'screen': 'screen',
        'overlay': 'overlay',
        'soft-light': 'soft-light',
        'hard-light': 'hard-light',
        'difference': 'difference',
        'exclusion': 'exclusion'
      };
      
      this.currentBlendMode = modeMap[args.MODE] || 'source-over';
    }

    addLight(args) {
      if (!this.isInitialized) this.init();
      if (!this.isInitialized || typeof THREE === 'undefined') return;
      
      const type = args.TYPE;
      const color = parseInt(args.COLOR.slice(1), 16);
      const intensity = Scratch.Cast.toNumber(args.INTENSITY);
      
      let light;
      
      switch (type) {
        case 'directional':
          light = new THREE.DirectionalLight(color, intensity);
          light.position.set(1, 1, 1);
          light.castShadow = true;
          break;
        case 'point':
          light = new THREE.PointLight(color, intensity, 100);
          light.position.set(0, 0, 0);
          light.castShadow = true;
          break;
        case 'ambient':
          light = new THREE.AmbientLight(color, intensity);
          break;
        default:
          return;
      }
      
      this.scene.add(light);
      this.lights.push(light);
    }

    setLightPosition(args) {
      if (!this.isInitialized) return;
      
      const id = Scratch.Cast.toNumber(args.ID) - 1;
      if (!this.lights[id] || !this.lights[id].position) return;
      
      const light = this.lights[id];
      light.position.set(
        Scratch.Cast.toNumber(args.X),
        Scratch.Cast.toNumber(args.Y),
        Scratch.Cast.toNumber(args.Z)
      );
    }

    getObjectCount() {
      return this.objects.length;
    }

    getObjectPosition(args) {
      if (!this.isInitialized) return 0;
      
      const id = Scratch.Cast.toNumber(args.ID) - 1;
      if (!this.objects[id]) return 0;
      
      const obj = this.objects[id];
      const axis = args.AXIS;
      
      switch (axis) {
        case 'x': return obj.position.x;
        case 'y': return obj.position.y;
        case 'z': return obj.position.z;
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

    clearScene() {
      if (!this.isInitialized) return;
      
      // すべてのオブジェクトを削除
      for (const obj of this.objects) {
        this.scene.remove(obj);
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) obj.material.dispose();
      }
      this.objects = [];
      
      // カスタムライトを削除（デフォルトライト以外）
      const lightsToRemove = this.lights.slice(2); // 最初の2つはデフォルトライト
      for (const light of lightsToRemove) {
        this.scene.remove(light);
      }
      this.lights = this.lights.slice(0, 2);
      
      console.log('3D scene cleared');
    }

    pause3D() {
      if (this.animationId) {
        cancelAnimationFrame(this.animationId);
        this.animationId = null;
      }
      if (this.positionUpdateInterval) {
        clearInterval(this.positionUpdateInterval);
        this.positionUpdateInterval = null;
      }
    }

    resume3D() {
      if (!this.animationId && this.isInitialized) {
        this.animate();
      }
      if (!this.positionUpdateInterval) {
        this.startStageMonitoring();
      }
    }

    // クリーンアップメソッド
    dispose() {
      this.pause3D();
      
      if (this.renderer) {
        this.renderer.dispose();
      }
      
      if (this.container && this.container.parentNode) {
        this.container.parentNode.removeChild(this.container);
      }
      
      if (this.compositeCanvas && this.stageCanvas) {
        this.stageCanvas.style.display = '';
        if (this.compositeCanvas.parentNode) {
          this.compositeCanvas.parentNode.replaceChild(this.stageCanvas, this.compositeCanvas);
        }
      }
      
      this.clearScene();
      
      window.removeEventListener('resize', this.updateSizeAndPosition);
      
      this.isInitialized = false;
      
      console.log('3D extension disposed');
    }
  }

  // 拡張機能を登録
  Scratch.extensions.register(new ThreeDExtension());
})(Scratch);

